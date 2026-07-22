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
}

// Prior bests come from the running `prs` ledger (one row per kind, if any exist
// yet) — no prior for a kind means this session's first value automatically
// counts as a PR, matching the spec's literal comparison rule.
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
    if (prior === undefined || value > prior) {
      found.push({ kind, value });
    }
  }

  return found;
}
