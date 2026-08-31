import type { WeightUnit } from "./types";

const KG_PER_LB = 0.45359237;

export function kgToLbs(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbsToKg(lbs: number): number {
  return lbs * KG_PER_LB;
}

// Weight is always stored in kg — this only affects display, and the increment
// used by the progressive-overload nudge.
export function displayWeight(weightKg: number, unit: WeightUnit): number {
  const value = unit === "lbs" ? kgToLbs(weightKg) : weightKg;
  return Math.round(value * 10) / 10;
}

export function toStoredKg(displayValue: number, unit: WeightUnit): number {
  return unit === "lbs" ? lbsToKg(displayValue) : displayValue;
}

export function formatWeight(weightKg: number, unit: WeightUnit): string {
  const value = displayWeight(weightKg, unit);
  const rounded = Number.isInteger(value) ? value : value.toFixed(1);
  return `${rounded} ${unit}`;
}

// The default step, in the unit actually on screen: the smallest pair of
// plates most gyms have (2.5 lb), or 1 kg on a metric bar.
export const DEFAULT_INCREMENT: Record<WeightUnit, number> = { lbs: 2.5, kg: 1 };

/**
 * Step size for the +/- weight steppers, IN THE DISPLAYED UNIT.
 *
 * This exists because the kg version below was being used directly by the
 * stepper, which works in display units — so on a lbs profile the +/- buttons
 * subtracted `lbsToKg(2.5)` = 1.13 from a number of POUNDS, and the weight
 * moved in visible 1.1 lb steps instead of 2.5. A kg quantity and a lbs
 * quantity are not interchangeable; keep the two functions apart.
 *
 * `override` is the account's own choice from Settings → Workout, already in
 * its display unit. Null means "use the default for this unit".
 */
export function incrementInDisplayUnit(unit: WeightUnit, override?: number | null): number {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) return override;
  return DEFAULT_INCREMENT[unit];
}

// The same step expressed in kg, for anything reasoning about stored weights
// (the progressive-overload nudge). Never hand this to the stepper.
export function smallestIncrementKg(unit: WeightUnit, override?: number | null): number {
  return toStoredKg(incrementInDisplayUnit(unit, override), unit);
}

// Standard barbell weight, in the round number lifters actually use for their
// display unit (a 45lb bar, not "20.4kg"; a 20kg bar, not "44lb"). Only affects
// the barbell set-entry UI ("Bar + plate weight") — the stored weight is always
// the true total in kg, so PRs/streaks/history stay unaffected.
export function barWeightKg(unit: WeightUnit): number {
  return unit === "lbs" ? lbsToKg(45) : 20;
}
