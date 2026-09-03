import type { AccountType } from "./types";
import { balanceDeltaCents } from "./balance.ts";

// Matching a bank statement against what the app has logged.
//
// Pure functions, no database — so the arithmetic that decides whether your
// books are right can be checked on its own, which matters more here than
// anywhere else in the app.

export interface AppTxn {
  id: string;
  txn_date: string;
  amount_cents: number;
  merchant: string | null;
  category_id: string;
  is_income: boolean;
}

export interface BankRow {
  /** Stable key for React and for selection state. */
  key: string;
  date: string;
  description: string;
  amountCents: number;
  isIncome: boolean;
}

export interface MatchResult {
  /** App transaction id -> the bank row that confirms it. */
  matchedAppIds: Set<string>;
  /** Bank rows with no counterpart in the app — things you forgot to log. */
  missingFromApp: BankRow[];
  /** App transactions with no counterpart on the statement. */
  notOnStatement: AppTxn[];
}

/**
 * How far apart two dates may be and still be the same transaction.
 *
 * Three days, because the date a card is tapped and the date it settles on the
 * statement are routinely different — a Friday night restaurant bill posts on
 * Monday. Requiring an exact date match would report half a real month as
 * "missing", which is worse than useless: it trains you to ignore the answer.
 */
const DATE_TOLERANCE_DAYS = 3;

function daysApart(a: string, b: string): number {
  return Math.abs(
    (new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000
  );
}

/**
 * Pairs statement rows with logged transactions.
 *
 * The rule is deliberately strict on money and loose on everything else: the
 * amount and the direction must be exactly equal, the date must be within a few
 * days, and the description is not consulted at all. Bank descriptions are
 * mangled beyond recognition ("SQ *THE GOOD FORK 604-555") and matching on them
 * produces confident wrong answers, which in a reconciliation is the one
 * outcome worth avoiding — a missed match costs a second look, a false match
 * hides a real discrepancy.
 *
 * Each side is consumed once, so two identical $5 coffees on the same day match
 * two statement lines rather than both matching the first.
 */
export function matchStatement(appTxns: AppTxn[], bankRows: BankRow[]): MatchResult {
  const matchedAppIds = new Set<string>();
  const usedBankKeys = new Set<string>();

  // Exact same day first, across the whole statement, before anything is
  // allowed a near-date match — otherwise a row three days out can steal the
  // pairing from the transaction that landed on the exact date.
  for (const tolerance of [0, DATE_TOLERANCE_DAYS]) {
    for (const bank of bankRows) {
      if (usedBankKeys.has(bank.key)) continue;

      const candidate = appTxns.find(
        (t) =>
          !matchedAppIds.has(t.id) &&
          t.amount_cents === bank.amountCents &&
          t.is_income === bank.isIncome &&
          daysApart(t.txn_date, bank.date) <= tolerance
      );
      if (candidate) {
        matchedAppIds.add(candidate.id);
        usedBankKeys.add(bank.key);
      }
    }
  }

  return {
    matchedAppIds,
    missingFromApp: bankRows.filter((b) => !usedBankKeys.has(b.key)),
    notOnStatement: appTxns.filter((t) => !matchedAppIds.has(t.id)),
  };
}

/**
 * What the app believes the balance was on `statementDate`.
 *
 * Derived by rewinding: the account's live balance minus the effect of
 * everything dated after the statement. Balances in this app are maintained
 * incrementally rather than recomputed, so the live figure is the only anchor
 * there is — and reconciling in the middle of a month has to ignore the
 * transactions that came after the statement closed, or the gap it reports is
 * just "the last two weeks of spending".
 */
export function appBalanceOnDate(input: {
  currentBalanceCents: number;
  accountType: AccountType;
  transactionsAfterDate: { amount_cents: number; is_income: boolean }[];
}): number {
  const effectAfter = input.transactionsAfterDate.reduce(
    (sum, t) => sum + balanceDeltaCents(t.amount_cents, t.is_income, input.accountType),
    0
  );
  return input.currentBalanceCents - effectAfter;
}

/**
 * The gap a reconciliation exists to close: what the bank statement says minus
 * what the app believed the balance was on the statement date.
 *
 * Positive means the bank says more than the app (on a chequing account, money
 * you have that the app missed; on a credit card, debt the app missed — the
 * sign interpretation is `adjustmentFor`'s job, not this one's). Trivial
 * arithmetic, but it is THE number the whole flow reports and corrects by, so
 * it lives here as a pure function with tests rather than inline in a server
 * action.
 */
export function reconcileGapCents(statementBalanceCents: number, appBalanceCents: number): number {
  return statementBalanceCents - appBalanceCents;
}

export interface Adjustment {
  amountCents: number;
  isIncome: boolean;
}

/**
 * The single transaction that closes a remaining gap.
 *
 * The sign work is the fiddly part, because a credit card's balance means the
 * opposite of a chequing account's — on a card, "the bank says more" means you
 * owe more, which is an expense; on chequing it means you have more, which is
 * income. Rather than hand-rolling that twice, this picks the direction that
 * makes `balanceDeltaCents` produce the delta needed, using the same function
 * every other balance change in the app goes through.
 */
export function adjustmentFor(differenceCents: number, accountType: AccountType): Adjustment | null {
  if (differenceCents === 0) return null;
  const needsPositiveDelta = differenceCents > 0;
  const isCreditCard = accountType === "credit_card";
  return {
    amountCents: Math.abs(differenceCents),
    isIncome: isCreditCard ? !needsPositiveDelta : needsPositiveDelta,
  };
}

/** The category an adjustment is filed under, by direction. */
export const ADJUSTMENT_CATEGORY = {
  expense: "Balance adjustment",
  income: "Balance adjustment (money in)",
} as const;
