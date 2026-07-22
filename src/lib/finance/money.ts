import type { CurrencyCode } from "./types";

// Money is always integer cents in the database (SPEC.md non-negotiable) —
// these are the only two places a cents value should ever touch a float.
export function formatCents(cents: number, currency: CurrencyCode = "CAD"): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(cents / 100);
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}
