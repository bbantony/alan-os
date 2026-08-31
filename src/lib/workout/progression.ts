import type { SetInput } from "./pr";
import type { WeightUnit } from "./types";
import { smallestIncrementKg } from "./units";

export interface OverloadSuggestion {
  weightKg: number;
  reps: number;
}

const HYPERTROPHY_REP_TARGET = 8;

// Progressive-overload nudge (owner-requested bonus feature): if last session's
// sets at the top weight all hit the rep target, suggest one small weight bump at
// that same rep target; otherwise suggest repeating the same weight for the reps
// actually hit last time. Deliberately simple, no history beyond "last session."
export function suggestNextWeight(
  lastSets: SetInput[],
  unit: WeightUnit,
  /** Settings -> Workout, in the display unit. Null = the unit's default. */
  weightIncrement?: number | null
): OverloadSuggestion | null {
  if (lastSets.length === 0) return null;

  const topWeight = Math.max(...lastSets.map((s) => s.weightKg));
  const setsAtTop = lastSets.filter((s) => s.weightKg === topWeight);
  const minRepsAtTop = Math.min(...setsAtTop.map((s) => s.reps));

  if (minRepsAtTop >= HYPERTROPHY_REP_TARGET) {
    return {
      weightKg: topWeight + smallestIncrementKg(unit, weightIncrement),
      reps: HYPERTROPHY_REP_TARGET,
    };
  }
  return { weightKg: topWeight, reps: minRepsAtTop };
}
