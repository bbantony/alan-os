// Plain-string fuzzy matching for the receipt -> shopping-list cross-check
// hook (SPEC.md Part B4) — deliberately not AI-based, since simple
// containment/token-overlap is enough to match "GV 2% MLK" against a list
// item typed as "milk" and costs nothing per scan.
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(["the", "a", "an", "of", "and", "or", "brand", "no", "name"]);

function tokens(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter((t) => t.length > 1 && !STOPWORDS.has(t)));
}

// Returns a 0..1 similarity score: containment (one name fully inside the
// other) scores highest, otherwise Jaccard overlap of word tokens.
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : shared / union;
}

export const FUZZY_MATCH_THRESHOLD = 0.5;

export function findBestMatch<T>(
  name: string,
  candidates: T[],
  getName: (item: T) => string
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const candidate of candidates) {
    const score = similarity(name, getName(candidate));
    if (score >= FUZZY_MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { item: candidate, score };
    }
  }
  return best;
}
