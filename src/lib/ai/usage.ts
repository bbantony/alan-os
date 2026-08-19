import "server-only";

import { createClient } from "@/lib/supabase/server";
import { costMicros, formatMicros, type ModelTier } from "./models";

// The meter, and the brake.
//
// Alan's words when he asked for AI everywhere: "my fear is the expense as
// well since there will be a lot of data". This file is the answer to that
// fear — not a promise that it'll be cheap, but a number he can look at, and a
// hard stop that cannot be exceeded even if something goes wrong in a loop.

/**
 * The monthly ceiling, in micro-dollars. $5 USD.
 *
 * Chosen to be roughly ten times a realistic month (see MANUAL.md's cost
 * section) so it never gets in the way of normal use, while making a runaway
 * bug cost the price of a coffee rather than the price of a phone. Every AI
 * feature checks this before it calls anything; over the line, features fall
 * back to their manual paths rather than failing.
 */
export const MONTHLY_BUDGET_MICROS = 5_000_000;

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

  const { data } = await supabase
    .from("ai_usage")
    .select("cost_micros")
    .eq("user_id", user.id)
    .gte("created_at", monthStartIso());

  const rows = (data as { cost_micros: number }[]) ?? [];
  const spentMicros = rows.reduce((sum, r) => sum + r.cost_micros, 0);

  return {
    spentMicros,
    budgetMicros: MONTHLY_BUDGET_MICROS,
    calls: rows.length,
    remainingMicros: Math.max(0, MONTHLY_BUDGET_MICROS - spentMicros),
    overBudget: spentMicros >= MONTHLY_BUDGET_MICROS,
    label: `${formatMicros(spentMicros)} of ${formatMicros(MONTHLY_BUDGET_MICROS)}`,
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
