import "server-only";

import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/finance/money";
import { resolvePreferences } from "@/lib/preferences";
import type { ModuleAccess } from "@/lib/permissions";
import { callGeminiJson, isAiConfigured } from "./gemini";
import type { SuggestedAction } from "./insights";

// The daily outlook — what today actually looks like, once, across everything.
//
// The weekly insight in insights.ts answers "what pattern am I not seeing in
// myself". This answers a different and more immediate question: "what does
// today look like, and what should I do about it". Neither replaces the other,
// and the reason this is worth a model call at all is the same reason the
// Life Ledger was: no single module can say "you have four tasks and a 2pm,
// rent lands Tuesday so today's $180 is really -$1,270, and you haven't trained
// since Tuesday" — that sentence needs five modules at once.
//
// COST AND CADENCE. One call a day — two on the days the first response
// doesn't parse, since `callGeminiJson` retries once and meters both attempts
// (the same is true of `ensureWeeklyInsight`) — cached on `day_plans` and guarded by that
// table's `unique (user_id, plan_date)` — the same structural guarantee the
// weekly insight leans on, per SPEC.md Part F ("CACHED in the DB — never
// regenerate on page load"). MEASURED 22 Aug 2026 against this exact prompt: a
// loaded weekday costs 673 in / 463 out = 0.22 cents, a quiet Sunday 546 / 410
// = 0.20 cents. Call it 0.2 cents a day, about 7 cents a month.
//
// WHY THIS TAKES ITS FACTS AS AN ARGUMENT rather than fetching them. Today is
// the app's highest-traffic page and it has ALREADY loaded every one of these
// numbers to render its other panels. Re-querying them here would double the
// dashboard's database work on every load — including the loads that hit the
// cache and never call the model at all.

/** Everything the outlook is allowed to know. Assembled by the Today page. */
export interface OutlookFacts {
  /** YYYY-MM-DD in the profile's timezone. */
  date: string;
  weekday: string;
  /** Minutes past midnight, profile timezone — "is the day mostly gone?" */
  nowMinutes: number;
  access: ModuleAccess;

  dueToday: string[];
  overdue: string[];
  routinesDue: string[];

  nextEventTitle: string | null;
  nextEventTime: string | null;

  safeToSpendCents: number | null;
  budgetsOver: number;
  /**
    * `currency` is not decoration. `safe_to_spend_after_those_land` below nets
    * these against a CAD figure, and without it the sum silently added rupees
    * to dollars — the same bug the Today panel had.
    */
  bills: {
    name: string;
    amountCents: number;
    currency: "CAD" | "INR";
    daysAway: number;
    isIncome: boolean;
  }[];

  trainedToday: boolean;
  streak: number;

  shoppingUnchecked: number;
  staplesLow: string[];
}

/**
 * A stored suggestion, plus whether it has been taken.
 *
 * `actedAt` exists so the array is NEVER reordered or shortened. The panel
 * addresses a suggestion by its index, and that index is sent to the server on
 * a tap — so removing a taken item would renumber the list underneath a client
 * still holding the old numbering, and the next tap would run a different
 * action than the one on the button. Marking instead of removing makes the
 * index a stable identity for the life of the day.
 */
export interface OutlookSuggestion extends SuggestedAction {
  actedAt?: string | null;
}

export interface DailyOutlook {
  /** Null means the model was asked and had nothing worth saying. */
  briefing: string | null;
  suggestions: OutlookSuggestion[];
  generatedAt: string;
}

const SYSTEM_PROMPT = `You write a two-or-three sentence read on somebody's day, for the top of their personal dashboard. You are given everything their app knows about today.

Respond ONLY with JSON:
{
  "briefing": string or null,
  "suggestions": [ { "label": string, "tool": string, "args": object } ]
}

What makes a good briefing:
- It JOINS THINGS UP. Anything they can read off a single number on the same screen is wasted words — they can already see four tasks and a balance. The value is in the sentence that needs two or three of those at once: money against a bill that hasn't landed, a free evening against a training gap, a shopping trip against what's running low.
- It is about TODAY specifically. Not a summary of their life, not encouragement, not a plan for the week.
- Use their real figures, exactly as given. Never invent a number, a name or a time. Never round vaguely.
- Lead with whatever actually matters most today. If that is one overdue thing, say that and stop.
- Two or three sentences. Plain English, no headings, no bullet points, no greeting, no sign-off. Do not start with "Today".
- Never moralise, never nag about the streak, never tell them what kind of person they are. Report the day; they are an adult.
- If today is genuinely unremarkable — nothing due, nothing landing, nothing out of the ordinary — set briefing to null. A forced observation is worse than none, and null is a perfectly good answer.

Suggestions: at most three, usually zero or one. Only offer one where there is an obvious, single, reversible next step that follows from what you just said. An empty list is the normal case. Never suggest something they have clearly already done.

Available tools:
- create_task, args: {title: string, horizon?: "now"|"today"|"this_week"|"this_month"|"someday", due_date?: "YYYY-MM-DD"}
- add_shopping_items, args: {items: string[]}
Do not name any other tool.`;

