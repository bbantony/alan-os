"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { balanceDeltaCents } from "@/lib/finance/balance";
import {
  ADJUSTMENT_CATEGORY,
  adjustmentFor,
  appBalanceOnDate,
  reconcileGapCents,
  type AppTxn,
} from "@/lib/finance/reconcile";
import type { AccountType, Category } from "@/lib/finance/types";
import { friendlyDbError } from "@/lib/db-errors";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export interface ReconcileData {
  accountName: string;
  accountType: AccountType;
  currency: "CAD" | "INR";
  /** What the app believes the balance was on the statement date. */
  appBalanceCents: number;
  /** Unconfirmed transactions dated on or before the statement date. */
  transactions: AppTxn[];
  categories: Category[];
  lastStatementDate: string | null;
  countAfterDate: number;
}

/**
 * Everything the reconcile screen needs for one account and one statement date.
 *
 * Already-reconciled transactions are excluded outright — confirming a
 * transaction against a statement is permanent, and re-listing last month's
 * confirmed spending every month would make the list grow forever and the job
 * unbearable.
 */
export async function getReconcileData(input: {
  accountId: string;
  statementDate: string;
}): Promise<ReconcileData | { error: string }> {
  const { supabase, user } = await requireUser();

  const { data: account } = await supabase
    .from("accounts")
    .select("id, name, type, currency, current_balance_cents")
    .eq("id", input.accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) return { error: "Couldn't find that account." };

  const [{ data: txns }, { data: categories }, { data: lastRec }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, txn_date, amount_cents, merchant, category_id, categories(kind)")
      .eq("user_id", user.id)
      .eq("account_id", input.accountId)
      .order("txn_date", { ascending: false })
      .limit(500),
    supabase
      .from("categories")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .order("name"),
    supabase
      .from("reconciliations")
      .select("statement_date")
      .eq("user_id", user.id)
      .eq("account_id", input.accountId)
      .order("statement_date", { ascending: false })
      .limit(1),
  ]);

  const all = ((txns as unknown as {
    id: string;
    txn_date: string;
    amount_cents: number;
    merchant: string | null;
    category_id: string;
    reconciled_at: string | null;
    categories: { kind: string } | null;
  }[]) ?? []).map((t) => ({
    id: t.id,
    txn_date: t.txn_date,
    amount_cents: t.amount_cents,
    merchant: t.merchant,
    category_id: t.category_id,
    is_income: t.categories?.kind === "income",
  }));

  // Split at the statement date: everything after it is rewound out of the
  // live balance rather than listed, so reconciling mid-month still compares
  // like with like.
  const upToDate = all.filter((t) => t.txn_date <= input.statementDate);
  const afterDate = all.filter((t) => t.txn_date > input.statementDate);

  const { data: alreadyReconciled } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", user.id)
    .eq("account_id", input.accountId)
    .not("reconciled_at", "is", null);
  const reconciledIds = new Set(((alreadyReconciled as { id: string }[]) ?? []).map((r) => r.id));

  return {
    accountName: account.name as string,
    accountType: account.type as AccountType,
    currency: account.currency as "CAD" | "INR",
    appBalanceCents: appBalanceOnDate({
      currentBalanceCents: account.current_balance_cents as number,
      accountType: account.type as AccountType,
      transactionsAfterDate: afterDate,
    }),
    transactions: upToDate.filter((t) => !reconciledIds.has(t.id)),
    categories: (categories as Category[]) ?? [],
    lastStatementDate: (lastRec as { statement_date: string }[])?.[0]?.statement_date ?? null,
    countAfterDate: afterDate.length,
  };
}

/**
 * Adds a transaction the bank has but the app didn't — the whole point of
 * uploading the statement. Kept separate from the finish step so the running
 * difference updates as each one goes in, and the gap visibly closes.
 */
