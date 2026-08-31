import type { CurrencyCode } from "./types";

// Money is always integer cents in the database (SPEC.md non-negotiable).
//
// Three places convert across the float boundary, and no others should:
//   - `formatCents` below, dividing to display;
//   - `dollarsToCents` below, rounding a typed-in figure once;
//   - `parseCsvAmount` (lib/finance/csv-parser.ts), rounding a bank
//     statement's text once at the point it enters the app.
//
// The parser does its own rounding rather than calling `dollarsToCents`
// because it must first decide whether the text is a number AT ALL — brackets,
// trailing minus, comma-decimal — and returns null when it can't tell. Handing
// an already-parsed float to `dollarsToCents` would throw that judgement away.
export function formatCents(cents: number, currency: CurrencyCode = "CAD"): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(cents / 100);
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}
