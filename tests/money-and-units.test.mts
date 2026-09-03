import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCsvAmount, readCsvAmount, normalizeCsvDate } from "../src/lib/finance/csv-parser.ts";
import { currentPeriodBounds, daysInMonth } from "../src/lib/finance/period.ts";
import { projectPayoff } from "../src/lib/finance/debt-payoff.ts";
import { incrementInDisplayUnit, smallestIncrementKg } from "../src/lib/workout/units.ts";
import { friendlyDbError } from "../src/lib/db-errors.ts";
import { guessCategoryForMerchant, normaliseMerchant } from "../src/lib/finance/categorise.ts";
import { balanceDeltaCents } from "../src/lib/finance/balance.ts";
import { adjustmentFor, appBalanceOnDate, reconcileGapCents } from "../src/lib/finance/reconcile.ts";
import { formatDateOnlyInAppTimezone } from "../src/lib/time.ts";

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