export async function addMissingTransaction(input: {
  accountId: string;
  categoryId: string;
  amountCents: number;
  merchant: string;
  txnDate: string;
  /**
   * Ignored for the balance move — the direction comes from the category's
   * `kind`, same as logExpense and deleteTransaction, so what this adds is
   * exactly what a later delete would reverse.
   */
  isIncome: boolean;
}): Promise<{ transaction?: AppTxn; error?: string }> {
  const { supabase, user } = await requireUser();

  const [{ data: account }, { data: category }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, type, currency, current_balance_cents")
      .eq("id", input.accountId)
      .eq("user_id", user.id)
      .maybeSingle(),
    // Scoped to the user — also stops the row being filed under another
    // user's category id.
    supabase
      .from("categories")
      .select("id, kind")
      .eq("id", input.categoryId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (!account) return { error: "Couldn't find that account." };
  if (!category) return { error: "Couldn't find that category." };

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      account_id: input.accountId,
      category_id: input.categoryId,
      amount_cents: input.amountCents,
      currency: account.currency,
      merchant: input.merchant || null,
      txn_date: input.txnDate,
      source: "csv",
    })
    .select("id, txn_date, amount_cents, merchant, category_id")
    .single();
  if (error || !data) return { error: friendlyDbError(error) ?? "Couldn't add that." };

  const isIncome = (category.kind as string) === "income";
  const delta = balanceDeltaCents(input.amountCents, isIncome, account.type as AccountType);
  // Atomic — see migration 0035. This is the "Add it" button in the reconcile
  // flow, which is the most double-tappable control in the module.
  const { error: balanceError } = await supabase.rpc("adjust_account_balance", {
    p_account_id: account.id,
    p_delta_cents: delta,
  });
  if (balanceError) {
    return { error: "Added, but the account balance didn't update. Check it on the Money screen." };
  }

  return { transaction: { ...data, is_income: isIncome } as AppTxn };
}

async function findOrCreateAdjustmentCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  kind: "expense" | "income"
): Promise<string | null> {
  const name = kind === "income" ? ADJUSTMENT_CATEGORY.income : ADJUSTMENT_CATEGORY.expense;

  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created } = await supabase
    .from("categories")
    .insert({ user_id: userId, name, icon: "Scale", color: "#8A8A7B", kind })
    .select("id")
    .single();
  return (created?.id as string) ?? null;
}

export interface FinishResult {
  error?: string;
  clearedCount?: number;
  adjustedCents?: number;
  newBalanceCents?: number;
  /**
   * The gap the SERVER measured when it finished — not the one the screen
   * showed. They can differ if the books moved between compare and finish,
   * and the done screen must speak from this one.
   */
  differenceCents?: number;
}

/**
 * Closes the month: confirms the ticked transactions, posts one correcting
 * transaction for whatever gap is left, and records that it happened.
 *
 * The correction is a real, dated, categorised transaction rather than a quiet
 * edit of the account's balance. That matters: an edited balance is invisible
 * the moment it's done and silently changes history, where a transaction shows
 * up in the ledger, in the reports, and in next month's reconciliation as
 * something that had to be corrected. If the gap is large or keeps recurring,
 * you can see that.
 */
