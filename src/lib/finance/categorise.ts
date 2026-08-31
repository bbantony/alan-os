/**
 * Working out which category a transaction belongs in, without asking.
 *
 * Alan asked for two things from Money: one screen that logs every kind of
 * transaction, and categories that "fill themselves in". This is the second.
 *
 * THE ORDER MATTERS, and it is deliberately not AI-first.
 *
 *   1. What YOU did last time. If Superstore has been Groceries eleven times,
 *      it is Groceries. This is free, instant, offline, and more accurate than
 *      any model for the merchants that make up most of a real month.
 *   2. A keyword table, for merchants with no history yet.
 *   3. Nothing — leave it blank rather than guess badly.
 *
 * There is no model call here on purpose. Receipt scanning and CSV import
 * already pay for AI where a human genuinely can't do the job by hand; typing
 * "Superstore" into a form is not that, and a per-keystroke model call would
 * be the single most expensive thing in the app. If the keyword table misses,
 * a blank category costs one tap; a wrong one costs a wrong budget.
 */

export interface MerchantMemoryEntry {
  /** The spelling to show, from the most recent time it was used. */
  merchant: string;
  categoryId: string;
  /** How many times this merchant went to this category. Confidence. */
  count: number;
}

export function normaliseMerchant(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Merchant fragments that map to one of the DEFAULT category names seeded in
 * migration 0016. Matched as substrings against a lowercased merchant, longest
 * first — so "canadian tire gas" doesn't get filed by "tire" when "gas" is the
 * more specific hit.
 *
 * Weighted towards what a Winnipeg shop actually looks like on a statement.
 * This is a starter list, not a taxonomy: once a merchant has been used once,
 * the learned memory above takes over and this never runs for it again.
 */
const KEYWORD_TO_CATEGORY: Record<string, string> = {
  // Groceries
  superstore: "Groceries", "no frills": "Groceries", safeway: "Groceries",
  sobeys: "Groceries", "food fare": "Groceries", costco: "Groceries",
  walmart: "Groceries", "giant tiger": "Groceries", "save on foods": "Groceries",
  "farm boy": "Groceries", loblaws: "Groceries", "real canadian": "Groceries",
  grocery: "Groceries", market: "Groceries",

  // Takeout
  "tim horton": "Takeout", starbucks: "Takeout", mcdonald: "Takeout",
  subway: "Takeout", "a&w": "Takeout", wendy: "Takeout", "burger king": "Takeout",
  "pizza": "Takeout", skipthedishes: "Takeout", doordash: "Takeout",
  ubereats: "Takeout", "uber eats": "Takeout", restaurant: "Takeout",
  cafe: "Takeout", coffee: "Takeout", "second cup": "Takeout",

  // Transport
  petro: "Transport", esso: "Transport", shell: "Transport", husky: "Transport",
  "co-op gas": "Transport", gas: "Transport", uber: "Transport", lyft: "Transport",
  "winnipeg transit": "Transport", parking: "Transport", "impark": "Transport",

  // Subscriptions
  netflix: "Subscriptions", spotify: "Subscriptions", "prime video": "Subscriptions",
  disney: "Subscriptions", crave: "Subscriptions", youtube: "Subscriptions",
  icloud: "Subscriptions", "google one": "Subscriptions", dropbox: "Subscriptions",
  patreon: "Subscriptions", subscription: "Subscriptions",

  // Utilities
  hydro: "Utilities", "manitoba hydro": "Utilities", telus: "Utilities",
  rogers: "Utilities", bell: "Utilities", shaw: "Utilities", "internet": "Utilities",
  "water bill": "Utilities",

  // Health / Gym
  "goodlife": "Health/Gym", "gym": "Health/Gym", pharmacy: "Health/Gym",
  "shoppers drug": "Health/Gym", rexall: "Health/Gym", dental: "Health/Gym",
  dentist: "Health/Gym", "walk-in": "Health/Gym",

  // Entertainment
  cineplex: "Entertainment", cinema: "Entertainment", steam: "Entertainment",
  "playstation": "Entertainment", nintendo: "Entertainment", concert: "Entertainment",

  // Rent
  rent: "Rent", landlord: "Rent", "property management": "Rent",

  // Remittance
  remitly: "Remittance", wise: "Remittance", westernunion: "Remittance",
  "western union": "Remittance", remittance: "Remittance",
};

const KEYWORDS_LONGEST_FIRST = Object.keys(KEYWORD_TO_CATEGORY).sort(
  (a, b) => b.length - a.length
);

export interface CategoryGuess {
  categoryId: string;
  /** Where it came from, so the UI can say "because you usually do". */
  source: "learned" | "keyword";
  /** Only set for "learned" — how many past transactions back it up. */
  count?: number;
}

/**
 * The best guess for a merchant, or null.
 *
 * `categories` is the account's own list, so a keyword hit that names a
 * category the person has renamed or deleted simply doesn't match and falls
 * through to null — better than resurrecting a category they got rid of.
 */
export function guessCategoryForMerchant(
  merchant: string,
  memory: MerchantMemoryEntry[],
  categories: { id: string; name: string; kind: string }[],
  kind: "expense" | "income" = "expense"
): CategoryGuess | null {
  const key = normaliseMerchant(merchant);
  if (!key) return null;

  const allowed = new Set(categories.filter((c) => c.kind === kind).map((c) => c.id));

  // 1. Exactly what you did before, most-used first.
  const exact = memory
    .filter((m) => normaliseMerchant(m.merchant) === key && allowed.has(m.categoryId))
    .sort((a, b) => b.count - a.count)[0];
  if (exact) return { categoryId: exact.categoryId, source: "learned", count: exact.count };

  // 2. A remembered merchant CONTAINED in what's been typed so far, or the
  //    other way round — "superstore" should match a stored "Real Canadian
  //    Superstore #123" while it is still being typed. Requires 4 characters
  //    so a two-letter prefix doesn't sweep up half the history.
  if (key.length >= 4) {
    const partial = memory
      .filter((m) => {
        const stored = normaliseMerchant(m.merchant);
        return allowed.has(m.categoryId) && (stored.includes(key) || key.includes(stored));
      })
      .sort((a, b) => b.count - a.count)[0];
    if (partial) return { categoryId: partial.categoryId, source: "learned", count: partial.count };
  }

  // 3. The keyword table, resolved against the account's real categories.
  for (const word of KEYWORDS_LONGEST_FIRST) {
    if (!key.includes(word)) continue;
    const wanted = KEYWORD_TO_CATEGORY[word].toLowerCase();
    const match = categories.find((c) => c.kind === kind && c.name.toLowerCase() === wanted);
    if (match) return { categoryId: match.id, source: "keyword" };
  }

  return null;
}
