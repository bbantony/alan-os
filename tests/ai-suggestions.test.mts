import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  SUGGESTABLE_TOOLS,
  isSuggestableTool,
  sanitiseProposedAction,
  sanitiseProposedActions,
} from "../src/lib/ai/suggestable.ts";

/**
 * What an AI suggestion chip may propose — the filter, not the chip.
 *
 * Same charter as the other files in here: this is a real bug in this
 * codebase, tested where the logic is pure. Found 6 Sep 2026 while building
 * the routine verb. `lib/ai/outlook.ts` had always kept the Today outlook to a
 * two-name allowlist; `lib/ai/insights.ts` had NO allowlist and stored
 * whatever `tool` string the model produced, and
 * `timeline/actions.ts#runSuggestedAction` then executed any matching entry in
 * `ALL_TOOLS` by name. So a weekly insight could put "Move £200 into
 * groceries" under Alan's thumb as `manage_budget`, and one tap ran it.
 *
 * Not a cross-account hole — module gating and RLS both held, and the tool ran
 * as the person themselves. The thing it breaks is the rule the whole AI layer
 * is built on: the model may notice and suggest, it may never commit. A chip
 * someone taps without really reading it is that rule failing while looking
 * like it worked.
 *
 * The invariant these cases hold down:
 *
 *   THE MODEL MAY PROPOSE ONLY THINGS THAT ARE FREE TO GET WRONG.
 *   Additive, one-tap-undoable, and nowhere near money.
 *
 * Every "must be rejected" name below is a real tool in lib/ai/tools.ts that
 * was genuinely reachable this way before the fix.
 */

test("the allowlist is exactly the two additive, reversible tools", () => {
  assert.deepEqual([...SUGGESTABLE_TOOLS], ["create_task", "add_shopping_items"]);
});

test("real but unsafe tools are refused", () => {
  // Each of these is in ALL_TOOLS and each fails the test in suggestable.ts:
  // it edits, deletes, or moves money.
  for (const name of [
    "manage_budget",
    "manage_goal",
    "update_transaction",
    "log_expense",
    "log_workout",
    "update_task",
    "complete_task",
    "complete_routine",
    "create_routine",
    "manage_shopping_item",
    "get_money_report",
    "list_transactions",
  ]) {
    assert.equal(isSuggestableTool(name), false, `${name} must not be suggestable`);
    assert.equal(
      sanitiseProposedAction({ label: "Do the thing", tool: name, args: {} }),
      null,
      `${name} must be dropped at parse time`
    );
  }
});

test("junk tool names and junk shapes are refused", () => {
  assert.equal(isSuggestableTool("create_task "), false); // trailing space
  assert.equal(isSuggestableTool("CREATE_TASK"), false); // case matters
  assert.equal(isSuggestableTool("toString"), false); // prototype key, not a tool
  assert.equal(isSuggestableTool(undefined), false);
  assert.equal(isSuggestableTool(null), false);
  assert.equal(isSuggestableTool(42), false);

  assert.equal(sanitiseProposedAction(null), null);
  assert.equal(sanitiseProposedAction("create_task"), null);
  assert.equal(sanitiseProposedAction({ tool: "create_task", args: {} }), null); // no label
  assert.equal(sanitiseProposedAction({ label: "   ", tool: "create_task" }), null); // blank label
  assert.equal(sanitiseProposedAction({ label: "Add milk", tool: 7 }), null);
});

test("an allowed proposal survives, trimmed, with args defaulted", () => {
  assert.deepEqual(
    sanitiseProposedAction({
      label: "  Add oats to the list  ",
      tool: "add_shopping_items",
      args: { items: ["oats"] },
    }),
    { label: "Add oats to the list", tool: "add_shopping_items", args: { items: ["oats"] } }
  );

  // Missing or malformed args become {} rather than sinking the proposal —
  // the tool itself validates what it needs and says so in plain English.
  assert.deepEqual(sanitiseProposedAction({ label: "Add a task", tool: "create_task" }), {
    label: "Add a task",
    tool: "create_task",
    args: {},
  });
  assert.deepEqual(
    sanitiseProposedAction({ label: "Add a task", tool: "create_task", args: ["nope"] })?.args,
    {}
  );
});

