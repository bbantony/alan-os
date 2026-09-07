import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  MONEY_WRITE_TOOLS,
  needsConfirmation,
  proposalLabel,
  sanitiseProposals,
} from "../src/lib/ai/boldness.ts";
import { customRangeProblem } from "../src/lib/finance/period.ts";

/**
 * Propose-then-confirm: the matrix, the labels, and the index that must not move.
 *
 * Same charter as the rest of `tests/` — pure logic, no database, and every
 * case here is a bug that either was in this codebase or was one edit away from
 * being in it. Three things are worth the file:
 *
 *   1. THE MATRIX. Which writes stop and ask is a nine-cell truth table that
 *      decides whether Alan's money can be changed without him seeing it
 *      first. It is exactly the kind of thing that gets "simplified" later.
 *   2. THE INDEX. A proposal is addressed by its POSITION in a jsonb array, by
 *      the browser and by the database filter that claims it, and those two
 *      have to agree. If reading the column can ever change the length of the
 *      array, a button runs its neighbour — which for these four tools means
 *      logging the wrong amount or deleting the wrong transaction.
 *   3. THE LABEL. It is built from the same arguments that will execute, so
 *      that a button cannot describe one thing and do another.
 */

const TOOLS_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/lib/ai/tools.ts", import.meta.url)),
  "utf8"
);

// --- 1. The matrix ---------------------------------------------------------

const MONEY_WRITE = { name: "log_expense", writes: true };
const OTHER_WRITE = { name: "add_shopping_items", writes: true };
const READ = { name: "list_transactions", writes: false };

test("act runs everything, notice proposes every write", () => {
  for (const tool of [MONEY_WRITE, OTHER_WRITE, READ]) {
    assert.equal(needsConfirmation("act", tool), false, `${tool.name} should run at act`);
  }
  assert.equal(needsConfirmation("notice", MONEY_WRITE), true);
  assert.equal(needsConfirmation("notice", OTHER_WRITE), true);
});

test("suggest — Alan's setting — stops the money writes and nothing else", () => {
  assert.equal(needsConfirmation("suggest", MONEY_WRITE), true);
  // The deliberate half of the decision. Two taps on "add milk to the list" is
  // how a confirm step becomes something people tap through without reading.
  assert.equal(needsConfirmation("suggest", OTHER_WRITE), false);
  assert.equal(needsConfirmation("suggest", { name: "create_task", writes: true }), false);
  assert.equal(needsConfirmation("suggest", { name: "plan_tomorrow", writes: true }), false);
});

test("a read is never proposed, at any setting", () => {
  // A proposal naming a read tool is a button that shows the person nothing and
  // then marks itself done. `runAssistantProposal` refuses one too; this is the
  // half that stops it ever being written.
  for (const boldness of ["act", "suggest", "notice"] as const) {
    assert.equal(needsConfirmation(boldness, READ), false);
    assert.equal(needsConfirmation(boldness, { name: "log_expense", writes: false }), false);
  }
});

test("every name in MONEY_WRITE_TOOLS is a real tool that really writes", () => {
  // The list is enumerated rather than derived from `module === "money"` — see
  // boldness.ts — which means it can rot. A renamed tool would silently stop
  // being confirmed and start running straight through, with no error anywhere.
  // Text, because tools.ts is `server-only` and cannot be imported here.
  for (const name of MONEY_WRITE_TOOLS) {
    const declaration = new RegExp(
      `name: "${name}",[\\s\\S]{0,600}?writes: (true|false)`
    ).exec(TOOLS_SOURCE);
    assert.ok(declaration, `MONEY_WRITE_TOOLS names "${name}", which is not a tool in tools.ts`);
    assert.equal(
      declaration[1],
      "true",
      `"${name}" is in MONEY_WRITE_TOOLS but is not a write tool`
    );
  }
});

// --- 2. The index ----------------------------------------------------------

const GOOD = { label: "Log $12.50 at Safeway", tool: "log_expense", args: { amount: 12.5 }, actedAt: null };

test("reading the column never changes the length of the array", () => {
  // THE BUG THIS EXISTS FOR. The obvious sanitiser filters malformed entries
  // out. The browser then indexes into the cleaned array while the database
  // claim (`proposals->N->>actedAt`) indexes into the raw column — so one bad
  // entry at position 0 makes every button below it stamp and run its
  // neighbour. With `log_expense` and `update_transaction` in this list, that
  // is the wrong amount logged or the wrong transaction deleted.
  const raw = [
    null,
    GOOD,
    { tool: 42, label: "nonsense" },
    { label: "no tool" },
    { tool: "manage_budget", label: "Set the Groceries budget to $400", args: ["not", "an", "object"] },
    { ...GOOD, label: "Delete Safeway", tool: "update_transaction" },
  ];
  const clean = sanitiseProposals(raw);
  assert.equal(clean.length, raw.length, "sanitiseProposals dropped an entry and renumbered the rest");
  // The good ones are still where they were put.
  assert.equal(clean[1].tool, "log_expense");
  assert.equal(clean[5].tool, "update_transaction");
});

