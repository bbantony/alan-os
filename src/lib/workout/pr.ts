import type { PrKind } from "./types";

export interface SetInput {
  reps: number;
  weightKg: number;
}

export interface SessionBests {
  weight: number;
  est_1rm: number;
  volume: number;
}

// Epley formula: estimated one-rep max from a set of reps at a given weight.
export function epley1RM(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

export function sessionBests(sets: SetInput[]): SessionBests {
  return sets.reduce<SessionBests>(
    (best, set) => ({
      weight: Math.max(best.weight, set.weightKg),
      est_1rm: Math.max(best.est_1rm, epley1RM(set.weightKg, set.reps)),
      volume: best.volume + set.reps * set.weightKg,
    }),
    { weight: 0, est_1rm: 0, volume: 0 }
  );
}

export interface NewPr {
  kind: PrKind;
  value: number;
  /** The best before this one. `null` means this is the opening baseline. */
  previousValue: number | null;
}

/**
 * Compares a session against the running `prs` ledger.
 *
 * A kind with no prior entry is still returned — the ledger needs seeding, and
 * the caller writes every result to the table — but it carries
 * `previousValue: null` so the caller can tell a genuine record from a first
 * attempt. That distinction is the point: previously, the very first time you
 * logged any exercise you were told you'd set three personal records at once,
 * which is not a thing that happened. See `reportablePrs`.
 */
export function detectNewPrs(
  session: SessionBests,
  priorBests: Partial<Record<PrKind, number>>
): NewPr[] {
  const kinds: PrKind[] = ["weight", "est_1rm", "volume"];
  const found: NewPr[] = [];

  for (const kind of kinds) {
    const value = session[kind];
    if (value <= 0) continue;
    const prior = priorBests[kind];
    if (prior === undefined) {
      found.push({ kind, value, previousValue: null });
    } else if (value > prior) {
      found.push({ kind, value, previousValue: prior });
    }
  }

  return found;
}

/** Records worth telling anyone about — i.e. ones that actually beat something. */
export function reportablePrs<T extends NewPr>(prs: T[]): T[] {
  return prs.filter((pr) => pr.previousValue !== null);
}

// ---------------------------------------------------------------------------
// How a record is described
// ---------------------------------------------------------------------------

/**
 * Ranked most to least impressive. Used to pick the single headline for an
 * exercise instead of listing all three.
 *
 * Volume sits last on purpose: total weight moved in a session goes up
 * whenever you add a set, so a volume "record" is the easiest of the three to
 * trip and the least meaningful. Announcing all three at once is what made
 * every session look like a personal best and drained the word of meaning.
 */
const KIND_RANK: Record<PrKind, number> = { weight: 0, est_1rm: 1, volume: 2 };

export const PR_KIND_LABELS: Record<PrKind, string> = {
  weight: "Heaviest ever",
  est_1rm: "Strongest set",
  volume: "Biggest session",
};

/** The one record to lead with, out of everything set on a single exercise. */
export function headlinePr<T extends { kind: PrKind }>(prs: T[]): T | null {
  if (prs.length === 0) return null;
  return [...prs].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind])[0];
}

/**
 * Groups a session's records by exercise and returns one headline each, so a
 * feed card shows "Bench Press — heaviest ever" rather than three near-
 * identical lines about the same lift.
 */
export function headlinePrsByExercise<T extends { kind: PrKind; exercise_id: string }>(
  prs: T[]
): T[] {
  const byExercise = new Map<string, T[]>();
  for (const pr of prs) {
    const list = byExercise.get(pr.exercise_id) ?? [];
    list.push(pr);
    byExercise.set(pr.exercise_id, list);
  }
  return [...byExercise.values()]
    .map((list) => headlinePr(list))
    .filter((pr): pr is T => pr !== null);
}
