"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { balanceDeltaCents } from "@/lib/finance/balance";
import {
  ADJUSTMENT_CATEGORY,
  adjustmentFor,
  appBalanceOnDate,
  type AppTxn,
} from "@/lib/finance/reconcile";
import type { AccountType, Category } from "@/lib/finance/types";

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
  isIncome: boolean;
}): Promise<{ transaction?: AppTxn; error?: string }> {
  const { supabase, user } = await requireUser();

  const { data: account } = await supabase
    .from("accounts")
    .select("id, type, currency, current_balance_cents")
    .eq("id", input.accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) return { error: "Couldn't find that account." };

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
  if (error || !data) return { error: error?.message ?? "Couldn't add that." };

  const delta = balanceDeltaCents(input.amountCents, input.isIncome, account.type as AccountType);
  await supabase
    .from("accounts")
    .update({ current_balance_cents: (account.current_balance_cents as number) + delta })
    .eq("id", account.id);

  return { transaction: { ...data, is_income: input.isIncome } as AppTxn };
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
  appBalanceCents: number;
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

  const differenceCents = input.statementBalanceCents - input.appBalanceCents;
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
      app_balance_cents: input.appBalanceCents,
      difference_cents: differenceCents,
      cleared_count: input.clearedTransactionIds.length,
      note: input.note,
    })
    .select("id")
    .single();
  if (recError || !reconciliation) return { error: recError?.message ?? "Couldn't save that." };

  let newBalanceCents = account.current_balance_cents as number;

  if (adjustment) {
    const categoryId = await findOrCreateAdjustmentCategory(
      supabase,
      user.id,
      adjustment.isIncome ? "income" : "expense"
    );
    if (!categoryId) return { error: "Couldn't file the adjustment." };

    const { data: adjustmentTxn } = await supabase
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

    if (adjustmentTxn) {
      await supabase
        .from("reconciliations")
        .update({ adjustment_txn_id: adjustmentTxn.id })
        .eq("id", reconciliation.id);

      const delta = balanceDeltaCents(
        adjustment.amountCents,
        adjustment.isIncome,
        account.type as AccountType
      );
      newBalanceCents += delta;
      await supabase
        .from("accounts")
        .update({ current_balance_cents: newBalanceCents })
        .eq("id", account.id);
    }
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
