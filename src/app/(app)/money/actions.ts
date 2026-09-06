"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayInAppTimezone } from "@/lib/time";
import {
  currentPeriodBounds,
  periodRangeFor,
  trendRangesFor,
  type PeriodRange,
  type ReportPeriod,
} from "@/lib/finance/period";
import { resolvePreferences, type WeekStart } from "@/lib/preferences";
import { balanceDeltaCents } from "@/lib/finance/balance";
import { friendlyDbError } from "@/lib/db-errors";
import { normaliseMerchant, type MerchantMemoryEntry } from "@/lib/finance/categorise";
import type {
  Account,
  AccountType,
  Budget,
  Category,
  CurrencyCode,
  Debt,
  SavingsGoal,
  Transaction,
} from "@/lib/finance/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// ---------- Accounts ----------

export async function getAccounts(): Promise<Account[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });
  return (data as Account[]) ?? [];
}

// Every create action returns the row the database actually wrote.
//
// They used to return nothing, and each caller then invented its own
// `crypto.randomUUID()` for the copy it put on screen — an id matching no row
// anywhere. The screen looked right and every follow-up action against that
// item silently missed: logging an expense against a just-added account failed
// with "couldn't find that account", and adding to a just-created goal wrote
// nothing while showing the money added. Returning the real row is the fix,
// and it's why `.select("*").single()` is now on all three.
export async function createAccount(input: {
  name: string;
  institution: string;
  type: AccountType;
  currency: CurrencyCode;
  currentBalanceCents: number;
  isDebt: boolean;
  creditLimitCents: number | null;
}): Promise<{ account?: Account; error?: string }> {
  const { supabase, user } = await requireUser();
  const { data: existing } = await supabase
    .from("accounts")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSort = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      institution: input.institution.trim(),
      type: input.type,
      currency: input.currency,
      current_balance_cents: input.currentBalanceCents,
      is_debt: input.isDebt,
      credit_limit_cents: input.creditLimitCents,
      sort_order: nextSort,
    })
    .select("*")
    .single();
  if (error || !data) return { error: friendlyDbError(error) ?? "Could not add that account." };
  revalidatePath("/money");
  revalidatePath("/today");
  return { account: data as Account };
}

export async function updateAccount(input: {
  id: string;
  name: string;
  institution: string;
  balanceCents: number;
  creditLimitCents: number | null;
}): Promise<{ account?: Account; error?: string }> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("accounts")
    .update({
      name: input.name.trim(),
      institution: input.institution.trim(),
      current_balance_cents: input.balanceCents,
      credit_limit_cents: input.creditLimitCents,
    })
    .eq("id", input.id)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error || !data) return { error: friendlyDbError(error) ?? "Could not save that account." };
  revalidatePath("/money");
  revalidatePath("/today");
  return { account: data as Account };
}

// How many transactions an account would take with it. `transactions.account_id`
// is ON DELETE CASCADE (0016), so deleting an account really does delete its
// whole history — the old code claimed the opposite ("Can't delete — it still
// has transactions logged against it") and would never have shown that message,
// because the delete always succeeds. The count is returned so the UI can warn
// with the real number instead of a reassurance that isn't true.
export async function getAccountTransactionCount(input: { id: string }): Promise<number> {
  const { supabase, user } = await requireUser();
  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("account_id", input.id);
  return count ?? 0;
}

export async function deleteAccount(input: { id: string }): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("accounts").delete().eq("id", input.id).eq("user_id", user.id);
  if (error) return { error: friendlyDbError(error) ?? "That didn't save. Try again." };
  revalidatePath("/money");
  revalidatePath("/today");
  return {};
}

// ---------- Categories ----------

export async function getCategories(): Promise<Category[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_archived", false)
    .order("name", { ascending: true });
  return (data as Category[]) ?? [];
}

export async function createCategory(input: {
  name: string;
  icon: string;
  color: string;
  kind: "expense" | "income";
}): Promise<{ category?: Category; error?: string }> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("categories")
    .insert({ user_id: user.id, name: input.name.trim(), icon: input.icon, color: input.color, kind: input.kind })
    .select("*")
    .single();
  if (error || !data) return { error: error?.code === "23505" ? "That category already exists." : "Could not add category." };
  revalidatePath("/money");
  return { category: data as Category };
}

export async function archiveCategory(input: { id: string }) {
  const { supabase, user } = await requireUser();
  await supabase.from("categories").update({ is_archived: true }).eq("id", input.id).eq("user_id", user.id);
  revalidatePath("/money");
}

// ---------- Quick expense logging (<=5s) ----------

export type MerchantMemory = MerchantMemoryEntry;

