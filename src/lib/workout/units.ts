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

// The smallest sensible plate jump for the overload nudge — 2.5kg (a pair of
// 1.25s) or 5lb (a pair of 2.5s), whichever matches the user's display unit.
export function smallestIncrementKg(unit: WeightUnit): number {
  return unit === "lbs" ? lbsToKg(5) : 2.5;
}
