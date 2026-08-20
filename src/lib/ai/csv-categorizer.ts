import "server-only";
import { callGeminiJson, isAiConfigured } from "./gemini";
import { aiFeatureEnabled } from "./feature-flags";

export interface CsvCategorizationRow {
  merchant: string;
  amountCents: number;
}

// One batched call per CSV import (not one per row) per SPEC.md Part F's
// cost guardrails. Returns null (never partial/wrong-length results) if AI
// isn't configured, the call fails, or the response doesn't line up with the
// input — callers fall back to heuristic recent-merchant matching either way.
export async function categorizeCsvRows(
  rows: CsvCategorizationRow[],
  categoryNames: string[]
): Promise<(string | null)[] | null> {
  if (!isAiConfigured() || rows.length === 0) return null;
  if (!(await aiFeatureEnabled("aiCsvImport"))) return null;

  const systemPrompt = `You categorize bank transactions. Given a JSON array of
{merchant, amountCents} objects, respond ONLY with a JSON array of category
names, same length and order as the input — one category per transaction,
chosen from exactly this list: ${categoryNames.join(", ")}. If you're not
confident for a given transaction, use null for that entry instead of guessing.`;

  const result = await callGeminiJson({
    // The cheap tier: this is mechanical sorting over many rows at once, which
    // is exactly what the cheapest model is for. See models.ts.
    feature: "csv-import",
    tier: "cheap",
    systemPrompt,
    userText: JSON.stringify(rows),
    maxOutputTokens: 2048,
  });
  if (!Array.isArray(result) || result.length !== rows.length) return null;

  return result.map((c) => (typeof c === "string" && categoryNames.includes(c) ? c : null));
}
