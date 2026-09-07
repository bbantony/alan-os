import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  canAccessPath,
  resolveModuleAccess,
  type PermissionProfile,
} from "../src/lib/permissions.ts";

/**
 * The crew billing hole — that a workout-only account could spend the owner's
 * model credit — and the structural rule that keeps it shut.
 *
 * WHY THIS FILE EXISTS AND WHAT IT IS HONESTLY WORTH. The 6 Sep review found
 * three doors onto the owner's card, of which only one had been closed, and
 * the finding that mattered was not "the check is wrong" — the check is four
 * lines and obviously right — but "somebody wrote a new entry point and did
 * not know the check existed". `ensureDailyOutlook` was exactly that: written
 * months after the permission rule, spending on a schedule rather than on a
 * tap, by an account that cannot open a single module the briefing describes.
 *
 * So the interesting tests here are the STRUCTURAL ones. A truth table over
 * `canAccessPath` proves the rule; only reading the source proves that every
 * place which spends money actually asks. The precedent is
 * `ai-suggestions.test.mts`, which walks `ALL_TOOLS` textually for the same
 * reason: these modules are `server-only` and cannot be imported here, and a
 * missing call site typechecks perfectly.
 *
 * WHAT THIS FILE CANNOT PROVE. That a refused call leaves no row in
 * `ai_usage`. Nothing in `tests/` touches a database — by charter, see
 * CLAUDE.md — so the ordering assertion below (the guard appears before the
 * first model call in the file) is the static half of that claim, and the live
 * half belongs to the `qa` agent under real auth. Do not read a pass here as
 * proof that no money moved; read it as proof that no code path can reach the
 * model without asking first.
 */

const ACTIONS_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/app/(app)/assistant/actions.ts", import.meta.url)),
  "utf8"
);

const OUTLOOK_SOURCE = readFileSync(
  fileURLToPath(new URL("../src/lib/ai/outlook.ts", import.meta.url)),
  "utf8"
);

/** A crew member: workouts only, which is what every invited account starts as. */
const WORKOUT_ONLY: PermissionProfile = {
  role: "workout_member",
  moduleAccess: { workout: true },
};

// --- The rule itself -------------------------------------------------------

test("a workout-only account cannot reach the assistant", () => {
  assert.equal(canAccessPath(WORKOUT_ONLY, "/assistant"), false);
  // Same account, same rule, by the address it is actually gated on. If
  // `/assistant` were ever dropped from ROUTE_MODULE_ALIASES it would stop
  // matching any module and `canAccessPath` would wave it through — this pins
  // that it is the Tasks module doing the refusing, not a coincidence.
  assert.equal(resolveModuleAccess(WORKOUT_ONLY).tasks, false);
  assert.equal(canAccessPath(WORKOUT_ONLY, "/workout"), true);
});

test("an account given Tasks can reach the assistant, and the owner always can", () => {
  assert.equal(
    canAccessPath({ role: "full_user", moduleAccess: { tasks: true } }, "/assistant"),
    true
  );
  assert.equal(canAccessPath({ role: "owner", moduleAccess: null }, "/assistant"), true);
});

test("a missing or empty profile is refused, not waved through", () => {
  // The guards read `role` and `module_access` off a row that may be absent —
  // a deleted profile, or one RLS declines to return. Both call sites fall
  // back to `full_user` with no module_access, and this is the assertion that
  // makes that fallback safe rather than a hole with a friendly name.
  assert.equal(canAccessPath({ role: "full_user", moduleAccess: null }, "/assistant"), false);
  assert.equal(canAccessPath({ role: "full_user", moduleAccess: {} }, "/assistant"), false);
  // jsonb can hold anything. Only the boolean `true` counts.
  assert.equal(
    canAccessPath({ role: "full_user", moduleAccess: { tasks: "true" } }, "/assistant"),
    false
  );
  assert.equal(
    canAccessPath({ role: "full_user", moduleAccess: { tasks: 1 } }, "/assistant"),
    false
  );
});

// --- Every door, not just the ones we remembered ---------------------------

