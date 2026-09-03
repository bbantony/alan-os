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

/**
 * Whether a transaction row moved money INTO its account, for feeding
 * `balanceDeltaCents` — the one place this rule lives, used by both reconcile
 * paths so they cannot drift apart again.
 *
 * A transfer leg's direction comes from its own `transfer_direction` column
 * (migration 0038), never from its category: the holder category on a transfer
 * is an expense category on BOTH legs, and deriving direction from it is
 * exactly the bug that mis-signed incoming legs. An 'in' leg behaves like
 * income for balance purposes on every account type — money arrived (or, on a
 * credit card, debt shrank), matching what `log_transfer` did when it was
 * written.
 *
 * Legacy transfer legs (group id set, direction null — logged before 0038)
 * genuinely never recorded which side was which, so they fall through to the
 * category kind: the old behaviour, still wrong on what were incoming legs,
 * but there is nothing truer to derive it from. Production had zero such rows
 * when 0038 shipped.
 */
export function txnIsIncome(txn: {
  kind: string | null | undefined;
  transferGroupId: string | null | undefined;
  transferDirection: string | null | undefined;
}): boolean {
  if (txn.transferGroupId && txn.transferDirection) {
    return txn.transferDirection === "in";
  }
  return txn.kind === "income";
}
