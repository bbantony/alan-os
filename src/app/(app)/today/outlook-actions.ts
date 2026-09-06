"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { ALL_TOOLS, type ToolContext } from "@/lib/ai/tools";
import { isSuggestableTool } from "@/lib/ai/suggestable";
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

  // The index is checked for SHAPE before anything else, because it is spliced
  // into a database filter below (`ai_suggestions->N->>actedAt`). Anything but
  // a small whole number could carry filter syntax into that string, and this
  // argument comes from the browser. Three suggestions is the documented
  // maximum; the ceiling is deliberately loose but finite.
  const index = input.index;
  if (!Number.isInteger(index) || index < 0 || index > 99) {
    return { error: "That suggestion isn't there any more." };
  }

  const { data: plan } = await supabase
    .from("day_plans")
    .select("ai_suggestions")
    .eq("user_id", user.id)
    .eq("plan_date", today)
    .maybeSingle();

  const suggestions = (plan?.ai_suggestions as OutlookSuggestion[] | null) ?? [];
  const action = suggestions[index];
  if (!action) return { error: "That suggestion isn't there any more." };
  // A first, friendly answer only. It is NOT what makes the chip single-use —
  // reading a value and acting on it later is exactly the race this used to
  // lose. The claim below is the real guard.
  if (action.actedAt) return { error: "That one's already done." };

  // Belt and braces, matching timeline/actions.ts. The outlook already filters
  // to the allowlist when it PARSES the model's reply, so nothing unauthorised
  // should be stored — but a row written before that filter existed, or by a
  // future path that forgets it, would otherwise still be executable here. The
  // allowlist is the rule; this is the second place that enforces it, because
  // one place enforcing a security rule is one bug away from none.
  if (!isSuggestableTool(action.tool)) {
    return { error: "That suggestion isn't something the app offers to do for you." };
  }

  const tool = ALL_TOOLS.find((t) => t.name === action.tool);
  if (!tool) return { error: "That suggestion isn't something the app can do." };
  if (tool.module !== null && !profile.moduleAccess[tool.module]) {
    return { error: "That isn't switched on for this account." };
  }

  // --- The claim -----------------------------------------------------------
  //
  // MARKED BEFORE THE TOOL RUNS, and marked CONDITIONALLY. Until 6 Sep 2026
  // this happened afterwards: read "not done", run the write, then stamp. Two
  // taps could both read "not done" and both run — the double booking, the
  // double shopping item — and the stamp itself was never checked, so a failed
  // mark left a finished action looking untouched and tappable again.
  //
  // `.is("ai_suggestions->N->>actedAt", null)` asks the database, inside the
  // same statement that does the writing, whether THIS suggestion is still
  // unclaimed. Exactly one simultaneous tap can match. `.select()` is what
  // turns it from a hope into a claim: no row back means someone else won.
  //
  // MARKED, NOT REMOVED, and the distinction is a correctness one rather than a
  // stylistic one. The panel addresses a suggestion by its position in this
  // array and sends that position back on the next tap. Filtering the taken one
  // out renumbers the array while the browser is still holding the old
  // numbering — so the next tap sends index 1 meaning "B" and the server runs
  // whatever slid into slot 1, which is "C". A button that performs a different
  // action than its label is about the worst thing a suggestion chip can do.
  // Marking keeps every index meaning the same thing all day.
  //
  // THE ONE HONEST GAP. The suggestions are one jsonb array in one column, and
  // PostgREST can only set a whole column, so this writes the array back
  // wholesale from the copy read a few lines above. Two DIFFERENT chips claimed
  // within the same round trip can therefore still lose one of the two marks.
  // The window is now milliseconds of local work rather than the entire tool
  // run, and the `.is()` filter means the same chip can never double-run — but
  // closing it completely needs a small SQL function doing `jsonb_set` under
  // the same `where`, which is a schema change and is deliberately not made
  // here. Written down rather than papered over.
  const claimedAt = new Date().toISOString();
  const claimedArray = suggestions.map((s, i) => (i === index ? { ...s, actedAt: claimedAt } : s));

  const { data: claimed, error: claimError } = await supabase
    .from("day_plans")
    .update({ ai_suggestions: claimedArray })
    .eq("user_id", user.id)
    .eq("plan_date", today)
    .is(`ai_suggestions->${index}->>actedAt`, null)
    .select("id")
    .maybeSingle();

  if (claimError) return { error: "That didn't go through — try again in a moment." };
  if (!claimed) return { error: "That one's already done." };

  // Puts the suggestion back if the tool refuses, so a fixable problem doesn't
  // cost the chip. Re-read first: whatever else happened to the array while the
  // tool was running is kept, and only our own stamp — matched exactly — is
  // cleared.
  const userId = user.id;
  async function release() {
    const { data: fresh } = await supabase
      .from("day_plans")
      .select("ai_suggestions")
      .eq("user_id", userId)
      .eq("plan_date", today)
      .maybeSingle();
    const current = (fresh?.ai_suggestions as OutlookSuggestion[] | null) ?? claimedArray;
    if (current[index]?.actedAt !== claimedAt) return;
    const reopened: OutlookSuggestion[] = current.map((s, i) =>
      i === index ? { ...s, actedAt: null } : s
    );
    await supabase
      .from("day_plans")
      .update({ ai_suggestions: reopened })
      .eq("user_id", userId)
      .eq("plan_date", today)
      .eq(`ai_suggestions->${index}->>actedAt`, claimedAt);
  }

  const ctx: ToolContext = { supabase, userId: user.id };
  // Not released on a THROWN error, only on a returned one: a tool that
  // returned an error refused cleanly and wrote nothing, while a tool that
  // threw may have written half of something. Offering to run that again is
  // the worse of the two failures.
  const result = (await tool.run(ctx, action.args ?? {})) as { error?: string };
  if (result?.error) {
    await release();
    return { error: result.error };
  }

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
