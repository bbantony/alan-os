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
 *     always done it this way; this is the same reasoning, applied late. The
 *     `action` field is still accepted so existing callers compile, and is
 *     deliberately IGNORED.
 *
 * `acted_at` is stamped so the chip doesn't come back and offer to do it twice.
 */
export async function runSuggestedAction(input: {
  insightId: string;
  /** Ignored — kept only so existing callers still typecheck. See above. */
  action?: SuggestedAction;
}): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { data: row } = await supabase
    .from("insights")
    .select("suggested_action, acted_at")
    .eq("id", input.insightId)
    .eq("user_id", user.id)
    .maybeSingle();

  const stored = (row?.suggested_action as SuggestedAction | null) ?? null;
  if (!stored) return { error: "That suggestion isn't there any more." };
  // Idempotent: a double tap, or a tap on a stale render, must not run the
  // same write twice.
  if (row?.acted_at) return { error: "That one's already done." };

  // The allowlist first, the registry second. A stored proposal naming a tool
  // that isn't offerable — an old row from before the parse-time filter, or
  // anything else — is refused outright rather than run.
  if (!isSuggestableTool(stored.tool)) {
    return { error: "That suggestion isn't something the app will do on a tap." };
  }

  const tool = ALL_TOOLS.find((t) => t.name === stored.tool);
  if (!tool) return { error: "That suggestion isn't something the app can do." };
  if (tool.module !== null && !profile.moduleAccess[tool.module]) {
    return { error: "That isn't switched on for this account." };
  }

  const ctx: ToolContext = { supabase, userId: user.id };
  const result = (await tool.run(ctx, stored.args ?? {})) as { error?: string };
  if (result?.error) return { error: result.error };

  await supabase
    .from("insights")
    .update({ acted_at: new Date().toISOString() })
    .eq("id", input.insightId)
    .eq("user_id", user.id);

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
