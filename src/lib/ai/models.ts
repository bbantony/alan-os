// The one place a model name or a price appears.
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
// ai.google.dev/gemini-api/docs/pricing on 18 Aug 2026.

export type ModelTier = "cheap" | "standard" | "deep";

export interface ModelSpec {
  /** The id sent to the API. */
  id: string;
  /** Micro-dollars per million input tokens. */
  inputMicrosPerMillion: number;
  /** Micro-dollars per million output tokens. */
  outputMicrosPerMillion: number;
  /** Plain-English note for the cost screen. */
  note: string;
}

export const MODELS: Record<ModelTier, ModelSpec> = {
  // Bulk, mechanical work over lots of rows: CSV categorisation, tagging.
  //
  // NOTE, and this one has a date on it: gemini-2.5-flash-lite is scheduled
  // for retirement on 16 October 2026. When it goes, the cheapest replacement
  // is gemini-3.1-flash-lite at $0.25/$1.50 — change the three values below
  // and nothing else in the app needs to move.
  cheap: {
    id: "gemini-2.5-flash-lite",
    inputMicrosPerMillion: 100_000, // $0.10
    outputMicrosPerMillion: 400_000, // $0.40
    note: "Bulk sorting — CSV imports.",
  },
  // The everyday model: the assistant, receipt reading, briefings. Multimodal,
  // supports function calling, and cheap enough that a heavy day costs pennies.
  standard: {
    id: "gemini-2.5-flash",
    inputMicrosPerMillion: 300_000, // $0.30
    outputMicrosPerMillion: 2_500_000, // $2.50
    note: "The assistant, receipts, daily briefings.",
  },
  // Reserved for long, once-a-month reasoning over a lot of context: the
  // month-in-review write-up. Roughly 4x the input price and 4x the output
  // price of standard, which is affordable at once a month and would not be
  // at once a message.
  deep: {
    id: "gemini-2.5-pro",
    inputMicrosPerMillion: 1_250_000, // $1.25
    outputMicrosPerMillion: 10_000_000, // $10.00
    note: "Monthly reviews only.",
  },
};

export function costMicros(tier: ModelTier, inputTokens: number, outputTokens: number): number {
  const spec = MODELS[tier];
  return Math.round(
    (inputTokens * spec.inputMicrosPerMillion) / 1_000_000 +
      (outputTokens * spec.outputMicrosPerMillion) / 1_000_000
  );
}

export function tierForModelId(id: string): ModelTier | null {
  for (const [tier, spec] of Object.entries(MODELS) as [ModelTier, ModelSpec][]) {
    if (spec.id === id) return tier;
  }
  return null;
}

/** Micro-dollars as a readable string: 1_234_567 -> "$1.23". */
export function formatMicros(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars > 0 && dollars < 0.01) return "under $0.01";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "USD" }).format(dollars);
}
