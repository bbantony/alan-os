// Runtime imports are relative with an explicit .ts extension (not "@/lib/...")
// so node's test runner can load this file directly — the same convention
// lib/finance/period.ts and lib/streaks.ts already follow. The whole point of
// this file being pure is that the matrix below is covered by a test.
import { dollarsToCents, formatCents } from "../finance/money.ts";
import type { AiBoldness } from "../preferences";

/**
 * Propose-then-confirm: which of the assistant's writes need a thumb first.
 *
 * Settings → AI & cost has always had a three-way "how bold should the AI be"
 * choice, and until now it only changed whether the weekly insight offered
 * chips. It never touched the assistant, which simply did whatever it decided
 * to do. This file is what makes that setting mean something in the one place
 * the AI can actually change Alan's data.
 *
 *   act      — everything runs immediately, as it always has.
 *   suggest  — the MONEY writes become proposals; everything else still runs.
 *   notice   — every write becomes a proposal.
 *
 * WHY MONEY IS THE LINE, and why it is drawn here rather than left to taste.
 * Alan's setting is `suggest`, and putting two taps on "add milk to the list"
 * is exactly how a confirmation step becomes something a person learns to tap
 * through without reading — at which point it protects nothing and has cost
 * every interaction. Every non-money write in this app lands on a screen with
 * one-tap undo, so getting one wrong costs a tap. A wrong money write does not
 * behave that way: it survives, it compounds into safe-to-spend and the
 * month's category totals, and it is found weeks later as a number that is
 * subtly wrong rather than as a mistake anyone remembers making.
 *
 * NOTE THAT THIS IS NOT A SECURITY BOUNDARY. `notice` does not make the
 * assistant safer than `act` against a malicious prompt — the tool list, the
 * module gate and RLS do that work, and they do it identically at all three
 * settings. This is about Alan seeing what is about to happen to his money.
 * Do not let a future change treat "it's behind a proposal" as a reason to
 * loosen anything else.
 *
 * PURE ON PURPOSE. No Supabase, no `server-only` — so the matrix below is
 * covered by `tests/assistant-proposals.test.mts` rather than by hoping.
 */

/**
 * The writes that become proposals at `suggest`.
 *
 * Enumerated rather than derived from `module === "money"`, because the money
 * module also holds read tools and may one day hold a write that isn't worth
 * stopping for. A list can be checked against `tools.ts`; a rule about a
 * module silently absorbs whatever is added to that module later. There is a
 * test that every name here is a real tool with `writes: true`.
 */
export const MONEY_WRITE_TOOLS = [
  "log_expense",
  "update_transaction",
  "manage_budget",
  "manage_goal",
] as const;

const MONEY_WRITES = new Set<string>(MONEY_WRITE_TOOLS);

/** One thing the assistant wants to do, waiting for a thumb. */
export interface AssistantProposal {
  /** Plain English, built here — never by the model. See `proposalLabel`. */
  label: string;
  tool: string;
  args: Record<string, unknown>;
  /**
   * When the button was pressed, or null while it is still offered. MARKED,
   * never removed — the browser addresses a proposal by its position in the
   * array, so dropping a taken one renumbers the rest and the next tap runs
   * something other than what its label says. Same reasoning, and the same
   * bug, as the outlook chips in today/outlook-actions.ts.
   */
  actedAt: string | null;
}

/**
 * Does this write need Alan to tap before it happens?
 *
 * Takes the tool's own `writes` flag rather than a second list of write tool
 * names, so a tool that becomes a write later is covered the day it changes.
 */
export function needsConfirmation(
  boldness: AiBoldness,
  tool: { name: string; writes: boolean }
): boolean {
  if (!tool.writes) return false;
  if (boldness === "act") return false;
  if (boldness === "notice") return true;
  return MONEY_WRITES.has(tool.name);
}

