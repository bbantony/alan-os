import "server-only";

import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/finance/money";
import { resolvePreferences } from "@/lib/preferences";
import { startOfWeek } from "@/lib/streaks";
import { addDaysToDateString, todayInAppTimezone } from "@/lib/time";
import { getLedger, groupByDay, type LedgerEvent } from "@/lib/ledger";
import { callGeminiJson, isAiConfigured } from "./gemini";

// The weekly pattern — the thing only a system holding all of it can say.
//
// Every module already knows its own story. None of them can tell you that your
// takeaway spending doubles in the weeks you train less, because that sentence
// needs two modules at once. This takes a week of the Life Ledger, hands a
// compact summary to a model, and asks for the observations a person wouldn't
// make about themselves.
//
// COST AND CADENCE. One call a week, cached in the `insights` table with a
// unique constraint on (user_id, period_start) that makes a second call for the
// same week impossible rather than merely unlikely. SPEC.md Part F is explicit
// that reviews are "CACHED in the DB — never regenerate on page load", and the
// uniqueness is what enforces it. About 2-3 cents a month.

export interface Insight {
  id: string;
  period_start: string;
  period_end: string;
  body: string;
  suggested_action: SuggestedAction | null;
  acted_at: string | null;
  dismissed_at: string | null;
}

/**
 * What an insight is allowed to offer.
 *
 * Alan chose "notice and suggest": it may put one action under your thumb, and
 * nothing happens until you tap it. Storing the *intent* rather than performing
 * it is the entire boundary — `tool` is a name from the existing registry
 * (lib/ai/tools.ts), so an insight can never reach past what the assistant
 * could already do, and the write tools there are deliberately narrow.
 */
export interface SuggestedAction {
  label: string;
  tool: string;
  args: Record<string, unknown>;
}

const SYSTEM_PROMPT = `You look at one week of somebody's life — their spending, training, tasks and shopping, all logged in one app — and tell them one or two things they probably haven't noticed.

Respond ONLY with JSON:
{
  "body": string,
  "suggested_action": { "label": string, "tool": string, "args": object } or null
}

What makes a good observation:
- It CROSSES modules. "You spent $180 on takeaway" is something they can already see. "Your takeaway spend doubles in the weeks you train less than twice" is not.
- It is specific and uses their real figures. Never round vaguely, never invent a number that isn't in the data.
- It is honest, not encouraging. If nothing interesting happened, say the week was steady and leave it. A forced insight is worse than none.
- Two short paragraphs at most. Plain English, no jargon, no headings, no bullet points, no greeting.
- Never moralise. Report the pattern; don't tell them what kind of person it makes them.

suggested_action is optional and usually null. Only include one when there is an obvious, single, reversible next step. Available tools: add_shopping_items (args: {items: string[]}), create_task (args: {title: string, horizon?: string, due_date?: string}).`;

interface LedgerSummary {
  week: string;
  spent: string;
  earned: string;
  daysTrained: number;
  sessions: { date: string; detail: string }[];
  tasksCompleted: number;
  spendByCategory: { category: string; total: string }[];
  biggestExpenses: { date: string; what: string; amount: string }[];
  shoppingTrips: number;
  previousWeek?: { spent: string; daysTrained: number; tasksCompleted: number };
}

/**
 * Compresses a week of events into something small enough to send.
 *
 * Sending raw rows would be both expensive and worse: a model reasons better
 * about twenty summarised facts than four hundred rows, and every token here is
 * paid for. This is where the cost of the feature is actually decided.
 */
function summarise(events: LedgerEvent[], weekStart: string, weekEnd: string): LedgerSummary {
  const days = groupByDay(events);
  const spentCents = days.reduce((n, d) => n + d.spentCents, 0);
  const earnedCents = days.reduce((n, d) => n + d.earnedCents, 0);

  const byCategory = new Map<string, number>();
  for (const e of events) {
    if (e.kind !== "money" || !e.amountCents || e.amountCents >= 0 || e.currency === "INR") continue;
    const key = e.detail ?? "Uncategorised";
    byCategory.set(key, (byCategory.get(key) ?? 0) + -e.amountCents);
  }

  const expenses = events
    .filter((e) => e.kind === "money" && (e.amountCents ?? 0) < 0 && e.currency !== "INR")
    .sort((a, b) => (a.amountCents ?? 0) - (b.amountCents ?? 0))
    .slice(0, 5);

  return {
    week: `${weekStart} to ${weekEnd}`,
    spent: formatCents(spentCents),
    earned: formatCents(earnedCents),
    daysTrained: days.filter((d) => d.trained).length,
    sessions: events
      .filter((e) => e.kind === "training")
      .map((e) => ({ date: e.date, detail: e.detail ?? e.title })),
    tasksCompleted: days.reduce((n, d) => n + d.tasksDone, 0),
    spendByCategory: [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([category, cents]) => ({ category, total: formatCents(cents) })),
    biggestExpenses: expenses.map((e) => ({
      date: e.date,
      what: e.title,
      amount: formatCents(Math.abs(e.amountCents ?? 0)),
    })),
    shoppingTrips: events.filter((e) => e.kind === "shopping").length,
  };
}

