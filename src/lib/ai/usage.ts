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
 * system prompt and the whole tool schema with the accumulated tool results on
 * top, so a four-step question lands near $0.0085. Thirty of those a day for a
 * month is about $7.65, which is ALREADY OVER this $5 default.
 *
 * RECHECK THIS FIGURE. It was measured against a THIRTEEN-tool schema. The
 * assistant now carries TWENTY, because Alan asked for one that can change
 * things rather than only read them — and the schema is resent on every turn,
 * so the input cost of every question went up with it. The tools were
 * deliberately consolidated (one `update_task` with an action, not four
 * separate tools) to hold that down, but the number above is now an
 * underestimate and needs re-measuring against a real four-step question.
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
  /**
   * True when the spend total could not be read at all.
   *
   * Alan's decision when this was put to him: CARRY ON rather than stop the AI
   * — "just keep going". So `overBudget` stays false and every feature keeps
   * working. But carrying on silently would mean spending with no ceiling and
   * no way to know, so the AI settings screen shows this, and it is the one
   * honest thing to say: the number on screen is not the real number.
   */
  meterUnavailable: boolean;
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
    meterUnavailable: false,
  };
  if (!user) return empty;

  // Summed in SQL, NOT in JavaScript. This used to select every row for the
  // month and add them up here — and PostgREST caps a plain select at 1000
  // rows, so past 1000 calls the total silently stopped growing, the ceiling
  // could never be reached, and the "hard stop" this file is named for failed
  // open at exactly the point it was needed. See migration 0035.
  const [{ data, error }, budgetMicros] = await Promise.all([
    supabase.rpc("ai_usage_month_total", { since: monthStartIso() }),
    budgetFor(supabase, user.id),
  ]);

  // The lookup failing is NOT the same as having spent nothing. Reading $0
  // here lets every AI feature carry on with no ceiling — which is what Alan
  // asked for, but it must be visible rather than assumed.
  const meterUnavailable = Boolean(error);
  if (error) {
    console.error(
      `[ai] could not read this month's spend (${error.code ?? "no code"}): ${error.message}. ` +
        `The cost ceiling is NOT being enforced. Has migration 0035 been applied?`
    );
  }

  const row = (data as { spent_micros: number | string; call_count: number | string }[] | null)?.[0];
  // bigint comes back over the wire as a string once it is large enough.
  const spentMicros = Number(row?.spent_micros ?? 0);
  const calls = Number(row?.call_count ?? 0);

  return {
    spentMicros,
    budgetMicros,
    calls,
    remainingMicros: Math.max(0, budgetMicros - spentMicros),
    // Never over budget on a failed read — that would switch the AI off
    // because of a database blip, which is the opposite of what was asked for.
    overBudget: !meterUnavailable && spentMicros >= budgetMicros,
    label: `${formatMicros(spentMicros)} of ${formatMicros(budgetMicros)}`,
    meterUnavailable,
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

    // Through the definer, not a direct insert: `ai_usage` is read-only to the
    // client as of 0035, because a meter the metered party can edit is a
    // record and not a brake. The function stamps auth.uid() itself.
    const { error } = await supabase.rpc("record_ai_usage", {
      p_feature: input.feature,
      p_model: input.modelId,
      p_input_tokens: input.inputTokens,
      p_output_tokens: input.outputTokens,
      p_cost_micros: costMicros(input.tier, input.inputTokens, input.outputTokens),
    });
    // LOGGED, not swallowed. Metering staying best-effort is deliberate — a
    // failed write must not take down the feature being metered. But this is
    // now a single point of failure: `ai_usage` is read-only to the client, so
    // if this one function is missing or erroring, NOTHING is metered, the
    // month reads $0, and the ceiling can never be reached. Silence there is
    // the same failure mode as the 1000-row bug this replaced. In particular,
    // this is exactly what happens if the code deploys before migration 0035.
    if (error) {
      console.error(
        `[ai] metering failed for ${input.feature} (${error.code ?? "no code"}): ${error.message}. ` +
          `The monthly cost ceiling is NOT being enforced. Has migration 0035 been applied?`
      );
    }
  } catch (error) {
    console.error(
      `[ai] metering threw for ${input.feature}: ${
        error instanceof Error ? error.message : String(error)
      }. The monthly cost ceiling is NOT being enforced.`
    );
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

  // Grouped in SQL for the same reason the total is — the old version read
  // every row and grouped here, so the breakdown quietly stopped counting at
  // 1000 calls too.
  const { data } = await supabase.rpc("ai_usage_month_by_feature", {
    since: monthStartIso(),
  });

  return (
    (data as { feature: string; call_count: number | string; cost_micros: number | string }[] | null) ?? []
  ).map((row) => ({
    feature: row.feature,
    calls: Number(row.call_count),
    costMicros: Number(row.cost_micros),
  }));
}
