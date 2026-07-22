import type { Exercise } from "./types";

export function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Soft duplicate check for a "did you mean X?" confirm before adding a new
// exercise — the DB's unique index on lower(trim(name)) is the hard backstop for
// exact matches; this catches near-misses (e.g. "Bench Press" vs "Barbell Bench
// Press") so the crew-shared list doesn't fragment. Same lightweight,
// no-dependency style as lib/shopping/category-guess.ts.
export function findPossibleDuplicate(name: string, exercises: Exercise[]): Exercise | null {
  const key = normalize(name);
  if (!key) return null;

  const words = new Set(key.split(" ").filter((w) => w.length > 2));
  if (words.size === 0) return null;

  for (const exercise of exercises) {
    const existingWords = new Set(
      normalize(exercise.name)
        .split(" ")
        .filter((w) => w.length > 2)
    );
    if (existingWords.size === 0) continue;

    const isSubset = [...words].every((w) => existingWords.has(w));
    const isSuperset = [...existingWords].every((w) => words.has(w));
    if (isSubset || isSuperset) return exercise;
  }

  return null;
}