/**
 * What you usually file each merchant under.
 *
 * Rewritten to count rather than to take the most recent. The old version read
 * 50 transactions and kept the FIRST category it saw per merchant, so one
 * mis-categorised coffee taught the form the wrong answer for good — the most
 * recent entry is the one most likely to be a mistake you have not corrected
 * yet, and the least likely to represent what you normally do.
 *
 * Now: 400 transactions, grouped by (merchant, category), with the count kept
 * so the guesser can prefer the answer you have given eleven times over the
 * one you gave once. The display spelling comes from the most recent use, so
 * it shows "Superstore" rather than an older "SUPERSTORE #4021".
 */
export async function getRecentMerchants(): Promise<MerchantMemory[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("transactions")
    .select("merchant, category_id, created_at")
    .eq("user_id", user.id)
    .not("merchant", "is", null)
    .order("created_at", { ascending: false })
    .limit(400);

  const tally = new Map<string, MerchantMemory>();
  for (const row of data ?? []) {
    const merchant = (row.merchant as string) ?? "";
    const categoryId = row.category_id as string;
    if (!merchant.trim() || !categoryId) continue;
    const key = `${normaliseMerchant(merchant)}::${categoryId}`;
    const existing = tally.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      // First time seen means most recent, because the query is newest-first —
      // so this spelling is the freshest one.
      tally.set(key, { merchant, categoryId, count: 1 });
    }
  }

  return [...tally.values()].sort((a, b) => b.count - a.count);
}

export async function getRecentTransactions(limit = 20): Promise<Transaction[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as Transaction[]) ?? [];
}