export async function finishReconciliation(input: {
  accountId: string;
  statementDate: string;
  statementBalanceCents: number;
  clearedTransactionIds: string[];
  postAdjustment: boolean;
  note: string | null;
}): Promise<FinishResult> {
  const { supabase, user } = await requireUser();

  const { data: account } = await supabase
    .from("accounts")
    .select("id, type, currency, current_balance_cents")
    .eq("id", input.accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) return { error: "Couldn't find that account." };

  // The app-side balance is recomputed HERE, from the database, rather than
  // accepted from the browser. It used to arrive as an input alongside the
  // statement balance, which meant the size of the correcting transaction —
  // and therefore the account's final balance — was whatever the client said
  // it was: a stale tab or a tampered request could move real money by any
  // amount. The statement balance legitimately stays user input (it's typed
  // off a piece of paper); the app's own side never was.
  //
  // Same rewind as getReconcileData: live balance minus the effect of
  // everything dated after the statement, so a mid-month reconcile compares
  // like with like.
  const { data: afterRows } = await supabase
    .from("transactions")
    .select("amount_cents, categories(kind)")
    .eq("user_id", user.id)
    .eq("account_id", input.accountId)
    .gt("txn_date", input.statementDate);
  const appBalanceCents = appBalanceOnDate({
    currentBalanceCents: account.current_balance_cents as number,
    accountType: account.type as AccountType,
    transactionsAfterDate: (
      (afterRows as unknown as { amount_cents: number; categories: { kind: string } | null }[]) ?? []
    ).map((t) => ({
      amount_cents: t.amount_cents,
      is_income: t.categories?.kind === "income",
    })),
  });

  const differenceCents = reconcileGapCents(input.statementBalanceCents, appBalanceCents);
  const adjustment = input.postAdjustment ? adjustmentFor(differenceCents, account.type as AccountType) : null;

  // The record goes in first so the adjustment transaction can point back at
  // it, and so a failure halfway through leaves evidence of the attempt rather
  // than a set of confirmed transactions with nothing explaining them.
  const { data: reconciliation, error: recError } = await supabase
    .from("reconciliations")
    .insert({
      user_id: user.id,
      account_id: input.accountId,
      statement_date: input.statementDate,
      statement_balance_cents: input.statementBalanceCents,
      app_balance_cents: appBalanceCents,
      difference_cents: differenceCents,
      cleared_count: input.clearedTransactionIds.length,
      note: input.note,
    })
    .select("id")
    .single();
  if (recError || !reconciliation) return { error: friendlyDbError(recError) ?? "Couldn't save that." };

  let newBalanceCents = account.current_balance_cents as number;

  if (adjustment) {
    const categoryId = await findOrCreateAdjustmentCategory(
      supabase,
      user.id,
      adjustment.isIncome ? "income" : "expense"
    );
    if (!categoryId) return { error: "Couldn't file the adjustment." };

    // The error is CAPTURED now. It used to be discarded, so a failed insert
    // skipped the `if` below, never touched the balance, and still returned
    // `adjustedCents: differenceCents` — which the flow renders as "Corrected
    // by $X. Your account balance now matches the bank." The reconciliation
    // record then claimed a correction that did not exist.
    const { data: adjustmentTxn, error: adjustmentError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        account_id: input.accountId,
        category_id: categoryId,
        amount_cents: adjustment.amountCents,
        currency: account.currency,
        merchant: null,
        note: `Adjusted to match the bank statement of ${input.statementDate}`,
        txn_date: input.statementDate,
        source: "manual",
        reconciled_at: new Date().toISOString(),
        reconciliation_id: reconciliation.id,
      })
      .select("id")
      .single();

    if (adjustmentError || !adjustmentTxn) {
      return {
        error:
          friendlyDbError(adjustmentError) ?? "The correction couldn't be saved, so the balance hasn't been changed.",
      };
    }

    await supabase
      .from("reconciliations")
      .update({ adjustment_txn_id: adjustmentTxn.id })
      .eq("id", reconciliation.id);

    const delta = balanceDeltaCents(
      adjustment.amountCents,
      adjustment.isIncome,
      account.type as AccountType
    );
    // Atomic, like every other balance move now.
    const { data: settled, error: settleError } = await supabase.rpc(
      "adjust_account_balance",
      { p_account_id: account.id, p_delta_cents: delta }
    );
    // Checked, because the screen above this prints "Your account balance now
    // matches the bank" — which is exactly the lie the adjustment-insert fix
    // was made for. Falling back to an optimistic local sum would repeat it.
    if (settleError || settled === null || settled === undefined) {
      return {
        error:
          "The correction was recorded but the account balance didn't move. Check the account on the Money screen before relying on it.",
      };
    }
    newBalanceCents = Number(settled);
  }

  if (input.clearedTransactionIds.length > 0) {
    await supabase
      .from("transactions")
      .update({ reconciled_at: new Date().toISOString(), reconciliation_id: reconciliation.id })
      .in("id", input.clearedTransactionIds)
      .eq("user_id", user.id);
  }

  revalidatePath("/money");
  revalidatePath("/today");
  return {
    clearedCount: input.clearedTransactionIds.length,
    adjustedCents: adjustment ? differenceCents : 0,
    newBalanceCents,
    differenceCents,
  };
}

export interface ReconciliationSummary {
  id: string;
  account_id: string;
  account_name: string;
  statement_date: string;
  statement_balance_cents: number;
  difference_cents: number;
  cleared_count: number;
}

export async function getReconciliationHistory(limit = 12): Promise<ReconciliationSummary[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("reconciliations")
    .select("id, account_id, statement_date, statement_balance_cents, difference_cents, cleared_count, accounts(name)")
    .eq("user_id", user.id)
    .order("statement_date", { ascending: false })
    .limit(limit);

  return ((data as unknown as (ReconciliationSummary & { accounts: { name: string } | null })[]) ?? []).map(
    (r) => ({ ...r, account_name: r.accounts?.name ?? "Account" })
  );
}