test("an entry that can't be read comes back already spent, not offerable", () => {
  const clean = sanitiseProposals([{ tool: 42 }, GOOD]);
  // Non-null actedAt is what every "still offerable?" check already tests, in
  // the screen and in the server action — so an unreadable entry needs no new
  // branch anywhere to be safely ignored.
  assert.ok(clean[0].actedAt, "an unreadable entry must not be offerable");
  assert.equal(clean[0].tool, "", "an unreadable entry must not name a tool");
  assert.equal(clean[1].actedAt, null, "the readable entry beside it is still offerable");
});

test("marking one proposal taken leaves every other index alone", () => {
  // What `runAssistantProposal` does to the array before it runs anything.
  // Marked, never removed: the browser is still holding the old numbering.
  const before = sanitiseProposals([
    { ...GOOD, label: "A" },
    { ...GOOD, label: "B" },
    { ...GOOD, label: "C" },
  ]);
  const stamped = "2026-09-06T18:00:00.000Z";
  const after = before.map((p, i) => (i === 1 ? { ...p, actedAt: stamped } : p));

  assert.deepEqual(after.map((p) => p.label), ["A", "B", "C"]);
  assert.equal(after[1].actedAt, stamped);
  assert.equal(after[0].actedAt, null);
  assert.equal(after[2].actedAt, null);
  // And re-reading the stamped array keeps every position and every stamp.
  const reread = sanitiseProposals(after);
  assert.deepEqual(reread.map((p) => p.actedAt), [null, stamped, null]);
});

test("junk in the column is empty, not a crash", () => {
  for (const raw of [null, undefined, 7, "[]", { tool: "log_expense" }]) {
    assert.deepEqual(sanitiseProposals(raw), []);
  }
});

// --- 3. The label ----------------------------------------------------------

test("the label says the amount, the place and the direction", () => {
  assert.equal(
    proposalLabel("log_expense", { amount: 12.5, merchant: "Safeway", category: "Groceries" }),
    "Log $12.50 at Safeway (Groceries)"
  );
  // Income is a different verb. "Log $2,000.00" on a paycheque reads as spending.
  assert.equal(
    proposalLabel("log_expense", { amount: 2000, merchant: "Work", is_income: true }),
    "Record $2,000.00 at Work"
  );
  // Cents, not floats, on the way to the string — 0.1 + 0.2 money.
  assert.equal(proposalLabel("log_expense", { amount: 0.3 }), "Log $0.30");
});

test("a destructive proposal says so on the button", () => {
  assert.equal(
    proposalLabel("update_transaction", { merchant: "Safeway", action: "delete" }),
    "Delete Safeway"
  );
  // With a date, the button says which row — confirming a deletion you cannot
  // identify is not confirming it.
  assert.equal(
    proposalLabel("update_transaction", { merchant: "Safeway", action: "delete", date: "2026-09-02" }),
    "Delete Safeway on 2026-09-02"
  );
  assert.equal(
    proposalLabel("update_transaction", { merchant: "Safeway", action: "fix_amount", amount: 41 }),
    "Change Safeway to $41.00"
  );
  assert.equal(
    proposalLabel("update_transaction", { merchant: "Safeway", action: "recategorise", category: "Fuel" }),
    "Move Safeway to Fuel"
  );
});

test("the budget label agrees with the tool about what an absent amount means", () => {
  // THE BUG THIS TEST USED TO PIN IN PLACE. It first asserted that an omitted
  // amount meant "Remove the Groceries budget", because `manage_budget`'s
  // parameter description said "omit to remove". Its CODE removes only on
  // `remove: true` and otherwise answers "How much a month?" — so the button
  // said Remove and removed nothing. The description was the thing that was
  // wrong and has been corrected; the label now follows the code.
  assert.equal(proposalLabel("manage_budget", { category: "Groceries" }), "Change the Groceries budget");
  assert.equal(
    proposalLabel("manage_budget", { category: "Groceries", amount: 400, remove: true }),
    "Remove the Groceries budget"
  );
  // The word "Remove" may only ever appear when the tool will actually remove.
  for (const args of [{ category: "Groceries" }, { category: "Groceries", amount: 400 }]) {
    assert.ok(
      !proposalLabel("manage_budget", args).includes("Remove"),
      "a budget button says Remove for a call that removes nothing"
    );
  }
  assert.equal(
    proposalLabel("manage_budget", { category: "Groceries", amount: 400 }),
    "Set the Groceries budget to $400.00 monthly"
  );
});