export async function logExpense(input: {
  id: string;
  accountId: string;
  categoryId: string;
  amountCents: number;
  currency: CurrencyCode;
  merchant: string | null;
  note: string | null;
  txnDate: string;
  /**
   * Still sent by the form for its own optimistic UI, but the server no longer
   * consults it — the direction of the balance move is derived from the
   * category's `kind` below. A browser-supplied flag that disagreed with the
   * category made the balance drift: logging filed the move one way, deleting
   * the same transaction reversed it the other way (delete has always derived
   * from `categories.kind`), and the difference stuck to the account forever.
   */
  isIncome: boolean;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();

  const [{ data: account }, { data: category }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, type, current_balance_cents")
      .eq("id", input.accountId)
      .eq("user_id", user.id)
      .maybeSingle(),
    // Scoped to the user, which also stops a transaction being filed under
    // another user's category id on this path.
    supabase
      .from("categories")
      .select("id, kind")
      .eq("id", input.categoryId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (!account) return { error: "Couldn't find that account." };
  if (!category) return { error: "Couldn't find that category." };

  const { error } = await supabase.from("transactions").insert({
    id: input.id,
    user_id: user.id,
    account_id: input.accountId,
    category_id: input.categoryId,
    amount_cents: Math.abs(input.amountCents),
    currency: input.currency,
    merchant: input.merchant,
    note: input.note,
    txn_date: input.txnDate,
    source: "manual",
  });
  if (error) return { error: friendlyDbError(error) ?? "That didn't save. Try again." };

  // Direction from the database's own category row, mirroring exactly what
  // deleteTransaction will derive when reversing this — the two must agree or
  // the balance drifts.
  const isIncome = (category.kind as string) === "income";
  const delta = balanceDeltaCents(input.amountCents, isIncome, account.type as AccountType);
  // Atomic. Read-add-write from here let two concurrent changes each read the
  // same starting balance, with the second silently erasing the first — while
  // both transactions stayed in the ledger. See migration 0035.
  const { error: balanceError } = await supabase.rpc("adjust_account_balance", {
    p_account_id: account.id,
    p_delta_cents: delta,
  });
  if (balanceError) {
    return { error: "Saved, but the account balance didn't update. Check it on the Money screen." };
  }

  revalidatePath("/money");
  revalidatePath("/today");
  return {};
}

// Returns an error like every other action in this file. It used to return
// nothing and check nothing, so the row vanished from the screen and a
// "Transaction deleted" message appeared whether or not anything happened —
// and if the balance reversal failed, the balance stayed wrong with no trace.
export async function deleteTransaction(input: {
  id: string;
}): Promise<{ error?: string; deletedTransfer?: boolean }> {
  const { supabase, user } = await requireUser();
  const { data: txn } = await supabase
    .from("transactions")
    .select("account_id, amount_cents, category_id, transfer_group_id, categories(kind)")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!txn) return { error: "That transaction is already gone." };

  // A transfer leg never travels alone. Deleting one leg through the ordinary
  // path below reversed its balance move from `categories.kind` — an expense
  // holder category on BOTH legs — so the incoming leg of a $100 transfer
  // moved the receiving balance +$100 instead of -$100, and the other leg
  // stayed behind pointing at nothing. `delete_transfer` (migration 0038)
  // removes both rows and reverses both balance moves from each leg's own
  // recorded direction, atomically.
  if (txn.transfer_group_id) {
    const { error: transferError } = await supabase.rpc("delete_transfer", {
      p_group_id: txn.transfer_group_id,
    });
    if (transferError) {
      return { error: friendlyDbError(transferError) ?? "Couldn't remove that transfer — try again." };
    }
    revalidatePath("/money");
    revalidatePath("/today");
    // Both legs are gone — the UI should say so, because the person tapped
    // delete on one row and two disappeared.
    return { deletedTransfer: true };
  }

  const { error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .eq("id", input.id)
    .eq("user_id", user.id);
  if (deleteError) return { error: "Couldn't delete that — try again." };

  const { data: account } = await supabase
    .from("accounts")
    .select("id, type")
    .eq("id", txn.account_id)
    .maybeSingle();
  if (account) {
    const kind = (txn as unknown as { categories: { kind: string } | null }).categories?.kind;
    const delta = balanceDeltaCents(txn.amount_cents as number, kind === "income", account.type as AccountType);
  // Atomic. Read-add-write from here let two concurrent changes each read the
  // same starting balance, with the second silently erasing the first — while
  // both transactions stayed in the ledger. See migration 0035.
    const { error: balanceError } = await supabase.rpc("adjust_account_balance", {
      p_account_id: account.id,
      p_delta_cents: -delta,
    });
    if (balanceError) {
      return { error: "Deleted, but the account balance didn't update. Check it on the Money screen." };
    }
  }

  revalidatePath("/money");
  revalidatePath("/today");
  return {};
}

// ---------- Budgets ----------

export interface BudgetWithProgress extends Budget {
  category_name: string;
  category_color: string;
  spent_cents: number;
  period_start: string;
  period_end: string;
}

/**
 * Moving money between two of your own accounts.
 *
 * One database call, because a transfer that exists on only one side is worse
 * than one that doesn't exist: the two legs and both balance moves happen in a
 * single statement (`log_transfer`, migration 0037) rather than four
 * round-trips that can fail in the middle.
 *
 * Both legs carry the same `transfer_group_id`, which is what keeps this out
 * of every budget and report — see the column comment in 0037 for why a
 * category called "Transfer" would not have been good enough.
 */
export async function logTransfer(input: {
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  txnDate: string;
  note?: string | null;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();

  if (input.fromAccountId === input.toAccountId) {
    return { error: "Pick two different accounts." };
  }
  if (input.amountCents <= 0) {
    return { error: "Enter an amount bigger than zero." };
  }

  // Transfers still need a category id because the column is NOT NULL, but the
  // choice is never shown — `transfer_group_id` is what reports actually key
  // off. "Misc" is the seeded catch-all; if it has been renamed or deleted,
  // any expense category will do, because nothing reads it.
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("kind", "expense")
    .eq("is_archived", false)
    // `categories` has no sort_order column — only `shopping_categories` does.
    // getCategories orders by name, so this matches it.
    .order("name", { ascending: true });
  const list = (categories as { id: string; name: string }[]) ?? [];
  const holder = list.find((c) => c.name.toLowerCase() === "misc") ?? list[0];
  if (!holder) return { error: "Set up a category first." };

  const { error } = await supabase.rpc("log_transfer", {
    p_from_account: input.fromAccountId,
    p_to_account: input.toAccountId,
    p_amount_cents: input.amountCents,
    p_txn_date: input.txnDate,
    p_category_id: holder.id,
    p_note: input.note ?? null,
  });
  if (error) {
    // The function raises plain sentences for the two cases a person can
    // actually cause, so those are worth passing through.
    if (error.message?.includes("same currency")) {
      return {
        error: "Those two accounts use different currencies — use Send money home instead.",
      };
    }
    if (error.message?.includes("same account")) return { error: "Pick two different accounts." };
    return { error: friendlyDbError(error) ?? "Couldn't move that." };
  }

  revalidatePath("/money");
  revalidatePath("/today");
  return {};
}

export async function getBudgets(): Promise<BudgetWithProgress[]> {
  const { supabase, user } = await requireUser();
  const today = todayInAppTimezone();

  const [{ data: budgets }, { data: categories }] = await Promise.all([
    supabase.from("budgets").select("*").eq("user_id", user.id).eq("is_active", true),
    supabase.from("categories").select("id, name, color").eq("user_id", user.id),
  ]);

  const categoryById = new Map(((categories as { id: string; name: string; color: string }[]) ?? []).map((c) => [c.id, c]));
  const rows = (budgets as Budget[]) ?? [];
  if (rows.length === 0) return [];

  const results: BudgetWithProgress[] = [];
  for (const budget of rows) {
    const { start, end } = currentPeriodBounds(budget.period, budget.anchor_date, today);
    // CAD only. Accounts can be CAD or INR and every figure on this screen is
    // a Canadian-dollar figure, so adding an INR amount in as if it were
    // dollars would overstate the spend by roughly 60x. An Indian account's
    // spending isn't part of a Winnipeg grocery budget anyway — it's shown
    // separately, in its own currency, on the accounts panel.
    const { data: spentRows } = await supabase
      .from("transactions")
      .select("amount_cents")
      .eq("user_id", user.id)
      .eq("category_id", budget.category_id)
      .eq("currency", "CAD")
      // Transfers excluded: money moved between your own accounts is not
      // spending, and counting it inflates this by twice the amount — once on
      // each leg. See migration 0037.
      .is("transfer_group_id", null)
      .gte("txn_date", start)
      .lt("txn_date", end);
    const spent = (spentRows ?? []).reduce((sum, r) => sum + (r.amount_cents as number), 0);
    const category = categoryById.get(budget.category_id);
    results.push({
      ...budget,
      category_name: category?.name ?? "Category",
      category_color: category?.color ?? "#5B5C51",
      spent_cents: spent,
      period_start: start,
      period_end: end,
    });
  }
  return results;
}

export async function createBudget(input: {
  categoryId: string;
  amountCents: number;
  period: Budget["period"];
  anchorDate: string;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("budgets").upsert(
    {
      user_id: user.id,
      category_id: input.categoryId,
      amount_cents: input.amountCents,
      period: input.period,
      anchor_date: input.anchorDate,
      is_active: true,
    },
    { onConflict: "user_id,category_id" }
  );
  if (error) return { error: friendlyDbError(error) ?? "That didn't save. Try again." };
  revalidatePath("/money");
  return {};
}

export async function deleteBudget(input: { id: string }) {
  const { supabase, user } = await requireUser();
  await supabase.from("budgets").delete().eq("id", input.id).eq("user_id", user.id);
  revalidatePath("/money");
}

// Budgeted minus spent, across every active budget — the same arithmetic the
// Money screen's own vitals strip does.
//
// It used to clamp each budget at zero (`Math.max(0, left)`), which made
// overspending invisible: blow $300 on one budget and have $300 left on
// another and the dashboard said "$300 safe to spend" while Money said "$0".
// Two screens, same data, different answers, and the more optimistic one was
// on the screen you see first every morning.
export async function getSafeToSpend(): Promise<{ remainingCents: number; overCount: number }> {
  const budgets = await getBudgets();
  let remaining = 0;
  let overCount = 0;
  for (const b of budgets) {
    const left = b.amount_cents - b.spent_cents;
    remaining += left;
    if (left < 0) overCount += 1;
  }
  return { remainingCents: remaining, overCount };
}

// ---------- Savings goals ----------

export async function getSavingsGoals(): Promise<SavingsGoal[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("savings_goals")
    .select("*")
    .eq("user_id", user.id)
    .order("is_done", { ascending: true })
    .order("created_at", { ascending: false });
  return (data as SavingsGoal[]) ?? [];
}

export async function createSavingsGoal(input: {
  name: string;
  targetCents: number;
  deadline: string | null;
  icon: string;
}): Promise<{ goal?: SavingsGoal; error?: string }> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("savings_goals")
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      target_cents: input.targetCents,
      deadline: input.deadline,
      icon: input.icon,
    })
    .select("*")
    .single();
  if (error || !data) return { error: friendlyDbError(error) ?? "Could not create that goal." };
  revalidatePath("/money");
  return { goal: data as SavingsGoal };
}

// Returns the goal's true saved total rather than nothing, so the screen shows
// what was actually banked instead of what it optimistically assumed. If the
// row can't be found the caller gets an error to show — previously this
// returned silently, which is how "money added" could appear over a write that
// never happened.
export async function addToGoal(input: {
  id: string;
  amountCents: number;
}): Promise<{ savedCents?: number; isDone?: boolean; error?: string }> {
  const { supabase, user } = await requireUser();
  const { data: goal } = await supabase
    .from("savings_goals")
    .select("saved_cents, target_cents")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!goal) return { error: "Couldn't find that goal." };
  const nextSaved = Math.max(0, (goal.saved_cents as number) + input.amountCents);
  const isDone = nextSaved >= (goal.target_cents as number);
  const { error } = await supabase
    .from("savings_goals")
    .update({ saved_cents: nextSaved, is_done: isDone })
    .eq("id", input.id)
    .eq("user_id", user.id);
  if (error) return { error: friendlyDbError(error) ?? "That didn't save. Try again." };
  revalidatePath("/money");
  return { savedCents: nextSaved, isDone };
}

export async function deleteSavingsGoal(input: { id: string }) {
  const { supabase, user } = await requireUser();
  await supabase.from("savings_goals").delete().eq("id", input.id).eq("user_id", user.id);
  revalidatePath("/money");
}

// ---------- Debts ----------

export async function getDebts(): Promise<Debt[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("debts")
    .select("*")
    .eq("user_id", user.id)
    .order("interest_rate_pct", { ascending: false });
  return (data as Debt[]) ?? [];
}

export async function createDebt(input: {
  name: string;
  balanceCents: number;
  interestRatePct: number;
  minPaymentCents: number;
  targetPayoffDate: string | null;
}): Promise<{ debt?: Debt; error?: string }> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("debts")
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      balance_cents: input.balanceCents,
      interest_rate_pct: input.interestRatePct,
      min_payment_cents: input.minPaymentCents,
      target_payoff_date: input.targetPayoffDate,
    })
    .select("*")
    .single();
  if (error || !data) return { error: friendlyDbError(error) ?? "Could not add that debt." };
  revalidatePath("/money");
  return { debt: data as Debt };
}

