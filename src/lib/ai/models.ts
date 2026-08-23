// The one place a model name, a price, or a thinking level appears.
//
// Everything else in the app asks for a *tier* — "cheap", "standard",
// "deep" — and this file decides what that means today. When Google retires a
// model or ships a cheaper one, this is the only file that changes, and the
// cost estimates stay honest because they're computed from the same table the
// billing is.
//
// Prices are US dollars per million tokens, stored as MICRO-dollars
// (millionths of a dollar) so nothing here is ever a float — the same rule
// money follows everywhere else in this app. Checked against
// ai.google.dev/gemini-api/docs/pricing on 22 Aug 2026.

export type ModelTier = "cheap" | "standard" | "deep";

/**
 * How much private reasoning the model is allowed before it answers.
 *
 * This is a COST control, not a quality dial, and it is the single most
 * expensive setting in the app. Gemini 3.x models think to themselves first,
 * those thought tokens are billed at the OUTPUT rate, and they are drawn from
 * the same `maxOutputTokens` allowance as the answer itself. Left unset, the
 * API picks its own generous default: measured on 22 Aug 2026, extracting a
 * task from "dentist next tuesday at 3pm" produced an 18-token answer behind
 * 982 tokens of thinking — a 50x bill for no better result, and enough to
 * exhaust a small output cap before the answer starts, which reads downstream
 * as "the AI silently did nothing".
 *
 * Measured on that same prompt: minimal 0, high 55, medium 63, low 256, unset
 * 982 — all four returning the correct answer. Higher is not reliably more
 * thinking; treat these as named behaviours, not a ladder.
 *
 * `thinkingBudget`, the numeric Gemini 2.5-era parameter, is rejected by 3.x
 * and must not be reintroduced.
 */
export type ThinkingLevel = "minimal" | "low" | "medium" | "high";

export interface ModelSpec {
  /** The id sent to the API. */
  id: string;
  /** Micro-dollars per million input tokens. */
  inputMicrosPerMillion: number;
  /**
   * Micro-dollars per million output tokens. Thinking tokens bill at this
   * rate too, which is why `recordUsage` counts them as output.
   */
  outputMicrosPerMillion: number;
  /** How hard this tier thinks unless a caller overrides it. */
  thinking: ThinkingLevel;
  /** Plain-English note for the cost screen. */
  note: string;
}

// WHY THESE THREE, 22 Aug 2026. The account's key is a NEW key, and new keys
// are cut off from the entire Gemini 2.5 family — `gemini-2.5-flash`,
// `-flash-lite` and `-pro` all return 404 "no longer available to new users".
// The key is also on the FREE tier, where every Pro model returns 429 "you
// exceeded your current quota". So the deep tier cannot be a Pro model, and
// is instead the newest flash allowed to think hard. Its per-token price is
// identical to standard's — checked on Google's pricing page, not assumed:
// 3.6-flash and 3.7-flash are both $0.75/$3.75 — so the cost screen stays
// truthful without a fourth price row. Re-check if the deep tier ever moves to
// a different model.
export const MODELS: Record<ModelTier, ModelSpec> = {
  // Bulk, mechanical work over lots of rows: CSV categorisation, tagging.
  // Nothing here requires reasoning — it is transcription — so it does not
  // pay for any.
  cheap: {
    id: "gemini-3.1-flash-lite",
    inputMicrosPerMillion: 250_000, // $0.25
    outputMicrosPerMillion: 1_500_000, // $1.50
    thinking: "minimal",
    note: "Bulk sorting — CSV imports.",
  },
  // The everyday model: the assistant, receipt reading, weekly patterns and the
  // daily outlook.
  // Multimodal, supports function calling, and cheap enough that a heavy day
  // costs pennies.
  //
  // NOTE, and this one has a date on it: the $0.75/$3.75 promotional pricing
  // below runs through 31 Dec 2026 and doubles to $1.50/$7.50 on 1 Jan 2027.
  // Update these two numbers then or the cost screen starts under-reporting.
  standard: {
    id: "gemini-3.6-flash",
    inputMicrosPerMillion: 750_000, // $0.75
    outputMicrosPerMillion: 3_750_000, // $3.75
    thinking: "minimal",
    // Rendered verbatim on Settings → AI & cost, so it must name only jobs that
    // actually exist. The daily outlook was added here when it shipped, in the
    // same session — keep that rule if anything else joins this tier.
    note: "The assistant, receipts, weekly patterns, the daily outlook.",
  },
  // Reserved for long, once-a-month reasoning over a lot of context: the
  // month-in-review write-up. Same price per token as standard, but allowed to
  // think properly — which is where the real cost difference lands, and why
  // this tier is affordable at once a month and would not be at once a message.
  //
  // TRAP FOR WHOEVER BUILDS THE MONTHLY REVIEW: this is the only tier that
  // thinks hard, and `callGeminiJson` defaults to just 1024 maxOutputTokens.
  // Thinking is drawn from that same allowance, so a deep call left on the
  // default cap can spend the whole budget reasoning and return empty text —
  // which reads as "the review silently didn't work". Pass an explicit,
  // generous maxOutputTokens on every deep call.
  deep: {
    id: "gemini-3.7-flash",
    inputMicrosPerMillion: 750_000, // $0.75
    outputMicrosPerMillion: 3_750_000, // $3.75
    thinking: "high",
    // Same rule as the standard note above: this string is rendered verbatim on
    // Settings → AI & cost for all three tiers, whether or not anything uses the
    // tier. Nothing calls deep yet, so it must not claim to be doing monthly
    // reviews. Change this to "Monthly reviews." when the monthly review ships.
    note: "Not in use yet.",
  },
};

export function costMicros(tier: ModelTier, inputTokens: number, outputTokens: number): number {
  const spec = MODELS[tier];
  return Math.round(
    (inputTokens * spec.inputMicrosPerMillion) / 1_000_000 +
      (outputTokens * spec.outputMicrosPerMillion) / 1_000_000
  );
}

/** Micro-dollars as a readable string: 1_234_567 -> "$1.23". */
export function formatMicros(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars > 0 && dollars < 0.01) return "under $0.01";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "USD" }).format(dollars);
}