test("a goal label distinguishes starting one from paying into one", () => {
  assert.equal(
    proposalLabel("manage_goal", { name: "Trip to India", action: "add_money", amount: 100 }),
    "Put $100.00 towards Trip to India"
  );
  assert.equal(
    proposalLabel("manage_goal", { name: "Trip to India", action: "create", amount: 4000 }),
    "Start a $4,000.00 goal: Trip to India"
  );
});

test("a tool with no bespoke wording still gets a readable, honest button", () => {
  // Reached at `notice`, where every write is proposed.
  assert.equal(proposalLabel("create_task", { title: "Call the dentist" }), "create task: Call the dentist");
  assert.equal(proposalLabel("log_workout", {}), "Log workout");
  // Never blank, never a thrown error, whatever the model sent.
  for (const args of [{}, { amount: "not a number" }, { merchant: "   " }]) {
    for (const tool of MONEY_WRITE_TOOLS) {
      assert.ok(proposalLabel(tool, args).trim().length > 0, `${tool} produced an empty label`);
    }
  }
});

// --- The day-plan verbs, and one range rule for every caller ---------------

test("the two day-plan tools exist, are registered, and only one of them writes", () => {
  const array = /export const ALL_TOOLS: AiTool\[\] = \[([\s\S]*?)\n\];/.exec(TOOLS_SOURCE);
  assert.ok(array, "could not find the ALL_TOOLS array");
  assert.ok(array[1].includes("getDayPlan"), "get_day_plan is declared but never registered");
  assert.ok(array[1].includes("planTomorrowTool"), "plan_tomorrow is declared but never registered");

  // Reading the plan must not be able to change it — `get_day_plan` marked as a
  // write would put it behind a confirm button at `notice` and it would never run.
  assert.ok(/name: "get_day_plan",[\s\S]{0,400}?writes: false/.test(TOOLS_SOURCE));
  assert.ok(/name: "plan_tomorrow",[\s\S]{0,400}?writes: true/.test(TOOLS_SOURCE));
});

test("the header's list of write tools is still the truth", () => {
  // The header enumerates the writes because "it cannot touch budgets" was
  // wrong for the whole life of `manage_budget`. A list can be checked; this
  // is the check. It has already been out of date once.
  // Non-greedy up to the FIRST `writes:` after each name, then keep the trues.
  // Matching `writes: true` directly would let a read tool borrow the flag off
  // whichever tool happens to be declared under it.
  const declared = [
    ...TOOLS_SOURCE.matchAll(/name: "(\w+)",[\s\S]{0,900}?writes: (true|false)/g),
  ]
    .filter((m) => m[2] === "true")
    .map((m) => m[1]);
  const header = /there\r?\n \* are \w+: ([\s\S]*?)\.\r?\n/.exec(TOOLS_SOURCE);
  assert.ok(header, "the header no longer enumerates the write tools");
  const listed = [...header[1].matchAll(/`(\w+)`/g)].map((m) => m[1]);
  assert.deepEqual(
    [...listed].sort(),
    [...new Set(declared)].sort(),
    "the header's list of write tools and the tools with `writes: true` have drifted apart"
  );
});

test("a bad range gets one answer, and it doesn't name a screen the person isn't on", () => {
  // `get_money_report` and `list_transactions` both go through
  // `customRangeProblem`, so there is exactly one set of rules about what a
  // range may be. The message used to say "Reports cover about five years",
  // which is a sentence about a screen, shown to somebody who had just typed a
  // question at the assistant.
  const tooLong = customRangeProblem("2015-01-01", "2026-01-01");
  assert.ok(tooLong, "an eleven-year range must be refused");
  assert.ok(!/report/i.test(tooLong), `the refusal names the Reports screen: ${tooLong}`);
  assert.match(tooLong, /five years/);

  assert.match(customRangeProblem("2026-06-30", "2026-06-01") ?? "", /ends before it starts/);
  assert.match(customRangeProblem("not-a-date", "2026-06-01") ?? "", /YYYY-MM-DD/);
  assert.equal(customRangeProblem("2026-06-01", "2026-06-30", "2026-09-06"), null);
  assert.match(
    customRangeProblem("2027-01-01", "2027-01-31", "2026-09-06") ?? "",
    /hasn't started yet/
  );

  // And the tools reuse it rather than growing a second set of rules.
  assert.ok(
    (TOOLS_SOURCE.match(/customRangeProblem\(/g) ?? []).length >= 2,
    "a tool has stopped going through customRangeProblem"
  );
});