/** Trims the facts to what is worth paying to send, and to what is permitted. */
function summarise(f: OutlookFacts): Record<string, unknown> {
  const out: Record<string, unknown> = {
    date: f.date,
    weekday: f.weekday,
    time_of_day:
      f.nowMinutes < 12 * 60 ? "morning" : f.nowMinutes < 17 * 60 ? "afternoon" : "evening",
  };

  // Module access is enforced by WITHHOLDING the facts, not by asking the model
  // to keep a secret — the same rule the assistant's tool list follows. A
  // person without Money cannot get a briefing that mentions money, because the
  // money never reaches the prompt.
  if (f.access.tasks) {
    out.due_today = f.dueToday.slice(0, 12);
    out.overdue = f.overdue.slice(0, 8);
    out.routines_due = f.routinesDue.slice(0, 8);
  }
  if (f.access.calendar && f.nextEventTitle) {
    out.next_event = { what: f.nextEventTitle, when: f.nextEventTime };
  }
  if (f.access.money) {
    out.safe_to_spend =
      f.safeToSpendCents === null ? null : formatCents(f.safeToSpendCents);
    out.budgets_over_their_limit = f.budgetsOver;
    if (f.bills.length > 0) {
      out.about_to_land = f.bills.slice(0, 6).map((b) => ({
        what: b.name,
        amount: formatCents(b.amountCents, b.currency),
        direction: b.isIncome ? "in" : "out",
        days_away: b.daysAway,
      }));
      // CAD only — safeToSpendCents is CAD, so netting a rupee amount into it
      // would hand the model a figure that is simply wrong, which it would
      // then state confidently.
      const net = f.bills
        .filter((b) => b.currency === "CAD")
        .reduce((n, b) => n + (b.isIncome ? b.amountCents : -b.amountCents), 0);
      if (f.safeToSpendCents !== null) {
        out.safe_to_spend_after_those_land = formatCents(f.safeToSpendCents + net);
      }
    }
  }
  if (f.access.workout) {
    out.trained_today = f.trainedToday;
    out.training_streak_days = f.streak;
  }
  if (f.access.shopping) {
    out.shopping_list_items = f.shoppingUnchecked;
    if (f.staplesLow.length > 0) out.staples_running_low = f.staplesLow.slice(0, 8);
  }
  return out;
}

/** Today's outlook if one has already been written. */
export async function getOutlookForDate(date: string): Promise<DailyOutlook | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("day_plans")
    .select("ai_briefing, ai_suggestions, ai_generated_at")
    .eq("user_id", user.id)
    .eq("plan_date", date)
    .maybeSingle();

  // `ai_generated_at`, not the briefing text, is what marks the day done — a
  // day the model looked at and found unremarkable stores a null briefing, and
  // must not be paid for again on the next page load.
  if (!data?.ai_generated_at) return null;
  return {
    briefing: (data.ai_briefing as string | null) ?? null,
    suggestions: (data.ai_suggestions as OutlookSuggestion[]) ?? [],
    generatedAt: data.ai_generated_at as string,
  };
}

/**
 * Writes today's outlook if there isn't one yet, and returns it either way.
 *
 * Returns null when the feature is off, unconfigured, over budget, or there is
 * genuinely nothing on today worth a call — the Today page renders no panel in
 * every one of those cases rather than an apology.
 */
export async function ensureDailyOutlook(facts: OutlookFacts): Promise<DailyOutlook | null> {
  const existing = await getOutlookForDate(facts.date);
  if (existing) return existing;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .maybeSingle();
  if (!resolvePreferences(profile?.preferences).aiDailyOutlook) return null;
  if (!isAiConfigured()) return null;

  // Don't pay to be told an empty day is empty. This is the cheap version of
  // the judgement the prompt also asks for, made before the call rather than
  // after it — and it is why a brand-new account never sees this panel.
  const somethingToSay =
    facts.dueToday.length +
      facts.overdue.length +
      facts.routinesDue.length +
      facts.bills.length +
      facts.staplesLow.length >
      0 || facts.nextEventTitle !== null || facts.budgetsOver > 0;
  if (!somethingToSay) return null;

  const result = await callGeminiJson({
    feature: "outlook",
    tier: "standard",
    systemPrompt: SYSTEM_PROMPT,
    userText: JSON.stringify(summarise(facts)),
    // Weighing several modules against each other is reasoning, so this buys a
    // little thinking — and the cap holds thinking AND answer, which share it.
    // Three sentences plus three suggestions is a small answer; 1200 is
    // deliberate headroom, not a tuned figure (see models.ts on why).
    thinking: "low",
    maxOutputTokens: 1200,
  });

  const parsed = result as { briefing?: unknown; suggestions?: unknown } | null;
  if (!parsed) return null;

  const briefing =
    typeof parsed.briefing === "string" && parsed.briefing.trim().length > 0
      ? parsed.briefing.trim()
      : null;

  // Only the two tools the prompt offers, and only well-formed ones. A model
  // that invents a tool name gets its suggestion dropped here rather than at
  // tap time, where it would be a dead button.
  const allowed = new Set(["create_task", "add_shopping_items"]);
  const suggestions: OutlookSuggestion[] = Array.isArray(parsed.suggestions)
    ? (parsed.suggestions as unknown[])
        .filter((s): s is SuggestedAction => {
          const a = s as SuggestedAction | null;
          return Boolean(
            a &&
              typeof a.label === "string" &&
              a.label.trim().length > 0 &&
              typeof a.tool === "string" &&
              allowed.has(a.tool)
          );
        })
        .slice(0, 3)
        .map((s) => ({ label: s.label.trim(), tool: s.tool, args: s.args ?? {}, actedAt: null }))
    : [];

  const generatedAt = new Date().toISOString();

  // Upsert rather than insert: `day_plans` may already hold today's top_goals
  // from the evening ritual. Only the three ai_ columns are in the payload, so
  // ON CONFLICT leaves top_goals and evening_reflection alone.
  await supabase.from("day_plans").upsert(
    {
      user_id: user.id,
      plan_date: facts.date,
      ai_briefing: briefing,
      ai_suggestions: suggestions,
      ai_generated_at: generatedAt,
    },
    { onConflict: "user_id,plan_date" }
  );

  if (!briefing && suggestions.length === 0) return null;

  return { briefing, suggestions, generatedAt };
}