test("the list filter keeps the good ones and caps the count", () => {
  const mixed = [
    { label: "Add milk", tool: "add_shopping_items", args: { items: ["milk"] } },
    { label: "Bump the grocery budget", tool: "manage_budget", args: { amount_cents: 20000 } },
    "not an object",
    { label: "Book the dentist", tool: "create_task", args: {} },
    { label: "Log yesterday's run", tool: "log_workout", args: {} },
    { label: "Add rice", tool: "add_shopping_items", args: { items: ["rice"] } },
  ];

  const kept = sanitiseProposedActions(mixed, 3);
  assert.deepEqual(
    kept.map((k) => k.tool),
    ["add_shopping_items", "create_task", "add_shopping_items"]
  );

  // The cap is a cap, and it counts SURVIVORS, not input positions — three
  // rejected proposals must not use up the room for three good ones.
  assert.equal(sanitiseProposedActions(mixed, 1).length, 1);
  assert.equal(sanitiseProposedActions(mixed, 0).length, 0);
  assert.equal(sanitiseProposedActions(mixed, 10).length, 3);
  assert.deepEqual(sanitiseProposedActions(null, 3), []);
  assert.deepEqual(sanitiseProposedActions({ label: "x" }, 3), []);
  assert.deepEqual(
    sanitiseProposedActions([{ label: "Set a budget", tool: "manage_budget" }], 3),
    []
  );
});

/**
 * An allowlist of names is only as good as the names. If a tool in
 * lib/ai/tools.ts is ever renamed, the entry here goes quietly dead and the
 * chip becomes a button that errors — so this reads the registry as TEXT
 * (importing it is impossible from the plain-node test runner: it is
 * `server-only` and pulls in half the app) and checks each name still exists.
 */
test("every allowlisted name is still a real tool in the registry", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/lib/ai/tools.ts", import.meta.url)),
    "utf8"
  );
  for (const name of SUGGESTABLE_TOOLS) {
    assert.ok(
      source.includes(`name: "${name}"`),
      `${name} is on the suggestion allowlist but no longer exists in lib/ai/tools.ts`
    );
  }
});

/**
 * The test above proves the tool is DECLARED. It does not prove it EXISTS.
 *
 * A tool object that is never added to `ALL_TOOLS` typechecks, lints, and is
 * silently absent at runtime — the registry array is the only thing the
 * assistant, the Today outlook and the Timeline actually look in. So a rename
 * that missed the array, or a tool declared and never registered, would pass
 * the name check and still leave a chip that errors on tap.
 *
 * This walks it the other way round: read the identifiers listed in
 * `ALL_TOOLS`, resolve each back to the `name:` on its declaration, and require
 * every allowlisted name to be in THAT set. Text again, for the same reason —
 * `tools.ts` is `server-only` and cannot be imported here.
 */
test("every allowlisted name is registered in ALL_TOOLS, not merely declared", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/lib/ai/tools.ts", import.meta.url)),
    "utf8"
  );

  const array = /export const ALL_TOOLS: AiTool\[\] = \[([\s\S]*?)\n\];/.exec(source);
  assert.ok(array, "could not find the ALL_TOOLS array in lib/ai/tools.ts");

  const identifiers = array[1]
    // The array carries prose comments ("// Added when Alan asked for an
    // assistant that can actually change things."), and every word in one
    // looks like an identifier once you split on whitespace. Strip comments
    // before splitting or the test accuses `Added` of not being a tool.
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
  assert.ok(identifiers.length > 0, "ALL_TOOLS parsed as empty — the regex above has rotted");

  const registered = new Set<string>();
  for (const id of identifiers) {
    // Deliberately indexOf and not a built regex. The first attempt at this
    // interpolated the identifier into a `new RegExp` template literal, where
    // the `\s` of `[\s\S]` is not a valid string escape and silently becomes a
    // bare `s` — so the pattern quietly stopped matching anything and the test
    // failed on a tool that was registered perfectly well. Plain string search
    // has no escaping layer to get wrong.
    const at = source.indexOf(`const ${id}: AiTool = {`);
    assert.notStrictEqual(
      at,
      -1,
      `ALL_TOOLS lists \`${id}\` but no \`const ${id}: AiTool\` declares it`
    );
    // `name:` is the first field on every tool object, so the first one after
    // the declaration is that tool's own name and not a nested one.
    const named = /name: "([^"]+)"/.exec(source.slice(at));
    assert.ok(named, `\`${id}\` is declared but has no name field`);
    registered.add(named[1]);
  }

  for (const name of SUGGESTABLE_TOOLS) {
    assert.ok(
      registered.has(name),
      `${name} is on the suggestion allowlist but is not in ALL_TOOLS — it would be offered as a chip and fail on tap`
    );
  }
});
