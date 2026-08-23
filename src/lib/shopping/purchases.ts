// The purchase log: what you bought, when, and — when a receipt knows — for
// how much, from whom.
//
// It exists because `shopping_items.last_purchased_at` is a single overwritten
// timestamp. It can say "you last bought milk on the 9th" and nothing else, so
// "you buy milk every nine days" was unknowable and every staple resurfaced on
// one hardcoded 14-day timer. See migration 0028.
//
// Pure functions only — no database — so the arithmetic that decides when
// something comes back onto your list can be checked on its own.

import { daysBetweenDateStrings } from "@/lib/time";

export interface PurchaseRow {
  normalized_name: string;
  purchased_on: string;
  price_cents: number | null;
  merchant: string | null;
}

/**
 * Groups a name the way the log does, so "Milk 2L", "milk 2l" and "MILK  2L"
 * are one item.
 *
 * Deliberately blunt: lowercase, strip anything that isn't a letter or number,
 * collapse whitespace. Not stemming or fuzzy-matching — those belong to
 * `findBestMatch` (lib/finance/fuzzy-match.ts) where a wrong guess costs one
 * mis-ticked item. Here a wrong grouping silently corrupts a price average and
 * a consumption rate, so this stays exact-after-tidying.
 */
export function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Below this many purchases, there isn't a rate — there's a coincidence. */
export const MIN_PURCHASES_TO_LEARN = 3;

/**
 * How often this item actually gets bought, in days.
 *
 * The **median** gap, not the mean: one three-month holiday in the middle of a
 * weekly-milk history would drag a mean far enough to make the item stop
 * resurfacing altogether, where the median shrugs it off. Same reasoning as
 * using a median anywhere else — the outlier is the thing you want ignored.
 *
 * Returns null when there's too little history, so the caller falls back to the
 * setting rather than inventing a rate from two data points.
 */
export function learnedIntervalDays(dates: string[]): number | null {
  const unique = [...new Set(dates)].sort();
  if (unique.length < MIN_PURCHASES_TO_LEARN) return null;

  const gaps: number[] = [];
  for (let i = 1; i < unique.length; i++) {
    const gap = daysBetweenDateStrings(unique[i - 1], unique[i]);
    // A same-day repeat is one shop split across two receipts, not a
    // one-day consumption rate.
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) return null;

  // Clamped: a learned interval under a day would put everything back on the
  // list permanently, and over a year is indistinguishable from "never".
  return Math.min(365, Math.max(1, Math.round(median(gaps))));
}

/**
 * Is this item due back on the list?
 *
 * `fallbackDays` is the Settings value, used whenever the item hasn't been
 * bought enough times to have a rate of its own.
 */
export function isDueToResurface(input: {
  purchaseDates: string[];
  lastPurchasedOn: string | null;
  today: string;
  fallbackDays: number;
  learnFromHistory: boolean;
}): boolean {
  if (!input.lastPurchasedOn) return true;

  const learned = input.learnFromHistory ? learnedIntervalDays(input.purchaseDates) : null;
  const interval = learned ?? input.fallbackDays;
  return daysBetweenDateStrings(input.lastPurchasedOn, input.today) >= interval;
}

export interface PriceSummary {
  normalizedName: string;
  /** The most recent price seen, in cents. */
  lastPriceCents: number;
  lastMerchant: string | null;
  lastSeenOn: string;
  /** Typical price across everything seen, in cents. */
  typicalPriceCents: number;
  observations: number;
}

/**
 * What an item usually costs you.
 *
 * "Typical" is the median again, for the same reason: one bulk 4kg bag among a
 * dozen ordinary 500g ones should not become the price you're compared against.
 */
export function summarisePrices(rows: PurchaseRow[]): PriceSummary | null {
  const priced = rows
    .filter((r) => typeof r.price_cents === "number" && r.price_cents > 0)
    .sort((a, b) => b.purchased_on.localeCompare(a.purchased_on));
  if (priced.length === 0) return null;

  const newest = priced[0];
  return {
    normalizedName: newest.normalized_name,
    lastPriceCents: newest.price_cents!,
    lastMerchant: newest.merchant,
    lastSeenOn: newest.purchased_on,
    typicalPriceCents: Math.round(median(priced.map((r) => r.price_cents!))),
    observations: priced.length,
  };
}

/** How much dearer than usual something has to be before it's worth saying. */
export const DEARER_THRESHOLD = 0.15;

/**
 * "That's more than you usually pay" — or null when it isn't, or when there
 * isn't enough history to have an opinion.
 *
 * Silence is the right answer far more often than a warning is. Two
 * observations is not a habit, and a 3% rise is noise, not news.
 */
export function priceVerdict(
  priceCents: number,
  summary: PriceSummary | null
): { dearer: boolean; percent: number; typicalCents: number } | null {
  if (!summary || summary.observations < 2 || summary.typicalPriceCents <= 0) return null;
  const ratio = priceCents / summary.typicalPriceCents;
  if (ratio < 1 + DEARER_THRESHOLD) return null;
  return {
    dearer: true,
    percent: Math.round((ratio - 1) * 100),
    typicalCents: summary.typicalPriceCents,
  };
}