export async function deleteDebt(input: { id: string }) {
  const { supabase, user } = await requireUser();
  await supabase.from("debts").delete().eq("id", input.id).eq("user_id", user.id);
  revalidatePath("/money");
}

// ---------- Remittances (INR) ----------

export async function getFxRate(from: string, to: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, number> };
    return data.rates?.[to] ?? null;
  } catch {
    return null;
  }
}

export async function logRemittance(input: {
  id: string;
  accountId: string;
  cadCents: number;
  inrCents: number;
  note: string | null;
  txnDate: string;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();

  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", "Remittance")
    .maybeSingle();
  if (!category) return { error: "No Remittance category found." };

  const { data: account } = await supabase
    .from("accounts")
    .select("id, type, current_balance_cents")
    .eq("id", input.accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) return { error: "Couldn't find that account." };

  const fxRateToCad = input.inrCents > 0 ? input.cadCents / input.inrCents : null;

  const { error } = await supabase.from("transactions").insert({
    id: input.id,
    user_id: user.id,
    account_id: input.accountId,
    category_id: category.id,
    amount_cents: input.cadCents,
    currency: "CAD",
    fx_rate_to_cad: fxRateToCad,
    note: input.note,
    txn_date: input.txnDate,
    source: "manual",
  });
  if (error) return { error: friendlyDbError(error) ?? "That didn't save. Try again." };

  const delta = balanceDeltaCents(input.cadCents, false, account.type as AccountType);
  // Atomic — see migration 0035.
  const { error: balanceError } = await supabase.rpc("adjust_account_balance", {
    p_account_id: account.id,
    p_delta_cents: delta,
  });
  if (balanceError) {
    return { error: "Saved, but the account balance didn't update. Check it on the Money screen." };
  }

  revalidatePath("/money");
  return {};
}

export async function getRemittanceSummary(): Promise<{ cadTotalCents: number; inrTotalCents: number }> {
  const { supabase, user } = await requireUser();
  const yearStart = `${todayInAppTimezone().slice(0, 4)}-01-01`;

  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", "Remittance")
    .maybeSingle();
  if (!category) return { cadTotalCents: 0, inrTotalCents: 0 };

  const { data: rows } = await supabase
    .from("transactions")
    .select("amount_cents, fx_rate_to_cad")
    .eq("user_id", user.id)
    .eq("category_id", category.id)
    .gte("txn_date", yearStart);

  let cadTotal = 0;
  let inrTotal = 0;
  for (const r of rows ?? []) {
    cadTotal += r.amount_cents as number;
    if (r.fx_rate_to_cad) inrTotal += (r.amount_cents as number) / (r.fx_rate_to_cad as number);
  }
  return { cadTotalCents: cadTotal, inrTotalCents: Math.round(inrTotal) };
}

// ---------- Reports ----------

export interface CategorySpend {
  categoryId: string;
  categoryName: string;
  totalCents: number;
}

// Re-exported for convenience so a screen can import the period type from the
// same module as the actions it feeds. Type-only, so this stays legal inside a
// "use server" file — client components can equally import them straight from
// `@/lib/finance/period`, which is a plain module with no server code in it.
export type { PeriodRange, PeriodUnit, ReportPeriod } from "@/lib/finance/period";

// The report period — a month or a week, `offset` 0 = current, -1 = previous.
// The range and label maths are pure and live in lib/finance/period.ts so they
// can be tested; everything here only anchors them to the app timezone and
// applies the same three filters to the database.
//
// ANCHORED ON `todayInAppTimezone()`, NEVER A BROWSER CLOCK. `reports-view.tsx`
// used to build its own header label from `new Date()`, which is the device's
// timezone — on the 1st of a month, a phone an hour behind Winnipeg labelled
// the data with the wrong month. The label now comes back from the server with
// the data, so there is nothing left for the screen to recompute.

/** The Supabase client `requireUser()` hands back, named so helpers can take it. */
type ReportClient = Awaited<ReturnType<typeof requireUser>>["supabase"];

/**
 * The two profile settings every report needs, read together.
 *
 * `timezone` is what "today" means for THIS account. Without it every date
 * boundary on this screen falls back to the hardcoded Winnipeg constant, which
 * is a guess rather than the setting — the same fix goal-actions.ts and
 * recurring-actions.ts already carry. `weekStart` is how a week is anchored.
 * They live in the same row, so one read gets both and they can never
 * disagree about which profile they came from.
 */
async function reportProfile(
  supabase: ReportClient,
  userId: string
): Promise<{ weekStart: WeekStart; timezone: string | undefined }> {
  const { data } = await supabase
    .from("profiles")
    .select("preferences, timezone")
    .eq("id", userId)
    .maybeSingle();
  return {
    weekStart: resolvePreferences(data?.preferences).weekStart,
    // `undefined`, not null, so `todayInAppTimezone` applies its own default.
    timezone: (data?.timezone as string) || undefined,
  };
}

const CURRENT_MONTH: ReportPeriod = { unit: "month", offset: 0 };

/** Defaults for `getReport`; the screen passes its own so the two always agree. */
const TREND_COUNT_DEFAULT = 6;
const MERCHANT_LIMIT_DEFAULT = 5;

// Ceilings for the same two numbers. They arrive from the browser, and this is
// a public authenticated endpoint — anything that gets looped over or turned
// into a date has to be bounded here, not in the screen that happens to call it
// politely today.
const TREND_COUNT_MAX = 24;
const MERCHANT_LIMIT_MAX = 50;
/** How far back reports go: ten years of months, or a bit over two of weeks. */
const OFFSET_MAX_BACK = 120;

/** A whole number inside `[1, max]`, or the default when it is nonsense. */
function clampCount(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(value)));
}

