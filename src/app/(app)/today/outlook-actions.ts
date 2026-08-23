"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { ALL_TOOLS, type ToolContext } from "@/lib/ai/tools";
import type { OutlookSuggestion } from "@/lib/ai/outlook";
import { todayInAppTimezone } from "@/lib/time";

/**
 * Runs one of the outlook's suggestions — only ever from a tap.
 *
 * Deliberately the same shape as `runSuggestedAction` in timeline/actions.ts,
 * because it is the same boundary: the tool is looked up in the registry the
 * assistant uses, so a suggestion can never reach past what the assistant could
 * already do; it runs against the person's own Supabase client so RLS still
 * applies; and it is gated on module access exactly as the assistant's tools
 * are. Alan chose "notice and suggest" — the model stores an intent, a thumb
 * turns it into an action.
 *
 * WHY THE SUGGESTION IS RE-READ FROM THE DATABASE rather than trusted from the
 * client. This is a server action, so its argument is whatever the browser
 * sends. If the action came in from the client, anyone could post a handcrafted
 * `{tool, args}` and use it as a general-purpose write endpoint. Taking only an
 * index into the stored row means the only things executable are the ones the
 * model actually wrote, for this person, today.
 */
export async function runOutlookSuggestion(input: {
  index: number;
}): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const today = todayInAppTimezone(profile.timezone ?? undefined);

  const { data: plan } = await supabase
    .from("day_plans")
    .select("ai_suggestions")
    .eq("user_id", user.id)
    .eq("plan_date", today)
    .maybeSingle();

  const suggestions = (plan?.ai_suggestions as OutlookSuggestion[] | null) ?? [];
  const action = suggestions[input.index];
  if (!action) return { error: "That suggestion isn't there any more." };
  // Idempotent: a double tap, or a tap on a stale render, must not run the same
  // write twice. Cheap to check and the only guard against it.
  if (action.actedAt) return { error: "That one's already done." };

  const tool = ALL_TOOLS.find((t) => t.name === action.tool);
  if (!tool) return { error: "That suggestion isn't something the app can do." };
  if (tool.module !== null && !profile.moduleAccess[tool.module]) {
    return { error: "That isn't switched on for this account." };
  }

  const ctx: ToolContext = { supabase, userId: user.id };
  const result = (await tool.run(ctx, action.args ?? {})) as { error?: string };
  if (result?.error) return { error: result.error };

  // MARKED, NOT REMOVED, and the distinction is a correctness one rather than a
  // stylistic one. The panel addresses a suggestion by its position in this
  // array and sends that position back on the next tap. Filtering the taken one
  // out renumbers the array while the browser is still holding the old
  // numbering — so the next tap sends index 1 meaning "B" and the server runs
  // whatever slid into slot 1, which is "C". A button that performs a different
  // action than its label is about the worst thing a suggestion chip can do.
  // Marking keeps every index meaning the same thing all day.
  const updated = suggestions.map((s, i) =>
    i === input.index ? { ...s, actedAt: new Date().toISOString() } : s
  );
  await supabase
    .from("day_plans")
    .update({ ai_suggestions: updated })
    .eq("user_id", user.id)
    .eq("plan_date", today);

  revalidatePath("/today");
  revalidatePath("/plan");
  revalidatePath("/shopping");
  return { ok: true };
}

/** Clears the whole outlook for today. It comes back tomorrow, not sooner. */
export async function dismissOutlook(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  const today = todayInAppTimezone(profile?.timezone ?? undefined);

  // The briefing goes, `ai_generated_at` stays. That pairing is what makes
  // dismissing free: the day still counts as generated, so nothing is
  // regenerated and nothing is recharged.
  await supabase
    .from("day_plans")
    .update({ ai_briefing: null, ai_suggestions: [] })
    .eq("user_id", user.id)
    .eq("plan_date", today);

  revalidatePath("/today");
}
