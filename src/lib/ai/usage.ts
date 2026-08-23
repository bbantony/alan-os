import "server-only";

import { createClient } from "@/lib/supabase/server";
import { resolvePreferences } from "@/lib/preferences";
import { costMicros, formatMicros, type ModelTier } from "./models";

// The meter, and the brake.
//
// Alan's words when he asked for AI everywhere: "my fear is the expense as
// well since there will be a lot of data". This file is the answer to that
// fear — not a promise that it'll be cheap, but a number he can look at, and a
// hard stop that cannot be exceeded even if something goes wrong in a loop.

/**
 * The default monthly ceiling, in micro-dollars. $5 USD.
 *
 * Recalculated 22 Aug 2026 against the current prices and measured token
 * counts, because the old "roughly ten times a realistic month" stopped being
 * true when the models changed.
 *
 * Measured: an assistant question costs ~$0.0019 answered and ~$0.0038 acted on
 * in two turns. But the upper bound must come from `MAX_STEPS` in assistant.ts,
 * not from the two-turn case — the loop allows FOUR turns, each resending the
 * system prompt and the whole thirteen-tool schema with the accumulated tool
 * results on top, so a four-step question lands near $0.0085. Thirty of those a
 * day for a month is about $7.65, which is ALREADY OVER this $5 default.
 *
 * So: a normal month is about $1, a heavy month about $3.50, and a pathological
 * month of nothing but four-step questions exceeds the ceiling and switches the
 * AI off. That is the brake working as intended, but it is a real ceiling now,
 * not a theoretical one, and raising MAX_STEPS would move it closer.
 *
 * TWO DATED CONSEQUENCES. The promotional pricing behind those figures ends
 * 31 Dec 2026 and doubles; a heavy month then exceeds $5 in ordinary use and
 * this default must go up with it. And on a FREE-tier key nothing is billed at
 * all, so this ceiling can stop the AI while Google has charged nothing —
 * MANUAL.md explains that to Alan in plain English.
 *
 * Every AI feature checks the ceiling before calling anything; over the line,
 * features fall back to their manual paths rather than failing.
 *
 * This is now only the default — the live value comes from the account's
 * preferences (Settings → AI & cost), resolved per request below.
 */
export const MONTHLY_BUDGET_MICROS = 5_000_000;

/** The account's own ceiling, falling back to the default. */
async function budgetFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<number> {
  const { data } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  return resolvePreferences(data?.preferences).aiMonthlyBudgetMicros;
}

export interface UsageSummary {
  spentMicros: number;
  budgetMicros: number;
  calls: number;
  remainingMicros: number;
  overBudget: boolean;
  /** e.g. "$0.42 of $5.00" */
  label: string;
}

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function getUsageSummary(): Promise<UsageSummary> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const empty: UsageSummary = {
    spentMicros: 0,
    budgetMicros: MONTHLY_BUDGET_MICROS,
    calls: 0,
    remainingMicros: MONTHLY_BUDGET_MICROS,
    overBudget: false,
    label: `${formatMicros(0)} of ${formatMicros(MONTHLY_BUDGET_MICROS)}`,
  };
  if (!user) return empty;

  const [{ data }, budgetMicros] = await Promise.all([
    supabase
      .from("ai_usage")
      .select("cost_micros")
      .eq("user_id", user.id)
      .gte("created_at", monthStartIso()),
    budgetFor(supabase, user.id),
  ]);

  const rows = (data as { cost_micros: number }[]) ?? [];
  const spentMicros = rows.reduce((sum, r) => sum + r.cost_micros, 0);

  return {
    spentMicros,
    budgetMicros,
    calls: rows.length,
    remainingMicros: Math.max(0, budgetMicros - spentMicros),
    overBudget: spentMicros >= budgetMicros,
    label: `${formatMicros(spentMicros)} of ${formatMicros(budgetMicros)}`,
  };
}

/** True when there's still room in this month's budget. */
export async function withinBudget(): Promise<boolean> {
  const summary = await getUsageSummary();
  return !summary.overBudget;
}

/**
 * Records one model call. Never throws: a failure to write the meter must not
 * take down the feature that was being metered, and a missing row costs
 * accuracy in a report rather than correctness in the app.
 */
export async function recordUsage(input: {
  feature: string;
  tier: ModelTier;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("ai_usage").insert({
      user_id: user.id,
      feature: input.feature,
      model: input.modelId,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cost_micros: costMicros(input.tier, input.inputTokens, input.outputTokens),
    });
  } catch {
    // Metering is best-effort by design. See above.
  }
}

export interface FeatureBreakdown {
  feature: string;
  calls: number;
  costMicros: number;
}

/** This month's spend split by feature — what the cost screen shows. */
export async function getUsageByFeature(): Promise<FeatureBreakdown[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("ai_usage")
    .select("feature, cost_micros")
    .eq("user_id", user.id)
    .gte("created_at", monthStartIso());

  const totals = new Map<string, FeatureBreakdown>();
  for (const row of (data as { feature: string; cost_micros: number }[]) ?? []) {
    const existing = totals.get(row.feature) ?? { feature: row.feature, calls: 0, costMicros: 0 };
    existing.calls += 1;
    existing.costMicros += row.cost_micros;
    totals.set(row.feature, existing);
  }
  return [...totals.values()].sort((a, b) => b.costMicros - a.costMicros);
}
