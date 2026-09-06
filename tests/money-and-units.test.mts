import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseCsvAmount, readCsvAmount, normalizeCsvDate } from "../src/lib/finance/csv-parser.ts";
import {
  bucketsWithin,
  currentPeriodBounds,
  customRangeFor,
  customRangeProblem,
  daysInMonth,
  exclusiveEndFor,
  inclusiveLastDay,
  monthRangeFor,
  shiftPeriodRange,
  trendRangesFor,
  trendUnitFor,
  weekRangeFor,
} from "../src/lib/finance/period.ts";
import { projectPayoff } from "../src/lib/finance/debt-payoff.ts";
import { incrementInDisplayUnit, smallestIncrementKg } from "../src/lib/workout/units.ts";
import { friendlyDbError } from "../src/lib/db-errors.ts";
import { guessCategoryForMerchant, normaliseMerchant } from "../src/lib/finance/categorise.ts";
import { balanceDeltaCents, txnIsIncome } from "../src/lib/finance/balance.ts";
import {
  adjustmentFor,
  appBalanceOnDate,
  monthEndCheckStatus,
  reconcileGapCents,
} from "../src/lib/finance/reconcile.ts";
import { daysBetweenDateStrings, formatDateOnlyInAppTimezone } from "../src/lib/time.ts";

/**
 * The first tests in this project.
 *
 * WHY THEY EXIST AND WHY THEY ARE ONLY THESE. CLAUDE.md's session protocol
 * tells `test-runner` to run `npm test`, and until now there was no such
 * script and no tests — so that instruction had been quietly doing nothing.
 * The 26 Aug 2026 audit listed it as a finding.
 *
 * Every case below is a bug that WAS REAL in this codebase and was proved by
 * running the code before it was fixed. This is a regression net for those
 * specific mistakes, not an attempt at coverage: the pure money and unit
 * helpers are exactly the code where a wrong answer is silent and expensive,
 * and they have no database or network to stand up. Anything needing Supabase
 * belongs in the `qa` agent's end-to-end pass instead.
 *
 * No test framework, no new dependency — node's own runner, and its native
 * TypeScript stripping. Run with `npm test`.
 */

// ---------------------------------------------------------------------------
// Bank CSV amounts
// ---------------------------------------------------------------------------

test("a withdrawal in accounting brackets is money OUT, not income", () => {
  // The original bug: stripping non-digits removed the brackets too, leaving a
  // positive number, so every withdrawal on such a statement was imported as
  // income and the balance moved the wrong way by twice the amount.
  const parsed = parseCsvAmount("(1,234.56)");
  assert.deepEqual(parsed, { cents: 123456, isIncome: false });
});

test("a trailing or leading minus is also money OUT", () => {
  assert.equal(parseCsvAmount("1234.56-")?.isIncome, false);
  assert.equal(parseCsvAmount("-1,234.56")?.isIncome, false);
});

test("a plain positive amount is money IN", () => {
  assert.deepEqual(parseCsvAmount("$1,234.56"), { cents: 123456, isIncome: true });
});

test("a comma used as a decimal separator is never silently guessed", () => {
  // `1234,56` stripped to digits is 123456 -> $1,234.56 read as $123,456.
  // `parseCsvAmount` is the strict view and returns null for these.
  assert.equal(parseCsvAmount("1234,56"), null);
  assert.equal(parseCsvAmount("1.234,56"), null);
  assert.equal(parseCsvAmount("1.234.567"), null);
});

test("an ambiguous amount is offered as a choice, not dropped", () => {
  // Alan's instruction: import what can be read and prompt for the rest,
  // because "reconciliation is the whole purpose of this in the first place"
  // and a line missing from a reconcile leaves an unexplainable difference.
  const result = readCsvAmount("1234,56");
  assert.equal(result.kind, "ambiguous");
  if (result.kind !== "ambiguous") return;
  assert.equal(result.readings.length, 2);
  const cents = result.readings.map((r) => r.cents).sort((a, b) => a - b);
  assert.deepEqual(cents, [123456, 12345600]);
  // Labels go on buttons, so they must read as money to a person.
  assert.ok(result.readings.every((r) => /^[\d,]+\.\d{2}$/.test(r.label)), result.readings.map((r) => r.label).join());
});

test("an ambiguous amount keeps its direction", () => {
  const out = readCsvAmount("(1234,56)");
  assert.equal(out.kind, "ambiguous");
  if (out.kind === "ambiguous") assert.equal(out.isIncome, false);
});

test("unambiguous amounts never come back as a question", () => {
  for (const clear of ["1,234.56", "(1,234.56)", "1234.56", "1,234", "$99.99"]) {
    assert.equal(readCsvAmount(clear).kind, "ok", `${clear} should not need confirming`);
  }
});

test("genuine junk is unreadable, not ambiguous", () => {
  for (const junk of ["", "   ", "abc", "n/a"]) {
    assert.equal(readCsvAmount(junk).kind, "unreadable", junk);
  }
});

test("a comma used as a thousands separator still works", () => {
  assert.deepEqual(parseCsvAmount("1,234"), { cents: 123400, isIncome: true });
});

