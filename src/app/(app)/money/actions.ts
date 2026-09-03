"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayInAppTimezone } from "@/lib/time";
import { currentPeriodBounds } from "@/lib/finance/period";
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
export async function deleteTransaction(input: { id: string }): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const { data: txn } = await supabase
    .from("transactions")
    .select("account_id, amount_cents, category_id, categories(kind)")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!txn) return { error: "That transaction is already gone." };

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

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// The month `monthOffset` months from now, as an inclusive start / exclusive
// end pair of YYYY-MM-DD strings.
//
// THE BUG THIS FIXES. The old version normalised with `((month - 1) % 12) + 1`,
// and JavaScript's `%` keeps the sign of its left operand — so any offset that
// crossed back over a year boundary produced a *negative* month number and
// dates like "2025-00-01" or "2025--4-01". Postgres rejects those outright
// ("date/time field value out of range"), the query's error was discarded by
// `const { data } =`, and the screen showed $0 spent rather than a failure.
// Reachable by tapping Reports' month navigator back past January, and it
// would have emptied five of the six bars in the trend chart every January.
//
// Date.UTC does the normalisation correctly for any offset in either
// direction, so the arithmetic is handed to it rather than done by hand.
function monthRange(monthOffset: number): { start: string; end: string; label: string } {
  const [year, month] = todayInAppTimezone().split("-").map(Number);
  const startDate = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const endDate = new Date(Date.UTC(year, month + monthOffset, 1));
  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
    label: MONTH_LABELS[startDate.getUTCMonth()],
  };
}

export async function getMonthlySpendByCategory(monthOffset = 0): Promise<CategorySpend[]> {
  const { supabase, user } = await requireUser();
  const { start, end } = monthRange(monthOffset);

  const { data } = await supabase
    .from("transactions")
    .select("amount_cents, category_id, categories(name, kind)")
    .eq("user_id", user.id)
    .eq("currency", "CAD")
    .is("transfer_group_id", null)
    .gte("txn_date", start)
    .lt("txn_date", end);

  const totals = new Map<string, { name: string; total: number }>();
  for (const row of data ?? []) {
    const category = (row as unknown as { categories: { name: string; kind: string } | null }).categories;
    if (!category || category.kind !== "expense") continue;
    const key = row.category_id as string;
    const existing = totals.get(key) ?? { name: category.name, total: 0 };
    existing.total += row.amount_cents as number;
    totals.set(key, existing);
  }

  return [...totals.entries()]
    .map(([categoryId, v]) => ({ categoryId, categoryName: v.name, totalCents: v.total }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

export async function getMonthlyTrend(monthsBack = 6): Promise<{ label: string; totalCents: number }[]> {
  const { supabase, user } = await requireUser();
  const results: { label: string; totalCents: number }[] = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const { start, end, label } = monthRange(-i);
    const { data } = await supabase
      .from("transactions")
      .select("amount_cents, categories(kind)")
      .eq("user_id", user.id)
      .eq("currency", "CAD")
      .is("transfer_group_id", null)
      .gte("txn_date", start)
      .lt("txn_date", end);
    const total = (data ?? []).reduce((sum, row) => {
      const kind = (row as unknown as { categories: { kind: string } | null }).categories?.kind;
      return kind === "expense" ? sum + (row.amount_cents as number) : sum;
    }, 0);
    results.push({ label, totalCents: total });
  }
  return results;
}

export async function getTopMerchants(limit = 5): Promise<{ merchant: string; totalCents: number }[]> {
  const { supabase, user } = await requireUser();
  const { start, end } = monthRange(0);
  // Expenses only — this answers "where is the money going", so a payday
  // deposit that happens to carry an employer name doesn't belong at the top
  // of the list (it used to sit there, dwarfing everything real).
  const { data } = await supabase
    .from("transactions")
    .select("amount_cents, merchant, categories(kind)")
    .eq("user_id", user.id)
    .eq("currency", "CAD")
    .is("transfer_group_id", null)
    .not("merchant", "is", null)
    .gte("txn_date", start)
    .lt("txn_date", end);

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    const kind = (row as unknown as { categories: { kind: string } | null }).categories?.kind;
    if (kind !== "expense") continue;
    const merchant = row.merchant as string;
    totals.set(merchant, (totals.get(merchant) ?? 0) + (row.amount_cents as number));
  }
  return [...totals.entries()]
    .map(([merchant, totalCents]) => ({ merchant, totalCents }))
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, limit);
}

// ---------- Today dashboard ----------

export async function getFinanceDashboardSummary(): Promise<{ safeToSpendCents: number; overCount: number }> {
  const { remainingCents, overCount } = await getSafeToSpend();
  return { safeToSpendCents: remainingCents, overCount };
}
