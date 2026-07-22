"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayInAppTimezone } from "@/lib/time";
import { currentPeriodBounds } from "@/lib/finance/period";
import { balanceDeltaCents } from "@/lib/finance/balance";
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

export async function createAccount(input: {
  name: string;
  institution: string;
  type: AccountType;
  currency: CurrencyCode;
  currentBalanceCents: number;
  isDebt: boolean;
  creditLimitCents: number | null;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const { data: existing } = await supabase
    .from("accounts")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSort = (existing?.[0]?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("accounts").insert({
    user_id: user.id,
    name: input.name.trim(),
    institution: input.institution.trim(),
    type: input.type,
    currency: input.currency,
    current_balance_cents: input.currentBalanceCents,
    is_debt: input.isDebt,
    credit_limit_cents: input.creditLimitCents,
    sort_order: nextSort,
  });
  if (error) return { error: error.message };
  revalidatePath("/money");
  return {};
}

export async function updateAccountBalance(input: { id: string; balanceCents: number }) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("accounts")
    .update({ current_balance_cents: input.balanceCents })
    .eq("id", input.id)
    .eq("user_id", user.id);
  revalidatePath("/money");
  revalidatePath("/today");
}

export async function deleteAccount(input: { id: string }): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("accounts").delete().eq("id", input.id).eq("user_id", user.id);
  if (error) return { error: "Can't delete — it still has transactions logged against it." };
  revalidatePath("/money");
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

export interface MerchantMemory {
  merchant: string;
  categoryId: string;
}

export async function getRecentMerchants(): Promise<MerchantMemory[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("transactions")
    .select("merchant, category_id, created_at")
    .eq("user_id", user.id)
    .not("merchant", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  const seen = new Set<string>();
  const memory: MerchantMemory[] = [];
  for (const row of data ?? []) {
    const key = (row.merchant as string).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    memory.push({ merchant: row.merchant as string, categoryId: row.category_id as string });
  }
  return memory;
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
  isIncome: boolean;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();

  const { data: account } = await supabase
    .from("accounts")
    .select("id, type, current_balance_cents")
    .eq("id", input.accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) return { error: "Couldn't find that account." };

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
  if (error) return { error: error.message };

  const delta = balanceDeltaCents(input.amountCents, input.isIncome, account.type as AccountType);
  await supabase
    .from("accounts")
    .update({ current_balance_cents: (account.current_balance_cents as number) + delta })
    .eq("id", account.id);

  revalidatePath("/money");
  revalidatePath("/today");
  return {};
}

export async function deleteTransaction(input: { id: string }) {
  const { supabase, user } = await requireUser();
  const { data: txn } = await supabase
    .from("transactions")
    .select("account_id, amount_cents, category_id, categories(kind)")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();

  await supabase.from("transactions").delete().eq("id", input.id).eq("user_id", user.id);

  if (txn) {
    const { data: account } = await supabase
      .from("accounts")
      .select("id, type, current_balance_cents")
      .eq("id", txn.account_id)
      .maybeSingle();
    if (account) {
      const kind = (txn as unknown as { categories: { kind: string } | null }).categories?.kind;
      const delta = balanceDeltaCents(txn.amount_cents as number, kind === "income", account.type as AccountType);
      await supabase
        .from("accounts")
        .update({ current_balance_cents: (account.current_balance_cents as number) - delta })
        .eq("id", account.id);
    }
  }

  revalidatePath("/money");
  revalidatePath("/today");
}

// ---------- Budgets ----------

export interface BudgetWithProgress extends Budget {
  category_name: string;
  category_color: string;
  spent_cents: number;
  period_start: string;
  period_end: string;
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
    const { data: spentRows } = await supabase
      .from("transactions")
      .select("amount_cents")
      .eq("user_id", user.id)
      .eq("category_id", budget.category_id)
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
  if (error) return { error: error.message };
  revalidatePath("/money");
  return {};
}

export async function deleteBudget(input: { id: string }) {
  const { supabase, user } = await requireUser();
  await supabase.from("budgets").delete().eq("id", input.id).eq("user_id", user.id);
  revalidatePath("/money");
}

export async function getSafeToSpend(): Promise<{ remainingCents: number; overCount: number }> {
  const budgets = await getBudgets();
  let remaining = 0;
  let overCount = 0;
  for (const b of budgets) {
    const left = b.amount_cents - b.spent_cents;
    remaining += Math.max(0, left);
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
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("savings_goals").insert({
    user_id: user.id,
    name: input.name.trim(),
    target_cents: input.targetCents,
    deadline: input.deadline,
    icon: input.icon,
  });
  if (error) return { error: error.message };
  revalidatePath("/money");
  return {};
}

export async function addToGoal(input: { id: string; amountCents: number }) {
  const { supabase, user } = await requireUser();
  const { data: goal } = await supabase
    .from("savings_goals")
    .select("saved_cents, target_cents")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!goal) return;
  const nextSaved = Math.max(0, (goal.saved_cents as number) + input.amountCents);
  await supabase
    .from("savings_goals")
    .update({ saved_cents: nextSaved, is_done: nextSaved >= (goal.target_cents as number) })
    .eq("id", input.id)
    .eq("user_id", user.id);
  revalidatePath("/money");
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
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("debts").insert({
    user_id: user.id,
    name: input.name.trim(),
    balance_cents: input.balanceCents,
    interest_rate_pct: input.interestRatePct,
    min_payment_cents: input.minPaymentCents,
    target_payoff_date: input.targetPayoffDate,
  });
  if (error) return { error: error.message };
  revalidatePath("/money");
  return {};
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
  if (error) return { error: error.message };

  const delta = balanceDeltaCents(input.cadCents, false, account.type as AccountType);
  await supabase
    .from("accounts")
    .update({ current_balance_cents: (account.current_balance_cents as number) + delta })
    .eq("id", account.id);

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

function monthRange(monthOffset: number): { start: string; end: string; label: string } {
  const now = new Date(`${todayInAppTimezone()}T00:00:00Z`);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1 + monthOffset;
  const normYear = year + Math.floor((month - 1) / 12);
  const normMonth = ((month - 1) % 12) + 1;
  const start = `${normYear}-${String(normMonth).padStart(2, "0")}-01`;
  const nextMonth = normMonth === 12 ? 1 : normMonth + 1;
  const nextYear = normMonth === 12 ? normYear + 1 : normYear;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  const label = new Date(`${start}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return { start, end, label };
}

export async function getMonthlySpendByCategory(monthOffset = 0): Promise<CategorySpend[]> {
  const { supabase, user } = await requireUser();
  const { start, end } = monthRange(monthOffset);

  const { data } = await supabase
    .from("transactions")
    .select("amount_cents, category_id, categories(name, kind)")
    .eq("user_id", user.id)
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
  const { data } = await supabase
    .from("transactions")
    .select("amount_cents, merchant")
    .eq("user_id", user.id)
    .not("merchant", "is", null)
    .gte("txn_date", start)
    .lt("txn_date", end);

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
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
