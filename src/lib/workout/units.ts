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

// Step size for the +/- weight steppers and the overload nudge (owner
// preference): 2.5 lb or 1 kg, whichever matches the user's display unit.
export function smallestIncrementKg(unit: WeightUnit): number {
  return unit === "lbs" ? lbsToKg(2.5) : 1;
}

// Standard barbell weight, in the round number lifters actually use for their
// display unit (a 45lb bar, not "20.4kg"; a 20kg bar, not "44lb"). Only affects
// the barbell set-entry UI ("Bar + plate weight") — the stored weight is always
// the true total in kg, so PRs/streaks/history stay unaffected.
export function barWeightKg(unit: WeightUnit): number {
  return unit === "lbs" ? lbsToKg(45) : 20;
}
