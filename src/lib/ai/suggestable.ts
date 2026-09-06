// What an AI suggestion chip is allowed to propose — one list, both surfaces.
//
// Two places in this app let a model put an action under Alan's thumb: the
// Today outlook (lib/ai/outlook.ts) and the weekly Timeline insight
// (lib/ai/insights.ts). Both store an intent and both execute it later by
// looking the name up in `ALL_TOOLS` — which is the assistant's FULL registry,
// including everything that edits money, budgets and workouts. Without a filter
// the boundary is "whatever the model typed", and one tap runs it.
//
// The outlook always had a two-name allowlist inline; insights had none, so a
// weekly insight could propose `manage_budget` or `update_transaction` and the
// chip would happily run it (found 6 Sep 2026). This file is that same
// allowlist, lifted out so there is one definition instead of two that can
// drift apart. It is deliberately dependency-free — no `server-only`, no
// import of tools.ts (which is server-only and drags half the app in) — so
// both server modules and the plain-node test runner can use it.
//
// THE TEST FOR MEMBERSHIP, and it is a strict one. A tool may be proposed only
// if acting on it BY MISTAKE costs nothing that isn't undone in one tap. That
// means:
//   - it only ADDS something new; it never edits or deletes existing data,
//   - it never touches money, a budget, or a goal,
//   - the undo is obvious and immediate on the screen the item lands on.
// The point of the "notice and suggest" rule in CLAUDE.md/SPEC.md is that AI
// output never commits on its own; a chip a person taps without really reading
// it is the same failure wearing a confirmation. When in doubt, leave the tool
// out — a suggestion that can't be offered is a feature, not a gap.
//
// Judged against that test:
//   create_task        IN  — adds one row to the task list. Deleting a task is
//                            one swipe, and a wrong task costs nothing but a
//                            line of text on a screen he is already reading.
//   add_shopping_items IN  — appends to the shopping list. Same shape of undo,
//                            and an unwanted item is simply never bought.
// Everything else in ALL_TOOLS is out, and the interesting exclusions are the
// near misses:
//   complete_task / complete_routine — EDIT existing rows. Marking a routine
//     done that wasn't done writes a completion into streak history, which is
//     the one number in the app that is meant to be earned.
//   create_routine — additive, but it creates a RECURRING obligation that then
//     generates future instances. That is a change of structure, not an item.
//   log_expense / log_workout — create records that other numbers are computed
//     from (safe-to-spend, streaks). Not free to get wrong.
//   manage_budget / manage_goal / update_transaction / update_task /
//     manage_shopping_item — edit or delete existing data, and the money ones
//     move real figures. Categorically out.
//   the read-only tools (get_money_report, list_transactions, …) — harmless,
//     but a chip that runs a read shows the person nothing and then marks
//     itself done. A dead button is not worth allowing.

/** The only tool names an AI-generated suggestion may ever name. */
export const SUGGESTABLE_TOOLS = ["create_task", "add_shopping_items"] as const;

export type SuggestableTool = (typeof SUGGESTABLE_TOOLS)[number];

const SUGGESTABLE = new Set<string>(SUGGESTABLE_TOOLS);

/** True only for the names above. Used at parse time AND before execution. */
export function isSuggestableTool(name: unknown): name is SuggestableTool {
  return typeof name === "string" && SUGGESTABLE.has(name);
}

/** The stored shape of a proposal, once it has survived the filter. */
export interface ProposedAction {
  label: string;
  tool: SuggestableTool;
  args: Record<string, unknown>;
}

/**
 * Turns whatever the model returned into a proposal, or null.
 *
 * Null covers every failure the same way — not an object, no label, a tool
 * name that isn't on the list, an invented tool name — because from the
 * caller's side they are one case: there is nothing safe to offer. Dropping
 * here rather than at tap time means an unauthorised proposal never reaches
 * the database at all, so it cannot be executed later by a client that
 * bypasses the UI.
 */
export function sanitiseProposedAction(value: unknown): ProposedAction | null {
  if (!value || typeof value !== "object") return null;
  const a = value as { label?: unknown; tool?: unknown; args?: unknown };
  if (typeof a.label !== "string" || a.label.trim().length === 0) return null;
  if (!isSuggestableTool(a.tool)) return null;
  const args =
    a.args && typeof a.args === "object" && !Array.isArray(a.args)
      ? (a.args as Record<string, unknown>)
      : {};
  return { label: a.label.trim(), tool: a.tool, args };
}

/** The list version: filters, drops anything unsafe, caps the count. */
export function sanitiseProposedActions(value: unknown, max: number): ProposedAction[] {
  if (!Array.isArray(value)) return [];
  const out: ProposedAction[] = [];
  for (const item of value) {
    // Checked BEFORE the push, so `max` of 0 means none rather than one.
    if (out.length >= max) break;
    const action = sanitiseProposedAction(item);
    if (action) out.push(action);
  }
  return out;
}
