import "server-only";
import { callGeminiJson, isAiConfigured } from "./gemini";

export interface ReceiptExtractionLineItem {
  raw_name: string;
  clean_name: string;
  price_cents: number;
  category_guess: string | null;
}

export interface ReceiptExtraction {
  merchant: string | null;
  date: string | null; // YYYY-MM-DD
  total_cents: number | null;
  line_items: ReceiptExtractionLineItem[];
}

const SYSTEM_PROMPT = `You read a photo of a retail receipt and extract structured data from it.

Respond ONLY with JSON in exactly this shape, no other text:
{
  "merchant": string or null,
  "date": string or null (format YYYY-MM-DD),
  "total_cents": integer or null,
  "line_items": [
    { "raw_name": string, "clean_name": string, "price_cents": integer, "category_guess": string or null }
  ]
}

Rules:
- All prices are integer cents (e.g. $4.99 becomes 499).
- "raw_name" is exactly what's printed on the receipt (e.g. "GV 2% MLK 2L").
- "clean_name" is a de-abbreviated, human-readable version (e.g. "Milk 2% 2L").
- "category_guess" is your best single-word-ish guess at a spending category
  (e.g. "Groceries", "Takeout", "Health/Gym") or null if you can't tell.
- Do not include tax or the total itself as a line item — only actual purchased items.
- If a field genuinely can't be read from the image, use null rather than guessing wildly.`;

export async function extractReceiptData(imageBase64: string, mimeType: string): Promise<ReceiptExtraction | null> {
  if (!isAiConfigured()) return null;

  const result = await callGeminiJson({
    systemPrompt: SYSTEM_PROMPT,
    imageBase64,
    imageMimeType: mimeType,
    maxOutputTokens: 1536,
  });
  if (!result || typeof result !== "object") return null;

  const r = result as Record<string, unknown>;
  if (!Array.isArray(r.line_items)) return null;

  return {
    merchant: typeof r.merchant === "string" ? r.merchant : null,
    date: typeof r.date === "string" ? r.date : null,
    total_cents: typeof r.total_cents === "number" ? Math.round(r.total_cents) : null,
    line_items: r.line_items
      .filter((li): li is Record<string, unknown> => typeof li === "object" && li !== null)
      .map((li) => ({
        raw_name: typeof li.raw_name === "string" ? li.raw_name : "Item",
        clean_name: typeof li.clean_name === "string" ? li.clean_name : typeof li.raw_name === "string" ? li.raw_name : "Item",
        price_cents: typeof li.price_cents === "number" ? Math.round(li.price_cents) : 0,
        category_guess: typeof li.category_guess === "string" ? li.category_guess : null,
      })),
  };
}