function dollars(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? formatCents(dollarsToCents(Math.abs(value)))
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The words on the button.
 *
 * BUILT HERE, FROM THE ARGUMENTS, AND NEVER TAKEN FROM THE MODEL. The model
 * writes the sentence above the button; it does not get to write the button.
 * If it did, the label and the action could disagree — "Add milk to the list"
 * sitting on a `manage_budget` call — and a person tapping a button that does
 * something other than what it says is the worst failure this whole feature
 * can have. Deriving the label from the same `args` that will be executed
 * makes that disagreement impossible rather than unlikely.
 *
 * Every branch falls back to something true but vaguer rather than throwing:
 * an unlabelable proposal must still be describable, because the alternative
 * is dropping a write the model has already told Alan about.
 */
export function proposalLabel(toolName: string, args: Record<string, unknown>): string {
  const amount = dollars(args.amount);

  switch (toolName) {
    case "log_expense": {
      const where = text(args.merchant);
      const category = text(args.category);
      const verb = args.is_income === true ? "Record" : "Log";
      const what = [amount, where ? `at ${where}` : null, category ? `(${category})` : null]
        .filter(Boolean)
        .join(" ");
      return what ? `${verb} ${what}` : `${verb} this`;
    }

    case "update_transaction": {
      const where = text(args.merchant) ?? "that transaction";
      // The date when the model gave one. Confirming a deletion without being
      // shown which row is being deleted is not really confirming it, and
      // `update_transaction` takes the date precisely to narrow between two
      // shops at the same place.
      const on = text(args.date);
      if (args.action === "delete") return `Delete ${where}${on ? ` on ${on}` : ""}`;
      if (args.action === "fix_amount") {
        return amount ? `Change ${where} to ${amount}` : `Correct the amount on ${where}`;
      }
      const category = text(args.category);
      return category ? `Move ${where} to ${category}` : `Recategorise ${where}`;
    }

    case "manage_budget": {
      const category = text(args.category) ?? "that category";
      // ONLY `remove: true` says "Remove", because only `remove: true` removes.
      //
      // This read the other way round for most of a day: the tool's parameter
      // description said "omit the amount to remove the budget", so the label
      // treated a missing amount as removal too. The tool's CODE does no such
      // thing — it answers "How much a month?" — so the button said "Remove the
      // Groceries budget" and, when tapped, removed nothing. A button that
      // describes a deletion and performs a refusal is the exact failure this
      // function exists to make impossible, and it got in through a comment
      // that trusted a doc string over the code beneath it. The description in
      // tools.ts has been corrected too; this branch no longer depends on it.
      if (args.remove === true) return `Remove the ${category} budget`;
      const period = text(args.period) ?? "monthly";
      // No amount is a call the tool will refuse. The button says what will be
      // attempted, not what would be nice — and the refusal it comes back with
      // is a plain question, after which the proposal is offered again.
      if (amount === null) return `Change the ${category} budget`;
      return `Set the ${category} budget to ${amount} ${period}`;
    }

    case "manage_goal": {
      const name = text(args.name) ?? "that goal";
      if (args.action === "add_money") {
        return amount ? `Put ${amount} towards ${name}` : `Add money to ${name}`;
      }
      return amount ? `Start a ${amount} goal: ${name}` : `Create the goal ${name}`;
    }

    default: {
      // Reached at `notice`, where every write is proposed and most have no
      // bespoke wording. Readable, honest, and never a lie about what runs.
      const title = text(args.title) ?? text(args.name);
      const spoken = toolName.replace(/_/g, " ");
      return title ? `${spoken}: ${title}` : spoken.charAt(0).toUpperCase() + spoken.slice(1);
    }
  }
}

/**
 * Stamped on an entry that could not be read, so it can never be offered or
 * run. A real `actedAt` is an ISO timestamp; this is deliberately not one, and
 * deliberately readable in a database row someone is squinting at.
 */
const UNREADABLE = "unreadable";

/**
 * What comes back out of the `proposals` jsonb column, made safe to trust.
 *
 * The column is written by `ask()` and by nothing else, but it is still parsed
 * on the way out for the same reason `sanitiseProposedActions` exists: a row
 * written by an older version of this code, or by a version that had a bug,
 * must not be able to put a non-string tool name into a registry lookup or a
 * non-object into a tool's arguments.
 *
 * IT NEVER DROPS AN ENTRY, AND THAT IS THE WHOLE SUBTLETY. The obvious version
 * of this function filters bad entries out — and filtering RENUMBERS. The
 * screen would then be indexing into the cleaned array while the database
 * claim (`proposals->N->>actedAt`) indexes into the raw column, so with one
 * malformed entry at position 0 every button below it would stamp — and run —
 * its neighbour. That is the same class of bug the outlook chips have a long
 * comment about, arrived at from the opposite direction.
 *
 * So a malformed entry keeps its slot and comes back already stamped. Nothing
 * downstream needs a new branch: every "is this still offerable?" check in the
 * screen and the server already tests `actedAt`, and an unreadable entry is
 * simply not offerable — which is exactly true.
 */
export function sanitiseProposals(raw: unknown): AssistantProposal[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const p = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const args = p.args;
    const argsOk =
      args === undefined ||
      (typeof args === "object" && args !== null && !Array.isArray(args));
    const readable =
      typeof p.tool === "string" && p.tool && typeof p.label === "string" && p.label && argsOk;

    if (!readable) {
      return { label: "This one can't be read any more.", tool: "", args: {}, actedAt: UNREADABLE };
    }
    return {
      label: p.label as string,
      tool: p.tool as string,
      args: (args as Record<string, unknown> | undefined) ?? {},
      actedAt: typeof p.actedAt === "string" && p.actedAt ? p.actedAt : null,
    };
  });
}