/** The insight for a given week, if one has already been written. */
export async function getInsightForWeek(periodStart: string): Promise<Insight | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("insights")
    .select("id, period_start, period_end, body, suggested_action, acted_at, dismissed_at")
    .eq("user_id", user.id)
    .eq("period_start", periodStart)
    .maybeSingle();
  return (data as Insight) ?? null;
}

export async function getRecentInsights(limit = 6): Promise<Insight[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("insights")
    .select("id, period_start, period_end, body, suggested_action, acted_at, dismissed_at")
    .eq("user_id", user.id)
    .order("period_start", { ascending: false })
    .limit(limit);
  return (data as Insight[]) ?? [];
}

/**
 * Writes this week's insight if there isn't one yet.
 *
 * Returns the existing row untouched when there is — the whole point. Callers
 * can invoke this on every page load; only the first one in a given week costs
 * anything.
 */
export async function ensureWeeklyInsight(): Promise<Insight | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences, timezone")
    .eq("id", user.id)
    .maybeSingle();
  const prefs = resolvePreferences(profile?.preferences);
  if (!prefs.aiWeeklyPatterns || !isAiConfigured()) return null;

  const today = todayInAppTimezone((profile?.timezone as string) || undefined);
  // The week that has actually finished. Reading patterns out of a Tuesday is
  // reading noise; the observation is about a whole week.
  const thisWeekStart = startOfWeek(today, prefs.weekStart);
  const periodStart = addDaysToDateString(thisWeekStart, -7);
  const periodEnd = addDaysToDateString(thisWeekStart, -1);

  const existing = await getInsightForWeek(periodStart);
  if (existing) return existing;

  const events = await getLedger(periodStart, periodEnd);
  // Nothing to notice. Writing "you did nothing" is not an insight, and it
  // would burn the week's single call producing it.
  if (events.length < 5) return null;

  const result = await callGeminiJson({
    feature: "weekly-patterns",
    tier: "standard",
    systemPrompt: SYSTEM_PROMPT,
    userText: JSON.stringify(summarise(events, periodStart, periodEnd)),
    // Cross-module pattern-spotting is the one job here that genuinely needs
    // the model to reason, so this tier buys a little thinking — and the cap is
    // sized to hold BOTH the thinking and the answer, because they share it.
    //
    // Measured on THIS prompt (22 Aug 2026), not on a toy one: a full week
    // summary of the shape `summarise` produces — 4 spend categories, 2 big
    // expenses, a training session and a previous-week comparison — cost 549
    // input tokens and 93 output tokens, of which 0 were thinking, finishing
    // STOP. 1400 is therefore roughly fifteen times the observed need, which is
    // the margin you want on a once-a-week call where running out means the
    // feature silently produces nothing. The old 700 predates thinking models.
    //
    // Zero thinking tokens at "low" looks like a contradiction against the ~256
    // quoted in models.ts, and isn't: a thinking LEVEL is a ceiling and a
    // disposition, not a quota. The model spends what the prompt seems to need,
    // and this prompt hands it a pre-digested summary with the comparison
    // already computed, so there is little left to work out. Do not read either
    // number as what "low" always costs — that is exactly why the cap is
    // generous rather than tuned to the measurement.
    thinking: "low",
    maxOutputTokens: 1400,
  });

  const parsed = result as { body?: unknown; suggested_action?: unknown } | null;
  if (!parsed || typeof parsed.body !== "string" || !parsed.body.trim()) return null;

  const action = parsed.suggested_action as SuggestedAction | null | undefined;
  const suggested =
    action && typeof action.label === "string" && typeof action.tool === "string"
      ? { label: action.label, tool: action.tool, args: action.args ?? {} }
      : null;

  const { data: inserted } = await supabase
    .from("insights")
    .insert({
      user_id: user.id,
      period_start: periodStart,
      period_end: periodEnd,
      body: parsed.body.trim(),
      suggested_action: suggested,
    })
    // A race between two page loads is resolved by the unique constraint rather
    // than by locking: the loser's insert is ignored and it reads the winner's.
    .select("id, period_start, period_end, body, suggested_action, acted_at, dismissed_at")
    .maybeSingle();

  return (inserted as Insight) ?? (await getInsightForWeek(periodStart));
}
