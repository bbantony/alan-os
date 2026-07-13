// Money is always stored as integer cents + a currency code — never floats.
// Every module that touches money should format through here rather than
// doing its own division/toFixed.

export type CurrencyCode = "CAD" | "INR";

const FORMATTERS = new Map<CurrencyCode, Intl.NumberFormat>();

function formatterFor(currency: CurrencyCode) {
  let formatter = FORMATTERS.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    });
    FORMATTERS.set(currency, formatter);
  }
  return formatter;
}

export function formatCents(cents: number, currency: CurrencyCode = "CAD"): string {
  return formatterFor(currency).format(cents / 100);
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}
