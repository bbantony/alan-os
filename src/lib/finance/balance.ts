import type { AccountType } from "./types";

// A credit card's balance represents what's OWED (an expense increases it,
// paying it down/income decreases it) — the opposite sign from a chequing,
// cash, or investment account's balance, which represents what you HAVE.
export function balanceDeltaCents(amountCents: number, isIncome: boolean, accountType: AccountType): number {
  const magnitude = Math.abs(amountCents);
  const isCreditCard = accountType === "credit_card";
  if (isIncome) return isCreditCard ? -magnitude : magnitude;
  return isCreditCard ? magnitude : -magnitude;
}