test("junk and zero amounts return null rather than a zero transaction", () => {
  for (const bad of ["", "   ", "abc", "$0.00", "0"]) {
    assert.equal(parseCsvAmount(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("only unambiguous date formats are accepted", () => {
  assert.equal(normalizeCsvDate("2026-08-26"), "2026-08-26");
  assert.equal(normalizeCsvDate("08/26/2026"), "2026-08-26");
  assert.equal(normalizeCsvDate("not a date"), null);
});

// ---------------------------------------------------------------------------
// Budget periods
// ---------------------------------------------------------------------------

test("every day falls inside exactly one budget period, even at month end", () => {
  // The original bug: with a 31st anchor, `end` (exclusive) landed on 28 Feb,
  // so 28 February belonged to NO period — that day's spending was invisible
  // to budgets and safe-to-spend, then reappeared on 1 March.
  const anchor = "2026-01-31";
  for (const day of ["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-31", "2026-04-30"]) {
    const { start, end } = currentPeriodBounds("monthly", anchor, day);
    assert.ok(
      day >= start && day < end,
      `${day} fell outside its own period [${start}, ${end})`
    );
  }
});

test("weekly and biweekly periods contain their own day too", () => {
  for (const period of ["weekly", "biweekly"] as const) {
    for (const day of ["2026-08-24", "2026-08-26", "2026-09-04"]) {
      const { start, end } = currentPeriodBounds(period, "2026-08-03", day);
      assert.ok(day >= start && day < end, `${period}: ${day} outside [${start}, ${end})`);
    }
  }
});

test("daysInMonth clamps February correctly in leap and non-leap years", () => {
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2026, 4), 30);
});

// ---------------------------------------------------------------------------
// Debt payoff
// ---------------------------------------------------------------------------

const OPPOSED = [
  // Deliberately opposed: the SMALLEST balance carries the LOWEST rate, so the
  // two strategies must choose different debts to attack first.
  { id: "storecard", balanceCents: 50000, aprPct: 5, minPaymentCents: 2500 },
  { id: "visa", balanceCents: 500000, aprPct: 25, minPaymentCents: 10000 },
];

test("avalanche and snowball are different plans when there is a choice", () => {
  // The original bug: freed-up minimums were never rolled forward, which is
  // the entire definition of both strategies, so the two returned identical
  // results and both overstated the time and the interest.
  const { avalanche, snowball } = projectPayoff(OPPOSED, 20000);
  assert.notEqual(avalanche.payoffOrder[0], snowball.payoffOrder[0]);
});

test("avalanche always costs no more interest than snowball", () => {
  for (const extra of [0, 5000, 20000, 100000]) {
    const { avalanche, snowball } = projectPayoff(OPPOSED, extra);
    assert.ok(
      avalanche.totalInterestPaidCents <= snowball.totalInterestPaidCents,
      `at extra=${extra}, avalanche cost more interest than snowball`
    );
  }
});

test("a debt that cannot be paid off is flagged, not given a fabricated total", () => {
  // The original bug: this returned 137349425853, rendered on the debts screen
  // as "Interest paid $1,373,494,258.53" beside a correct "600+ mo".
  const { avalanche } = projectPayoff(
    [{ id: "x", balanceCents: 1000000, aprPct: 24, minPaymentCents: 1000 }],
    0
  );
  assert.equal(avalanche.neverPaysOff, true);
});

test("a payable debt is not flagged as impossible", () => {
  const { avalanche } = projectPayoff(
    [{ id: "x", balanceCents: 100000, aprPct: 10, minPaymentCents: 20000 }],
    0
  );
  assert.equal(avalanche.neverPaysOff, false);
  assert.ok(avalanche.monthsToPayoff > 0 && avalanche.monthsToPayoff < 600);
});

// ---------------------------------------------------------------------------
// Weight steps
// ---------------------------------------------------------------------------

test("the stepper moves 2.5 lb, not 1.1", () => {
  // The original bug: the kg helper was handed to the stepper, which works in
  // display units, so a lbs profile stepped by lbsToKg(2.5) = 1.13.
  assert.equal(incrementInDisplayUnit("lbs", null), 2.5);
  assert.equal(incrementInDisplayUnit("kg", null), 1);
});

test("a custom weight step is honoured, and nonsense falls back to the default", () => {
  assert.equal(incrementInDisplayUnit("lbs", 5), 5);
  assert.equal(incrementInDisplayUnit("lbs", 0), 2.5);
  assert.equal(incrementInDisplayUnit("lbs", -1), 2.5);
  assert.equal(incrementInDisplayUnit("lbs", Number.NaN), 2.5);
});

test("the kg helper still means kilograms", () => {
  // These two must never be swapped again — that swap is the whole bug.
  assert.ok(Math.abs(smallestIncrementKg("lbs", null) - 1.13398) < 1e-4);
  assert.equal(smallestIncrementKg("kg", null), 1);
});

// ---------------------------------------------------------------------------
// Database errors never reach Alan raw
// ---------------------------------------------------------------------------

test("a constraint violation becomes a sentence, not Postgres output", () => {
  const message = friendlyDbError({
    code: "23505",
    message:
      'duplicate key value violates unique constraint "reconciliations_user_account_date_idx"',
  });
  assert.ok(message && !message.includes("constraint"), "raw constraint text leaked");
  assert.match(message!, /already balanced this account/);
});

test("an unrecognised database error still never shows its raw text", () => {
  const raw = "some entirely unexpected postgres failure";
  const message = friendlyDbError({ code: "XX000", message: raw });
  assert.ok(message && !message.includes(raw));
});

test("no error means no message", () => {
  assert.equal(friendlyDbError(null), null);
  assert.equal(friendlyDbError(undefined), null);
});

// ---------------------------------------------------------------------------
// Filling the category in
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { id: "groc", name: "Groceries", kind: "expense" },
  { id: "take", name: "Takeout", kind: "expense" },
  { id: "trans", name: "Transport", kind: "expense" },
  { id: "salary", name: "Income: Salary", kind: "income" },
];

test("what you did before beats the keyword table", () => {
  // Superstore is in the keyword list as Groceries, but if this person has
  // filed it under Takeout four times, that is what they mean.
  const memory = [{ merchant: "Superstore", categoryId: "take", count: 4 }];
  const guess = guessCategoryForMerchant("Superstore", memory, CATEGORIES);
  assert.equal(guess?.categoryId, "take");
  assert.equal(guess?.source, "learned");
});

test("the most-used category wins, not the most recent", () => {
  // The old memory kept whichever it saw first, so one mis-categorised coffee
  // taught the form the wrong answer permanently.
  const memory = [
    { merchant: "Tim Hortons", categoryId: "groc", count: 1 },
    { merchant: "Tim Hortons", categoryId: "take", count: 11 },
  ];
  assert.equal(guessCategoryForMerchant("Tim Hortons", memory, CATEGORIES)?.categoryId, "take");
});

test("a half-typed merchant still matches a remembered one", () => {
  const memory = [{ merchant: "Real Canadian Superstore #4021", categoryId: "groc", count: 3 }];
  assert.equal(guessCategoryForMerchant("superstore", memory, CATEGORIES)?.categoryId, "groc");
});

test("two or three characters are too few to match on", () => {
  const memory = [{ merchant: "Real Canadian Superstore", categoryId: "groc", count: 3 }];
  assert.equal(guessCategoryForMerchant("re", memory, CATEGORIES), null);
});

test("an unknown merchant falls back to the keyword table", () => {
  const guess = guessCategoryForMerchant("PETRO-CANADA 0142", [], CATEGORIES);
  assert.equal(guess?.categoryId, "trans");
  assert.equal(guess?.source, "keyword");
});

test("a keyword naming a category you don't have guesses nothing", () => {
  // Better a blank category than resurrecting one that was deliberately
  // renamed or deleted.
  const withoutTransport = CATEGORIES.filter((c) => c.id !== "trans");
  assert.equal(guessCategoryForMerchant("PETRO-CANADA", [], withoutTransport), null);
});

test("an expense guess is never an income category, or the reverse", () => {
  const memory = [{ merchant: "Employer Inc", categoryId: "salary", count: 9 }];
  // Asked for an expense, the income memory must not be offered.
  assert.equal(guessCategoryForMerchant("Employer Inc", memory, CATEGORIES, "expense"), null);
  assert.equal(
    guessCategoryForMerchant("Employer Inc", memory, CATEGORIES, "income")?.categoryId,
    "salary"
  );
});

test("nothing recognisable guesses nothing rather than guessing badly", () => {
  assert.equal(guessCategoryForMerchant("zzzqqq", [], CATEGORIES), null);
  assert.equal(guessCategoryForMerchant("", [], CATEGORIES), null);
});

test("merchant spellings are normalised the same way everywhere", () => {
  assert.equal(normaliseMerchant("  Tim   HORTONS "), "tim hortons");
});

// ---------------------------------------------------------------------------
// Balance deltas and the reconcile gap
// ---------------------------------------------------------------------------
//
// Added 2 Sep 2026 with the balance-drift fixes. The bug these guard against
// was real: `logExpense` computed its balance move from a browser-sent
// income/expense flag while `deleteTransaction` derived it from the category's
// `kind` in the database — so a flag that disagreed with the category moved
// the balance one way on log and a different way on delete, and the drift
// stuck to the account forever. Both actions now derive direction from
// `categories.kind` and feed it through `balanceDeltaCents`; these tests pin
// down what that function must do for each account type.

test("an expense on a normal account takes money away", () => {
  assert.equal(balanceDeltaCents(1250, false, "chequing"), -1250);
  assert.equal(balanceDeltaCents(1250, false, "cash"), -1250);
});

test("income on a normal account adds money", () => {
  assert.equal(balanceDeltaCents(1250, true, "chequing"), 1250);
});

test("a credit card's balance is what's OWED, so the signs flip", () => {
  // Spending on the card means owing more (balance up); a payment or refund
  // means owing less (balance down).
  assert.equal(balanceDeltaCents(1250, false, "credit_card"), 1250);
  assert.equal(balanceDeltaCents(1250, true, "credit_card"), -1250);
});

test("the amount's own sign never smuggles a direction in", () => {
  // Direction comes ONLY from the income flag — a negative amount from any
  // caller must not double-flip the move.
  assert.equal(balanceDeltaCents(-1250, false, "chequing"), -1250);
  assert.equal(balanceDeltaCents(-1250, true, "credit_card"), -1250);
});

test("the reconcile gap is statement minus app, computed server-side", () => {
  // `finishReconciliation` used to accept the app-side balance from the
  // browser and subtract two client-sent numbers; the gap — the size of the
  // correcting transaction — is now this helper fed with a server-derived
  // app balance.
  assert.equal(reconcileGapCents(50000, 48000), 2000);
  assert.equal(reconcileGapCents(48000, 50000), -2000);
  assert.equal(reconcileGapCents(48000, 48000), 0);
});

test("the app balance on the statement date rewinds later transactions", () => {
  // Live chequing balance $100 after a $20 expense dated AFTER the statement:
  // on the statement date the app must have believed $120.
  assert.equal(
    appBalanceOnDate({
      currentBalanceCents: 10000,
      accountType: "chequing",
      transactionsAfterDate: [{ amount_cents: 2000, is_income: false }],
    }),
    12000
  );
  // Same rewind on a credit card runs the owed-balance signs backwards.
  assert.equal(
    appBalanceOnDate({
      currentBalanceCents: 10000,
      accountType: "credit_card",
      transactionsAfterDate: [{ amount_cents: 2000, is_income: false }],
    }),
    8000
  );
});

test("the posted adjustment always closes exactly the gap it was made for", () => {
  // Whatever direction `adjustmentFor` picks, pushing its transaction through
  // balanceDeltaCents must move the balance by precisely the difference —
  // on every account type, in both directions. This is the property the
  // whole reconcile flow rests on.
  for (const accountType of ["chequing", "credit_card", "cash", "investment"] as const) {
    for (const differenceCents of [2000, -2000]) {
      const adj = adjustmentFor(differenceCents, accountType);
      assert.ok(adj, `no adjustment for ${differenceCents} on ${accountType}`);
      assert.equal(
        balanceDeltaCents(adj.amountCents, adj.isIncome, accountType),
        differenceCents,
        `${accountType} gap of ${differenceCents} not closed`
      );
    }
  }
  assert.equal(adjustmentFor(0, "chequing"), null);
});

// ---------------------------------------------------------------------------
// Which way a transaction moved money
// ---------------------------------------------------------------------------
//
// Added 3 Sep 2026 with the transfer-direction fix (migration 0038). The bug:
// a transfer's two legs shared one expense holder category, and both delete
// and the reconcile rewind derived direction from `categories.kind` — so the
// INCOMING leg of a $100 transfer was treated as an expense, and deleting it
// moved the receiving balance +$100 instead of -$100. `txnIsIncome` is now
// the single place that rule lives; both reconcile paths feed through it.

test("an ordinary row's direction comes from its category kind", () => {
  assert.equal(
    txnIsIncome({ kind: "income", transferGroupId: null, transferDirection: null }),
    true
  );
  assert.equal(
    txnIsIncome({ kind: "expense", transferGroupId: null, transferDirection: null }),
    false
  );
});

test("a transfer leg's direction is its own column, never its holder category", () => {
  // Both legs carry kind "expense" — that's the bug this exists to prevent.
  assert.equal(
    txnIsIncome({ kind: "expense", transferGroupId: "g", transferDirection: "in" }),
    true
  );
  assert.equal(
    txnIsIncome({ kind: "expense", transferGroupId: "g", transferDirection: "out" }),
    false
  );
});

test("a legacy direction-less transfer leg keeps the old category behaviour", () => {
  // Pre-0038 legs never recorded which side received the money; there is
  // nothing truer to fall back on than the category kind, wrong as it was.
  // Production had zero such rows when 0038 shipped — this pins the fallback
  // so it stays deliberate, not accidental.
  assert.equal(
    txnIsIncome({ kind: "expense", transferGroupId: "g", transferDirection: null }),
    false
  );
});

// ---------------------------------------------------------------------------
// Date-only rendering
// ---------------------------------------------------------------------------

test("a bare YYYY-MM-DD renders as that same calendar day in Winnipeg", () => {
  // The bug this pins down: `new Date("2026-09-02")` is UTC *midnight*, which
  // in Winnipeg is the evening of 1 September — so transaction and statement
  // dates rendered a day early. The helper anchors bare dates to midday UTC
  // before formatting. en-CA with 2-digit fields formats back to YYYY-MM-DD,
  // which makes the round trip exact and locale-proof.
  const ymd = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
  assert.equal(formatDateOnlyInAppTimezone("2026-09-02", ymd), "2026-09-02");
  // Deep winter too — the offset is CST there, not CDT, and must not matter.
  assert.equal(formatDateOnlyInAppTimezone("2026-01-01", ymd), "2026-01-01");
  // And the exact shape of the original bug, shown not to happen.
  assert.notEqual(formatDateOnlyInAppTimezone("2026-09-02", ymd), "2026-09-01");
});

// ---------------------------------------------------------------------------
// Report periods — the week, and the week-start preference
// ---------------------------------------------------------------------------
//
// Reports only ever spoke in calendar months. Adding the week means adding a
// second definition of when a week begins unless it reuses `startOfWeek`, and
// means a whole new class of off-by-one: month boundaries, year boundaries,
// and the daylight-saving change. House rule — date maths gets tests.

test("week offset 0 is the week containing today, Monday to Sunday", () => {
  // Tue 1 Sep 2026. Monday-start: 31 Aug -> 6 Sep, `end` exclusive on 7 Sep.
  const r = weekRangeFor("2026-09-01", 0, "monday");
  assert.equal(r.start, "2026-08-31");
  assert.equal(r.end, "2026-09-07");
  assert.equal(r.longLabel, "31 Aug – 6 Sep 2026");
});

test("the week-start preference actually moves the week", () => {
  // Same Tuesday, Sunday-start: the week began the day before, 30 August.
  const r = weekRangeFor("2026-09-01", 0, "sunday");
  assert.equal(r.start, "2026-08-30");
  assert.equal(r.end, "2026-09-06");
  // The preference had existed since the streaks work and only `lib/ai/insights.ts`
  // ever read it, so both screens that showed weeks silently used Monday.
  assert.notEqual(r.start, weekRangeFor("2026-09-01", 0, "monday").start);
});

test("today itself always falls inside week offset 0, on either setting", () => {
  for (const start of ["monday", "sunday"] as const) {
    for (let day = 1; day <= 30; day++) {
      const today = `2026-09-${String(day).padStart(2, "0")}`;
      const r = weekRangeFor(today, 0, start);
      assert.ok(today >= r.start && today < r.end, `${today} (${start}) outside its own week`);
    }
  }
});

test("negative week offsets step back a clean seven days each", () => {
  assert.equal(weekRangeFor("2026-09-01", -1, "monday").start, "2026-08-24");
  assert.equal(weekRangeFor("2026-09-01", -5, "monday").start, "2026-07-27");
  assert.equal(weekRangeFor("2026-09-01", -5, "monday").end, "2026-08-03");
  assert.equal(weekRangeFor("2026-09-01", -5, "sunday").start, "2026-07-26");
});

test("a week spanning a month boundary is still one week, labelled with both months", () => {
  const r = weekRangeFor("2026-10-02", 0, "monday"); // Fri 2 Oct -> week of Mon 28 Sep
  assert.equal(r.start, "2026-09-28");
  assert.equal(r.end, "2026-10-05");
  assert.equal(r.longLabel, "28 Sep – 4 Oct 2026");
});

test("a week spanning a year boundary keeps both years", () => {
  const r = weekRangeFor("2027-01-01", 0, "monday"); // Fri 1 Jan 2027 -> week of Mon 28 Dec 2026
  assert.equal(r.start, "2026-12-28");
  assert.equal(r.end, "2027-01-04");
  assert.equal(r.longLabel, "28 Dec 2026 – 3 Jan 2027");
});

test("a week containing the Winnipeg daylight-saving change is still exactly seven days", () => {
  // Clocks go forward Sun 8 Mar 2026 and back Sun 1 Nov 2026. Both weeks must
  // contain exactly seven dates: the maths runs on YYYY-MM-DD strings at UTC
  // midnight precisely so an hour appearing or vanishing cannot shorten a week.
  for (const today of ["2026-03-09", "2026-11-02"]) {
    const r = weekRangeFor(today, -1, "monday");
    const days = daysBetweenDateStrings(r.start, r.end);
    assert.equal(days, 7, `week before ${today} was ${days} days`);
  }
  const spring = weekRangeFor("2026-03-09", -1, "monday");
  assert.equal(spring.start, "2026-03-02");
  assert.equal(spring.end, "2026-03-09"); // 8 March, the day the clocks moved, is inside it
  assert.ok("2026-03-08" >= spring.start && "2026-03-08" < spring.end);
});

test("months still work, and a month offset crossing a year does not produce month zero", () => {
  // The original bug: `((month - 1) % 12) + 1` kept the sign of its left
  // operand, so stepping back past January produced "2025-00-01", Postgres
  // rejected it, and the screen showed $0 spent rather than an error.
  const r = monthRangeFor("2026-01-15", -2);
  assert.equal(r.start, "2025-11-01");
  assert.equal(r.end, "2025-12-01");
  assert.equal(r.label, "Nov");
  assert.equal(r.longLabel, "November 2025");
});

test("the trend buckets end at the selected period and never overlap", () => {
  const weeks = trendRangesFor("2026-09-01", { unit: "week", offset: 0 }, 6, "monday");
  assert.equal(weeks.length, 6);
  assert.equal(weeks[5].start, "2026-08-31"); // last bucket is the selected week
  assert.equal(weeks[0].start, "2026-07-27");
  for (let i = 1; i < weeks.length; i++) {
    assert.equal(weeks[i - 1].end, weeks[i].start, "gap or overlap between trend buckets");
  }

  const months = trendRangesFor("2026-09-01", { unit: "month", offset: -1 }, 3, "monday");
  assert.deepEqual(months.map((m) => m.label), ["Jun", "Jul", "Aug"]);
});

test("a week's trend labels are days, not month names", () => {
  // Labels always travelled with the data; what they came from was a fixed
  // twelve-entry month-name table in the server action, which cannot name a
  // week at all. The table is gone and each range labels itself instead.
  const weeks = trendRangesFor("2026-09-01", { unit: "week", offset: 0 }, 2, "monday");
  assert.deepEqual(weeks.map((w) => w.label), ["24 Aug", "31 Aug"]);
});

// ---------------------------------------------------------------------------
// Shifting a range you already have, with no clock
// ---------------------------------------------------------------------------
//
// This is what the Reports navigator uses when the connection drops mid-tap.
// Getting it wrong means the heading names a different period from the one the
// arrows took you to, which is the exact lie the whole period module exists to
// prevent — so it is anchored on a date the server chose, never on `new Date()`.

test("a shifted month range crosses a year boundary correctly", () => {
  const january = monthRangeFor("2026-01-15", 0);
  assert.equal(shiftPeriodRange(january, "month", -1).longLabel, "December 2025");
  assert.equal(shiftPeriodRange(january, "month", -1).start, "2025-12-01");
  assert.equal(shiftPeriodRange(january, "month", 2).longLabel, "March 2026");
  // Shifting by nothing is the range you already had.
  assert.deepEqual(shiftPeriodRange(january, "month", 0), january);
});

test("a shifted week keeps the user's week start without being told it", () => {
  // Sunday weeks: shifting by whole weeks from a known Sunday can only land on
  // Sundays, so the preference travels with the anchor and is never guessed.
  const sundayWeek = weekRangeFor("2026-09-02", 0, "sunday");
  assert.equal(sundayWeek.start, "2026-08-30");
  const back = shiftPeriodRange(sundayWeek, "week", -1);
  assert.equal(back.start, "2026-08-23");
  assert.equal(back.end, "2026-08-30");
  assert.equal(back.longLabel, "23–29 Aug 2026");
});

test("shifting a week that crosses a month is labelled with both months", () => {
  const week = weekRangeFor("2026-09-02", 0, "monday"); // Mon 31 Aug – Sun 6 Sep
  assert.equal(shiftPeriodRange(week, "week", 0).longLabel, "31 Aug – 6 Sep 2026");
  assert.equal(shiftPeriodRange(week, "week", 1).longLabel, "7–13 Sep 2026");
});

test("shifting agrees with computing the same period from today", () => {
  // The offline answer must equal the online one, or the heading changes
  // meaning the moment the connection comes back.
  for (const offset of [-1, -3, -12, -13]) {
    const fromToday = monthRangeFor("2026-09-02", offset);
    const shifted = shiftPeriodRange(monthRangeFor("2026-09-02", 0), "month", offset);
    assert.deepEqual(shifted, fromToday, `month offset ${offset}`);

    const weekFromToday = weekRangeFor("2026-09-02", offset, "monday");
    const weekShifted = shiftPeriodRange(weekRangeFor("2026-09-02", 0, "monday"), "week", offset);
    assert.deepEqual(weekShifted, weekFromToday, `week offset ${offset}`);
  }
});

// ---------------------------------------------------------------------------
// Where a range ends — the money off-by-one
// ---------------------------------------------------------------------------
//
// `get_spending_by_category` filtered `.lte(to_date)`; the Reports screen
// filtered `.lt(range.end)`. Same question, two answers, a day apart. The
// tests below are the shapes of both filters run over transactions sitting
// exactly on the four boundary dates — a date-maths fix that is also a
// money-maths fix, so it gets tests twice over.

/** The four dates that can be got wrong, one transaction on each, in cents. */
const BOUNDARY_TXNS = [
  { date: "2026-07-31", cents: 1000 },
  { date: "2026-08-01", cents: 2000 },
  { date: "2026-08-31", cents: 4000 },
  { date: "2026-09-01", cents: 8000 },
];

/** What `.gte(start).lt(end)` — every query in the app — adds up to. */
function totalInHalfOpen(start: string, end: string): number {
  return BOUNDARY_TXNS.filter((t) => t.date >= start && t.date < end).reduce((s, t) => s + t.cents, 0);
}

test("the assistant and the Reports screen total the same August", () => {
  const reports = monthRangeFor("2026-08-15", 0);
  // What Reports counts.
  assert.equal(totalInHalfOpen(reports.start, reports.end), 6000);

  // What the tool counts now: a person's inclusive dates, translated once.
  const toolEnd = exclusiveEndFor("2026-08-31");
  assert.equal(toolEnd, reports.end);
  assert.equal(totalInHalfOpen("2026-08-01", toolEnd), 6000);

  // And the same question asked the other way the model phrases it — "to the
  // 1st of September" — is now a DIFFERENT question (1 Sep included), not the
  // same question with a different answer.
  assert.equal(totalInHalfOpen("2026-08-01", exclusiveEndFor("2026-09-01")), 14000);
});

test("the old inclusive filter really did add a day, so this stays fixed", () => {
  // The bug, reproduced: `.lte(to)` fed the range-shaped end date the overview
  // handed the model. $140 for a month that contained $60.
  const reports = monthRangeFor("2026-08-15", 0);
  const oldToolTotal = BOUNDARY_TXNS.filter(
    (t) => t.date >= reports.start && t.date <= reports.end
  ).reduce((s, t) => s + t.cents, 0);
  assert.equal(oldToolTotal, 14000);
  assert.notEqual(oldToolTotal, totalInHalfOpen(reports.start, reports.end));
});

test("nothing exclusive is ever shown to a person or a model", () => {
  // `get_money_overview` used to return the exclusive end as `period_end`,
  // which is the day AFTER the period. It now returns the last day included.
  const august = monthRangeFor("2026-08-15", 0);
  assert.equal(august.end, "2026-09-01");
  assert.equal(inclusiveLastDay(august.end), "2026-08-31");
  assert.equal(exclusiveEndFor(inclusiveLastDay(august.end)), august.end); // round trip
});

// ---------------------------------------------------------------------------
// Custom ranges — "since June"
// ---------------------------------------------------------------------------

test("a custom range takes two inclusive dates and returns an exclusive end", () => {
  const r = customRangeFor("2026-06-01", "2026-06-30");
  assert.equal(r.start, "2026-06-01");
  assert.equal(r.end, "2026-07-01"); // 30 June is inside it
  assert.ok("2026-06-30" >= r.start && "2026-06-30" < r.end);
  assert.equal(r.longLabel, "1–30 Jun 2026");
  assert.equal(r.label, "1–30 Jun");
});

test("a custom range collapses its label exactly like a week does", () => {
  // Same month: one month name. Same year, two months: one year. Two years:
  // both years. The rule is shared with `weekRangeFor`, so it cannot drift.
  assert.equal(customRangeFor("2026-06-01", "2026-08-15").longLabel, "1 Jun – 15 Aug 2026");
  assert.equal(customRangeFor("2025-12-29", "2026-01-04").longLabel, "29 Dec 2025 – 4 Jan 2026");
  assert.equal(weekRangeFor("2026-09-01", 0, "monday").longLabel, "31 Aug – 6 Sep 2026");
  // A single day is a range of one day, and reads as one day.
  const oneDay = customRangeFor("2026-06-03", "2026-06-03");
  assert.equal(oneDay.longLabel, "3 Jun 2026");
  assert.equal(oneDay.label, "3 Jun");
  assert.equal(oneDay.end, "2026-06-04");
});

test("the short label drops the year and the long label keeps it", () => {
  const r = customRangeFor("2025-06-01", "2026-08-15");
  assert.equal(r.label, "1 Jun – 15 Aug"); // chart axis
  assert.equal(r.longLabel, "1 Jun 2025 – 15 Aug 2026"); // heading
});

test("a custom range refuses what it cannot report on, in plain English", () => {
  // Malformed, in the three ways a model actually gets it wrong.
  for (const bad of ["June", "2026-6-1", "2026-02-30", ""]) {
    assert.match(
      customRangeProblem(bad, "2026-06-30") ?? "",
      /real days/,
      `"${bad}" should have been refused`
    );
  }
  // Backwards — refused, not silently swapped.
  assert.equal(customRangeProblem("2026-06-30", "2026-06-01"), "That range ends before it starts.");
  // Absurd span.
  assert.match(customRangeProblem("2015-01-01", "2026-06-01") ?? "", /five years/);
  // Typo'd year.
  assert.match(customRangeProblem("0226-06-01", "2026-06-30") ?? "", /outside the years/);
  // Hasn't started yet — only when a `today` is given to compare with.
  assert.match(
    customRangeProblem("2026-10-01", "2026-10-05", "2026-09-06") ?? "",
    /hasn't started yet/
  );
  assert.equal(customRangeProblem("2026-10-01", "2026-10-05"), null);
  // A single day and a perfectly ordinary range are fine.
  assert.equal(customRangeProblem("2026-06-03", "2026-06-03", "2026-09-06"), null);
  assert.equal(customRangeProblem("2026-06-01", "2026-09-06", "2026-09-06"), null);
});

test("building a range it would refuse throws that same sentence", () => {
  // One list of rules: the thrower and the answerer must never disagree about
  // what is legal, or a range refused by the screen builds fine in a tool.
  assert.throws(() => customRangeFor("2026-06-30", "2026-06-01"), /ends before it starts/);
  assert.throws(() => customRangeFor("June", "2026-06-30"), /real days/);
});

test("the trend buckets inside a custom range cover it exactly, with no day twice", () => {
  for (const [from, to] of [
    ["2026-06-01", "2026-09-06"], // part of September on the end
    ["2026-08-20", "2026-09-06"], // short: weekly bars, both ends clipped
    ["2026-06-03", "2026-06-03"], // one day
    ["2025-11-15", "2026-02-02"], // across a year boundary
  ]) {
    const range = customRangeFor(from, to);
    const buckets = bucketsWithin(range, trendUnitFor(range), "monday");
    assert.ok(buckets.length > 0, `${from}..${to} produced no buckets`);
    let cursor = range.start;
    for (const b of buckets) {
      assert.equal(b.start, cursor, `gap or overlap at ${b.start} in ${from}..${to}`);
      cursor = b.end;
    }
    assert.equal(cursor, range.end, `buckets stopped short in ${from}..${to}`);
  }
});

test("bucket size follows the length of the range, and the ends are clipped", () => {
  const quarter = customRangeFor("2026-06-01", "2026-09-06");
  assert.equal(trendUnitFor(quarter), "month");
  const months = bucketsWithin(quarter, "month");
  assert.deepEqual(months.map((b) => b.label), ["Jun", "Jul", "Aug", "Sep"]);
  // The last bar is a part month and must not run to the end of September.
  assert.equal(months[3].start, "2026-09-01");
  assert.equal(months[3].end, "2026-09-07");
  assert.equal(months[3].longLabel, "1–6 Sep 2026");

  const fortnight = customRangeFor("2026-08-20", "2026-09-06");
  assert.equal(trendUnitFor(fortnight), "week");
  const weeks = bucketsWithin(fortnight, "week", "monday");
  // The first bar starts on the 20th, not on the Monday before it.
  assert.equal(weeks[0].start, "2026-08-20");
  assert.equal(weeks[0].label, "20 Aug");
  assert.equal(weeks[1].start, "2026-08-24"); // then whole Monday weeks
});

test("too many bars changes the bucket rather than dropping bars", () => {
  // Five years of weekly bars is 260 of them. Asking for weeks anyway gets
  // months, and still covers every day — a truncated chart would be a wrong
  // picture with nothing on screen saying so.
  const fiveYears = customRangeFor("2021-09-07", "2026-09-06");
  const buckets = bucketsWithin(fiveYears, "week", "monday");
  assert.ok(buckets.length <= 64, `${buckets.length} buckets is too many to read`);
  assert.equal(buckets[0].start, fiveYears.start);
  assert.equal(buckets[buckets.length - 1].end, fiveYears.end);
});

// ---------------------------------------------------------------------------
// Is the month-end check due?
// ---------------------------------------------------------------------------

test("a statement from a month that has closed makes the check due", () => {
  assert.equal(monthEndCheckStatus("2026-08-28", "2026-09-01").due, true);
  assert.equal(monthEndCheckStatus("2026-08-28", "2026-09-01").monthsSince, 1);
  // Calendar months, not 30-day stretches: 28 August is stale on 1 September.
  assert.equal(monthEndCheckStatus("2026-12-31", "2027-01-01").monthsSince, 1);
});

test("a statement from the current month is not yet due", () => {
  assert.equal(monthEndCheckStatus("2026-09-01", "2026-09-30").due, false);
  assert.equal(monthEndCheckStatus("2026-09-01", "2026-09-30").monthsSince, 0);
});

test("never having reconciled is said plainly, not dressed up as zero months", () => {
  const status = monthEndCheckStatus(null, "2026-09-01");
  assert.equal(status.due, true);
  assert.equal(status.neverReconciled, true);
  assert.equal(status.monthsSince, null);
});

test("brand-new books are not nagged on day one", () => {
  // Nothing reconciled, but the first account was opened this morning: there
  // is no closed month to check, so nothing is due. Being told off on day one
  // is how a monthly prompt teaches you to ignore it.
  const fresh = monthEndCheckStatus(null, "2026-09-05", "2026-09-05");
  assert.equal(fresh.due, false);
  assert.equal(fresh.neverReconciled, true);
  assert.equal(fresh.monthsSince, null);

  // Same books a month later, still never reconciled: now it is due.
  const later = monthEndCheckStatus(null, "2026-10-01", "2026-09-05");
  assert.equal(later.due, true);
  assert.equal(later.neverReconciled, true);

  // Called without the start date at all, the old unqualified answer stands —
  // that is what keeps every existing caller behaving exactly as before.
  assert.equal(monthEndCheckStatus(null, "2026-09-05").due, true);
});

// ---------------------------------------------------------------------------
// One answer per money question — the assistant's tools, read as text
// ---------------------------------------------------------------------------
//
// Added 6 Sep 2026, after a review found that `get_spending_by_category` had
// never actually been moved onto the shared report query even though the wave
// that claimed to end the two-answers problem said it had. Three real
// differences survived in it: it read one response and so stopped at the API's
// 1000-row cap while the Reports screen paged to 60,000; it counted anything
// that was not income as spending where the shared query counts
// `kind = 'expense'` only; and, earlier, it turned the end of the range into a
// different day. All three produce a wrong TOTAL with no error anywhere.
//
// These are text checks, not behaviour checks, because lib/ai/tools.ts is
// `server-only` and cannot be imported by the plain-node runner (the same
// reason tests/ai-suggestions.test.mts reads it as text). A text check is
// weaker than running the code, but it catches the thing that actually keeps
// happening here: someone writing a second copy of a money query.

const TOOLS_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/lib/ai/tools.ts", import.meta.url)),
  "utf8"
);

/**
 * One tool's source, from its `name:` line to the `};` that closes its object.
 * Every tool in that file is a top-level `const`, so the first line that is
 * exactly `};` after the name is the end of that tool and nothing else.
 */
function toolSource(name: string): string {
  const start = TOOLS_SOURCE.indexOf(`name: "${name}"`);
  assert.notEqual(start, -1, `${name} no longer exists in lib/ai/tools.ts`);
  const after = TOOLS_SOURCE.slice(start);
  const end = after.indexOf("\n};");
  return end === -1 ? after : after.slice(0, end);
}

test("the assistant's category totals come from the shared query, not a second copy", () => {
  const src = toolSource("get_spending_by_category");
  assert.ok(
    src.includes("queryCategorySpend("),
    "get_spending_by_category must total categories with the shared queryCategorySpend"
  );
  assert.ok(
    src.includes("queryIncomeTotal("),
    "get_spending_by_category must take income from the shared queryIncomeTotal"
  );
  // The moment it queries transactions itself, it can page differently, filter
  // differently, or define spending differently from the Reports screen —
  // which is exactly what it did.
  assert.ok(
    !src.includes('.from("transactions")'),
    "get_spending_by_category is querying transactions itself again"
  );
  assert.ok(
    !src.includes('.eq("currency"'),
    "get_spending_by_category is restating the shared query's filters"
  );
});

test("the old forked category query has not come back anywhere in the tools", () => {
  // The select the forked query used, and the boundary it used to filter on.
  assert.ok(
    !TOOLS_SOURCE.includes("categories(name, kind)"),
    "a tool is selecting category rows to total itself again"
  );
  assert.ok(
    !TOOLS_SOURCE.includes('.lte("txn_date"'),
    "a tool is filtering an inclusive end date again — see lib/finance/period.ts"
  );
});

test("both money-range tools accept and refuse exactly the same ranges", () => {
  for (const name of ["get_spending_by_category", "get_money_report"]) {
    const src = toolSource(name);
    assert.ok(
      src.includes("customRangeProblem(from, to, today)"),
      `${name} must validate its range the same way, including "hasn't started yet"`
    );
    assert.ok(
      src.includes("customRangeFor(from, to)"),
      `${name} must build its range with the one inclusive-to-exclusive conversion`
    );
  }
});

test("no assistant tool works out its own today from the hardcoded timezone", () => {
  // `todayInAppTimezone()` with no argument falls back to Winnipeg. Every tool
  // must go through `toolToday`/`toolPeriodContext`, which read the profile,
  // or one conversation can hold two different todays — and two of them STORE
  // the day they pick (`log_expense`'s txn_date, `manage_budget`'s anchor).
  const code = TOOLS_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.equal(
    /todayInAppTimezone\(\s*\)/.test(code),
    false,
    "a tool is calling todayInAppTimezone() bare instead of reading the profile"
  );
  // And the profile-reading version is still there to go through.
  assert.ok(code.includes("async function toolToday("));
});
