"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getLedger, groupByDay, type LedgerDaySummary } from "@/lib/ledger";
import { ALL_TOOLS, type ToolContext } from "@/lib/ai/tools";
import type { SuggestedAction } from "@/lib/ai/insights";

export async function getLedgerDays(from: string, to: string): Promise<LedgerDaySummary[]> {
  const events = await getLedger(from, to);
  return groupByDay(events);
}

/**
 * Runs an insight's suggested action — only ever from a tap.
 *
 * This is the whole "notice and suggest" boundary in one function. The action
 * is looked up in the same tool registry the assistant uses
 * (`lib/ai/tools.ts`), so it can't reach past what the assistant could already
 * do, it runs against the person's own Supabase client so Row Level Security
 * still applies, and it's gated on the tool's module access exactly as the
 * assistant's are. An insight that names a tool this account can't use does
 * nothing.
 *
 * `acted_at` is stamped so the chip doesn't come back and offer to do it twice.
 */
export async function runSuggestedAction(input: {
  insightId: string;
  action: SuggestedAction;
}): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const tool = ALL_TOOLS.find((t) => t.name === input.action.tool);
  if (!tool) return { error: "That suggestion isn't something the app can do." };
  if (tool.module !== null && !profile.moduleAccess[tool.module]) {
    return { error: "That isn't switched on for this account." };
  }

  const ctx: ToolContext = { supabase, userId: user.id };
  const result = (await tool.run(ctx, input.action.args ?? {})) as { error?: string };
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