/**
 * Why a requested period can't be reported on, in plain English — or null.
 *
 * A non-integer or absurd offset is not a harmless input: `Date.UTC(2026, NaN,
 * 1)` is an Invalid Date, which becomes an unusable date string, which Postgres
 * rejects — a thrown server error the screen can only show as a blank panel.
 */
function reportPeriodProblem(period: ReportPeriod): string | null {
  if (period.unit !== "month" && period.unit !== "week") {
    return "Reports can only show a month or a week.";
  }
  if (!Number.isInteger(period.offset)) {
    return "That's not a period I can report on.";
  }
  if (period.offset > 0) {
    return "That period hasn't happened yet, so there's nothing to show.";
  }
  if (period.offset < -OFFSET_MAX_BACK) {
    return `That's further back than reports go. Try a more recent ${period.unit}.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The query bodies, shared
// ---------------------------------------------------------------------------
//
// Each of these is the database work behind one panel, with the client, the
// user id and the ALREADY-RESOLVED date range handed in. They are private on
// purpose: `getReport` is the only way in, so there is one authenticated
// endpoint for this screen rather than a per-panel one nothing calls. (Several
// such were briefly created and removed inside the same piece of work — dead
// code with a login attached. No count is given because none reached a commit
// and so none is checkable.)
//
// The filters they share, and why:
//   currency = CAD          - one currency per chart, or the totals are fiction
//   transfer_group_id null  - moving your own money between accounts is not spend
//   categories.kind expense - a payday deposit is not "where the money went"
// plus user_id, which RLS also enforces - defence in depth, per SPEC Part B3.
//
// `failed` is returned rather than thrown so `getReport` can tell the screen
// the difference between "nothing spent" and "couldn't load it" - see `error`
// on ReportSummary.

// ---------------------------------------------------------------------------
// Reading EVERY matching row, not just the first thousand
// ---------------------------------------------------------------------------
//
// Supabase's API caps the rows one request may return (1000 by default, set on
// the server, not by us). A capped response looks exactly like a complete one:
// no error, no flag, just fewer rows. The trend chart spans six periods in a
// single query, so a busy six months of CSV-imported transactions would have
// drawn bars that read LOW with nothing anywhere saying so - a wrong number on
// a money screen, which is the worst class of bug this app has. The category
// and merchant queries are the same shape over one period, so they carry the
// same exposure and get the same treatment.
//
// Paging, rather than aggregating in SQL: a `sum(...) group by` in the database
// would ship fewer bytes, but it would mean a migration and a database function
// per chart, with the four filters below restated in a second language and two
// places to keep them in step. One copy of the rules is worth the extra bytes
// at this size.
//
// Paging needs a TOTAL ORDER or pages can overlap and rows can vanish between
// them, so every query below adds `.order("id")`. It is an arbitrary order and
// deliberately so - nothing here depends on it beyond stability, and the
// sorting Alan actually sees happens after the totalling.
const ROWS_PER_PAGE = 1000;

// 60,000 rows in one report is not a real account; it is a runaway import or a
// bug. Rather than page forever, stop and FAIL - the screen then says it
// couldn't load the figures, which is true, instead of charting part of them,
// which would not be.
const MAX_REPORT_PAGES = 60;

async function fetchAllRows(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>
): Promise<{ rows: Record<string, unknown>[]; failed: boolean }> {
  const all: Record<string, unknown>[] = [];
  for (let pageIndex = 0; pageIndex < MAX_REPORT_PAGES; pageIndex++) {
    const from = pageIndex * ROWS_PER_PAGE;
    const { data, error } = await page(from, from + ROWS_PER_PAGE - 1);
    if (error) return { rows: [], failed: true };
    const batch = (data ?? []) as Record<string, unknown>[];
    all.push(...batch);
    // A short page is the last page. A full one might not be, so ask again.
    if (batch.length < ROWS_PER_PAGE) return { rows: all, failed: false };
  }
  return { rows: [], failed: true };
}

async function queryCategorySpend(
  supabase: ReportClient,
  userId: string,
  range: PeriodRange
): Promise<{ rows: CategorySpend[]; failed: boolean }> {
  const { rows: data, failed } = await fetchAllRows((from, to) =>
    supabase
      .from("transactions")
      .select("amount_cents, category_id, categories(name, kind)")
      .eq("user_id", userId)
      .eq("currency", "CAD")
      .is("transfer_group_id", null)
      .gte("txn_date", range.start)
      .lt("txn_date", range.end)
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (failed) return { rows: [], failed: true };

  const totals = new Map<string, { name: string; total: number }>();
  for (const row of data) {
    const category = (row as unknown as { categories: { name: string; kind: string } | null }).categories;
    if (!category || category.kind !== "expense") continue;
    const key = row.category_id as string;
    const existing = totals.get(key) ?? { name: category.name, total: 0 };
    existing.total += row.amount_cents as number;
    totals.set(key, existing);
  }

  return {
    rows: [...totals.entries()]
      .map(([categoryId, v]) => ({ categoryId, categoryName: v.name, totalCents: v.total }))
      .sort((a, b) => b.totalCents - a.totalCents),
    failed: false,
  };
}

// One request spans every bucket and the rows are bucketed in memory, rather
// than the old one-query-per-bucket loop: same numbers, five fewer round trips.
// Spanning six periods at once is also what made the row cap a real risk here,
// which is why this reads through `fetchAllRows` rather than taking whatever
// one response happened to contain.
async function querySpendTrend(
  supabase: ReportClient,
  userId: string,
  ranges: PeriodRange[]
): Promise<{ rows: { label: string; totalCents: number }[]; failed: boolean }> {
  if (ranges.length === 0) return { rows: [], failed: false };

  const { rows: data, failed } = await fetchAllRows((from, to) =>
    supabase
      .from("transactions")
      .select("amount_cents, txn_date, categories(kind)")
      .eq("user_id", userId)
      .eq("currency", "CAD")
      .is("transfer_group_id", null)
      .gte("txn_date", ranges[0].start)
      .lt("txn_date", ranges[ranges.length - 1].end)
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (failed) return { rows: [], failed: true };

  const totals = new Array<number>(ranges.length).fill(0);
  for (const row of data) {
    const kind = (row as unknown as { categories: { kind: string } | null }).categories?.kind;
    if (kind !== "expense") continue;
    const date = row.txn_date as string;
    const index = ranges.findIndex((r) => date >= r.start && date < r.end);
    if (index >= 0) totals[index] += row.amount_cents as number;
  }

  return { rows: ranges.map((r, i) => ({ label: r.label, totalCents: totals[i] })), failed: false };
}

async function queryTopMerchants(
  supabase: ReportClient,
  userId: string,
  range: PeriodRange,
  limit: number
): Promise<{ rows: { merchant: string; totalCents: number }[]; failed: boolean }> {
  // Expenses only - this answers "where is the money going", so a payday
  // deposit that happens to carry an employer name doesn't belong at the top
  // of the list (it used to sit there, dwarfing everything real).
  const { rows: data, failed } = await fetchAllRows((from, to) =>
    supabase
      .from("transactions")
      .select("amount_cents, merchant, categories(kind)")
      .eq("user_id", userId)
      .eq("currency", "CAD")
      .is("transfer_group_id", null)
      .not("merchant", "is", null)
      .gte("txn_date", range.start)
      .lt("txn_date", range.end)
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (failed) return { rows: [], failed: true };

  const totals = new Map<string, number>();
  for (const row of data) {
    const kind = (row as unknown as { categories: { kind: string } | null }).categories?.kind;
    if (kind !== "expense") continue;
    const merchant = row.merchant as string;
    totals.set(merchant, (totals.get(merchant) ?? 0) + (row.amount_cents as number));
  }
  return {
    rows: [...totals.entries()]
      .map(([merchant, totalCents]) => ({ merchant, totalCents }))
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, limit),
    failed: false,
  };
}

// ---------------------------------------------------------------------------
// The whole Reports screen, in one call
// ---------------------------------------------------------------------------

export interface ReportSummary {
  /** The period actually queried, with its labels. */
  range: PeriodRange;
  byCategory: CategorySpend[];
  trend: { label: string; totalCents: number }[];
  merchants: { merchant: string; totalCents: number }[];
  /**
   * Present only when a query failed. The lists are then empty, and an empty
   * list must NOT be read as "nothing was spent" - check this first.
   */
  error?: string;
}

/**
 * Everything the Reports screen shows for one period, in a single round trip.
 *
 * Next runs server actions from one client SEQUENTIALLY, so several calls per
 * period change cost several sequential round trips - a visible stall on a
 * phone every time an arrow or the Month/Week switch was tapped. (Exactly how
 * many depends on which draft you compare against; the shipped screen before
 * this made three, one of which only ran on the current month. What matters is
 * that they queued.)
 * The queries are independent of each other, so here they are one hop and a
 * `Promise.all` on the server, where the concurrency is real.
 *
 * The period's label comes back with the figures, so the heading and the
 * numbers under it are always from the same period, and the screen never
 * recomputes a date from the browser clock.
 *
 * `options` exists so the caller's own constants (six trend buckets, five
 * merchants) stay the single source of truth for what it renders;
 * `getReport(period)` on its own is a perfectly good call. Both are still
 * bounded here — this is an authenticated endpoint, and what the screen sends
 * today is not a guarantee about what arrives tomorrow.
 */
export async function getReport(
  period: ReportPeriod = CURRENT_MONTH,
  options: { trendCount?: number; merchantLimit?: number } = {}
): Promise<ReportSummary> {
  const { supabase, user } = await requireUser();
  // The account's own timezone decides where every one of these date
  // boundaries falls, so it is read before any of them are worked out.
  const { weekStart, timezone } = await reportProfile(supabase, user.id);
  const today = todayInAppTimezone(timezone);

  const problem = reportPeriodProblem(period);
  if (problem) {
    // Answered, not thrown. The screen can render a sentence; it cannot render
    // a 500. The range is the current month purely so the shape is valid —
    // `error` is set, so the screen shows the message, not these empty lists.
    return {
      range: periodRangeFor(today, CURRENT_MONTH, weekStart),
      byCategory: [],
      trend: [],
      merchants: [],
      error: problem,
    };
  }

  // Clamped rather than refused: asking for 500 trend bars is out of range,
  // not nonsense, and quietly showing 24 is a better answer than an error.
  // `trendCount` is the one that must not be trusted — it is looped over, and
  // each turn of the loop is a date and a bucket.
  const trendCount = clampCount(options.trendCount, TREND_COUNT_DEFAULT, TREND_COUNT_MAX);
  const merchantLimit = clampCount(options.merchantLimit, MERCHANT_LIMIT_DEFAULT, MERCHANT_LIMIT_MAX);

  const range = periodRangeFor(today, period, weekStart);
  const trendRanges = trendRangesFor(today, period, trendCount, weekStart);

  const [byCategory, trend, merchants] = await Promise.all([
    queryCategorySpend(supabase, user.id, range),
    querySpendTrend(supabase, user.id, trendRanges),
    queryTopMerchants(supabase, user.id, range, merchantLimit),
  ]);

  const failed = byCategory.failed || trend.failed || merchants.failed;
  return {
    range,
    byCategory: byCategory.rows,
    trend: trend.rows,
    merchants: merchants.rows,
    ...(failed ? { error: "Couldn't load these figures." } : {}),
  };
}

// ---------- Today dashboard ----------

export async function getFinanceDashboardSummary(): Promise<{ safeToSpendCents: number; overCount: number }> {
  const { remainingCents, overCount } = await getSafeToSpend();
  return { safeToSpendCents: remainingCents, overCount };
}