test("every exported assistant action asks whether the assistant is switched on", () => {
  // Split the file at each top-level export and require the gate inside each
  // body. Written this way so that an action added NEXT year fails this test
  // on the day it is written, which is the only part of this file that can
  // catch the mistake that actually happened.
  const names = [...ACTIONS_SOURCE.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
  assert.ok(names.length >= 5, `expected the five known actions, found ${names.join(", ")}`);

  const bodies = ACTIONS_SOURCE.split(/^export async function /m).slice(1);
  for (const body of bodies) {
    const name = /^(\w+)/.exec(body)![1];
    const gated =
      body.includes("assistantIsAvailable()") || body.includes('canAccessPath(profile, "/assistant")');
    assert.ok(
      gated,
      `${name}() in assistant/actions.ts is reachable by any signed-in account. ` +
        `Add \`if (!(await assistantIsAvailable())) return ...\` — see the note on that helper.`
    );
  }
});

test("the Today outlook asks before it spends", () => {
  // The second door, and the expensive one: /today is deliberately not
  // module-gated, so this runs on every page load for every account.
  assert.ok(
    OUTLOOK_SOURCE.includes('canAccessPath('),
    "ensureDailyOutlook no longer checks whether the account may spend the owner's credit"
  );
  assert.ok(
    OUTLOOK_SOURCE.includes("role, module_access"),
    "outlook.ts reads the profile without the columns canAccessPath needs — the check " +
      "would then be reading undefined and, depending on the fallback, may pass everyone"
  );
});

test("every server action that reaches the model checks permission first", () => {
  // THE TEST THAT WOULD HAVE FOUND IT. Two of these three doors were closed by
  // reading the code; the third — `uploadReceipt` — was found by the `qa` agent
  // running as a real crew account and watching 0.12 cents of the owner's
  // Gemini credit disappear, along with a `receipts` row and a file in private
  // Storage. It is registered as a server action on twenty-six pages in the
  // production build, `/today` among them, so "it lives under /money" was never
  // the protection it looked like.
  //
  // The lesson is not "read more carefully" — it is that the set of files which
  // spend money is small, knowable, and worth enumerating. Anything reaching a
  // Gemini call from a `"use server"` file belongs in this list with a check.
  const spenders: [string, RegExp][] = [
    ["money/receipt-actions.ts", /moneyIsAvailable\(\)/],
    ["money/csv-actions.ts", /moneyIsAvailable\(\)/],
    ["assistant/actions.ts", /assistantIsAvailable\(\)/],
  ];
  for (const [file, guard] of spenders) {
    const source = readFileSync(
      fileURLToPath(new URL(`../src/app/(app)/${file}`, import.meta.url)),
      "utf8"
    );
    assert.match(
      source,
      guard,
      `${file} calls the model but no longer asks whether this account may spend`
    );
  }

  // The two that are libraries rather than actions, and gate themselves.
  for (const lib of ["outlook.ts", "insights.ts"]) {
    const source = readFileSync(
      fileURLToPath(new URL(`../src/lib/ai/${lib}`, import.meta.url)),
      "utf8"
    );
    assert.ok(
      source.includes("canAccessPath("),
      `lib/ai/${lib} spends the owner's credit without a permission check`
    );
  }
});

test("in both files the permission check comes before the model call", () => {
  // The whole claim is "a blocked account is not billed". That is an ORDERING
  // property: a guard placed after `callGeminiJson` would return the right
  // refusal and still have spent the money, and every other test in this file
  // would pass. Cheap to assert, and it is the assertion the claim rests on.
  for (const [name, source, spend] of [
    ["outlook.ts", OUTLOOK_SOURCE, "callGeminiJson({"],
    ["assistant/actions.ts", ACTIONS_SOURCE, "await askAssistant({"],
  ] as const) {
    const guard = source.indexOf("canAccessPath(");
    const call = source.indexOf(spend);
    assert.ok(guard >= 0, `${name}: no permission check found at all`);
    if (call < 0) continue; // the model call was renamed; the name check above still holds
    assert.ok(
      guard < call,
      `${name}: the permission check appears AFTER the model call — a refused account is billed`
    );
  }
});

test("the refusal sentence is written once, not five times", () => {
  // Five actions telling a crew member five slightly different things is how
  // "the assistant isn't switched on" becomes a support question. One
  // constant, and the literal must not reappear loose in the file.
  assert.ok(ACTIONS_SOURCE.includes("const ASSISTANT_UNAVAILABLE ="));
  const loose = ACTIONS_SOURCE.split("\n").filter(
    (line) =>
      line.includes("The assistant isn't switched on for this account") &&
      !line.includes("const ASSISTANT_UNAVAILABLE") &&
      !line.trimStart().startsWith("*") &&
      !line.trimStart().startsWith("//")
  );
  assert.deepEqual(loose, [], "the refusal sentence is duplicated instead of using the constant");
});
