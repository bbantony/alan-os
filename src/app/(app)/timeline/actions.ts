"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getLedger, groupByDay, type LedgerDaySummary } from "@/lib/ledger";
import { ALL_TOOLS, type ToolContext } from "@/lib/ai/tools";
import type { SuggestedAction } from "@/lib/ai/insights";
import { isSuggestableTool } from "@/lib/ai/suggestable";

export async function getLedgerDays(from: string, to: string): Promise<LedgerDaySummary[]> {
  const events = await getLedger(from, to);
  return groupByDay(events);
}

/**
 * Runs an insight's suggested action — only ever from a tap.
 *
 * This is the whole "notice and suggest" boundary in one function. It runs
 * against the person's own Supabase client so Row Level Security still
 * applies, and it's gated on the tool's module access exactly as the
 * assistant's are.
 *
 * TWO THINGS CHANGED HERE ON 6 SEP 2026, both for the same reason: "look it up
 * in `ALL_TOOLS`" was never a boundary. That registry is the assistant's whole
 * set, `manage_budget` and `update_transaction` included.
 *
 *  1. THE TOOL MUST BE ON THE SUGGESTION ALLOWLIST (lib/ai/suggestable.ts),
 *     not merely a real tool. `insights.ts` now filters at parse time so no
 *     new row can name anything else, but rows written before that fix can,
 *     and they are still sitting in the database with a live chip on them.
 *     Refusing here is what makes those rows inert. Defence in depth: two
 *     independent checks, either one sufficient.
 *  2. THE ACTION IS RE-READ FROM THE DATABASE, not taken from the argument.
 *     This is a server action, so its argument is whatever the browser sends —
 *     a handcrafted `{tool, args}` used to be executable as a general-purpose
 *     write endpoint. `runOutlookSuggestion` in today/outlook-actions.ts had
 *     always done it this way; this is the same reasoning, applied late.
 *
 *     An `action` field lingered in the signature after that fix, accepted and
 *     ignored, and the chip kept sending one. It is GONE as of the same day:
 *     an ignored parameter that looks executable is a standing invitation for
 *     the next reader to wire it back up. The only argument now is an id.
 *
 * `acted_at` is stamped BEFORE the tool runs and only if no one else has
 * stamped it, which is what makes the chip single-use — see the claim below.
 */
export async function runSuggestedAction(input: {
  insightId: string;
}): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // CLAIM FIRST, RUN SECOND. This used to read `acted_at`, run the tool, then
  // stamp — three separate trips, so two taps a moment apart both read "not
  // done yet" and both ran the write. `.is("acted_at", null)` moves the
  // decision into the database: the stamp and the check are one statement, so
  // exactly one of any number of simultaneous taps can match a row. The
  // returned row is what makes it a claim rather than a hope — no rows back
  // means somebody else got there first, and nothing runs.
  //
  // The stored action comes back FROM the claim, so what runs is what was in
  // the row at the moment it was claimed, not a copy read earlier.
  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("insights")
    .update({ acted_at: claimedAt })
    .eq("id", input.insightId)
    .eq("user_id", user.id)
    .is("acted_at", null)
    .select("suggested_action")
    .maybeSingle();

  if (claimError) return { error: "That didn't go through — try again in a moment." };

  if (!claimed) {
    // Nothing was claimed. Say which of the two reasons it was, which needs a
    // read — but only on this cold path, and it changes nothing either way.
    const { data: existing } = await supabase
      .from("insights")
      .select("acted_at")
      .eq("id", input.insightId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing?.acted_at) return { error: "That one's already done." };
    return { error: "That suggestion isn't there any more." };
  }

  // Releases the claim, so a suggestion refused below can still be tapped once
  // the reason is fixed. Guarded on our own timestamp: if some other write has
  // touched `acted_at` since, it isn't ours to undo.
  const userId = user.id;
  const insightId = input.insightId;
  async function release() {
    await supabase
      .from("insights")
      .update({ acted_at: null })
      .eq("id", insightId)
      .eq("user_id", userId)
      .eq("acted_at", claimedAt);
  }

  const stored = (claimed.suggested_action as SuggestedAction | null) ?? null;
  if (!stored) {
    await release();
    return { error: "That suggestion isn't there any more." };
  }

  // The allowlist first, the registry second. A stored proposal naming a tool
  // that isn't offerable — an old row from before the parse-time filter, or
  // anything else — is refused outright rather than run.
  if (!isSuggestableTool(stored.tool)) {
    await release();
    return { error: "That suggestion isn't something the app will do on a tap." };
  }

  const tool = ALL_TOOLS.find((t) => t.name === stored.tool);
  if (!tool) {
    await release();
    return { error: "That suggestion isn't something the app can do." };
  }
  if (tool.module !== null && !profile.moduleAccess[tool.module]) {
    await release();
    return { error: "That isn't switched on for this account." };
  }

  const ctx: ToolContext = { supabase, userId: user.id };
  // Deliberately NOT wrapped in a try/catch that releases. A tool that returns
  // an error refused cleanly and wrote nothing, so the claim goes back; a tool
  // that THROWS may have written half of something, and offering to run it
  // again is the worse of the two failures.
  const result = (await tool.run(ctx, stored.args ?? {})) as { error?: string };
  if (result?.error) {
    await release();
    return { error: result.error };
  }

  revalidatePath("/timeline");
  revalidatePath("/plan");
  revalidatePath("/shopping");
  return { ok: true };
}

export async function dismissInsight(input: { insightId: string }): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("insights")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", input.insightId)
    .eq("user_id", user.id);
  revalidatePath("/timeline");
}
