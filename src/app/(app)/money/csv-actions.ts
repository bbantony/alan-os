"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { categorizeCsvRows } from "@/lib/ai/csv-categorizer";
import { findBestMatch } from "@/lib/finance/fuzzy-match";
import { balanceDeltaCents } from "@/lib/finance/balance";
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

export interface CsvCandidateRow {
  tempId: string;
  txnDate: string;
  merchant: string;
  amountCents: number;
  isIncome: boolean;
  suggestedCategoryId: string | null;
  isDuplicate: boolean;
}

interface RawCsvRow {
  date: string;
  description: string;
  amountCents: number;
  isIncome: boolean;
}

// Parses a CSV client-side (via the pure parseCsv helper), then this action
// resolves each row's category (heuristic recent-merchant match first, one
// batched AI call for anything left unresolved — never one AI call per row)
// and flags likely-already-logged duplicates so the review screen can leave
// them unchecked by default.
export async function buildCsvCandidates(input: { rows: RawCsvRow[] }): Promise<{
  candidates?: CsvCandidateRow[];
  error?: string;
}> {
  const { supabase, user } = await requireUser();
  if (input.rows.length === 0) return { error: "No rows to import." };
  if (input.rows.length > 500) return { error: "That's a lot of rows at once — try a smaller export." };

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_archived", false);
  const categoryList = (categories as Category[]) ?? [];

  const sortedDates = [...input.rows.map((r) => r.date)].sort();
  const { data: existingTxns } = await supabase
    .from("transactions")
    .select("txn_date, amount_cents, merchant")
    .eq("user_id", user.id)
    .gte("txn_date", sortedDates[0])
    .lte("txn_date", sortedDates[sortedDates.length - 1]);
  const existing = (existingTxns as { txn_date: string; amount_cents: number; merchant: string | null }[]) ?? [];

  const { data: merchantMemory } = await supabase
    .from("transactions")
    .select("merchant, category_id")
    .eq("user_id", user.id)
    .not("merchant", "is", null)
    .order("created_at", { ascending: false })
    .limit(300);
  const memory = (merchantMemory as { merchant: string; category_id: string }[]) ?? [];

  function categoriesFor(isIncome: boolean): Category[] {
    return categoryList.filter((c) => c.kind === (isIncome ? "income" : "expense"));
  }

  function heuristicGuess(merchant: string, isIncome: boolean): string | null {
    const allowed = new Set(categoriesFor(isIncome).map((c) => c.id));
    const candidates = memory.filter((m) => allowed.has(m.category_id));
    const match = findBestMatch(merchant, candidates, (m) => m.merchant);
    return match?.item.category_id ?? null;
  }

  const heuristicResults = input.rows.map((r) => heuristicGuess(r.description, r.isIncome));
  const unresolvedIndexes = heuristicResults.map((g, i) => (g === null ? i : -1)).filter((i) => i !== -1);

  let aiByIndex: Map<number, string | null> | null = null;
  if (unresolvedIndexes.length > 0) {
    // Split by kind so the AI is only ever offered category names that are
    // actually valid for that row (never asked to pick an income category
    // for an expense row or vice versa).
    const expenseIdx = unresolvedIndexes.filter((i) => !input.rows[i].isIncome);
    const incomeIdx = unresolvedIndexes.filter((i) => input.rows[i].isIncome);
    aiByIndex = new Map();

    for (const [idxList, isIncome] of [
      [expenseIdx, false],
      [incomeIdx, true],
    ] as const) {
      if (idxList.length === 0) continue;
      const names = categoriesFor(isIncome).map((c) => c.name);
      const nameToId = new Map(categoriesFor(isIncome).map((c) => [c.name, c.id]));
      const result = await categorizeCsvRows(
        idxList.map((i) => ({ merchant: input.rows[i].description, amountCents: input.rows[i].amountCents })),
        names
      );
      if (!result) continue;
      idxList.forEach((rowIdx, k) => {
        const categoryName = result[k];
        aiByIndex!.set(rowIdx, categoryName ? (nameToId.get(categoryName) ?? null) : null);
      });
    }
  }

  const candidates: CsvCandidateRow[] = input.rows.map((r, i) => {
    const isDuplicate = existing.some(
      (t) =>
        t.txn_date === r.date &&
        t.amount_cents === Math.abs(r.amountCents) &&
        (t.merchant ?? "").trim().toLowerCase() === r.description.trim().toLowerCase()
    );
    const suggestedCategoryId = heuristicResults[i] ?? aiByIndex?.get(i) ?? null;
    return {
      tempId: crypto.randomUUID(),
      txnDate: r.date,
      merchant: r.description,
      amountCents: Math.abs(r.amountCents),
      isIncome: r.isIncome,
      suggestedCategoryId,
      isDuplicate,
    };
  });

  return { candidates };
}

export async function importCsvTransactions(input: {
  accountId: string;
  rows: { txnDate: string; merchant: string; amountCents: number; isIncome: boolean; categoryId: string }[];
}): Promise<{ imported?: number; error?: string }> {
  const { supabase, user } = await requireUser();
  if (input.rows.length === 0) return { error: "Nothing selected to import." };

  const { data: account } = await supabase
    .from("accounts")
    .select("id, type, currency, current_balance_cents")
    .eq("id", input.accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) return { error: "Couldn't find that account." };

  // The account's own currency, not a hardcoded "CAD" — importing an Indian
  // statement used to label every row Canadian, which then counted straight
  // into the CAD budgets and reports at 60x its real value.
  const inserts = input.rows.map((r) => ({
    user_id: user.id,
    account_id: input.accountId,
    category_id: r.categoryId,
    amount_cents: r.amountCents,
    currency: account.currency as string,
    merchant: r.merchant,
    note: null,
    txn_date: r.txnDate,
    source: "csv",
  }));
  const { error } = await supabase.from("transactions").insert(inserts);
  if (error) return { error: friendlyDbError(error) ?? "That didn't save. Try again." };

  const totalDelta = input.rows.reduce(
    (sum, r) => sum + balanceDeltaCents(r.amountCents, r.isIncome, account.type as AccountType),
    0
  );
  // Atomic — see migration 0035. An import moves the balance by the sum of
  // every row at once, so losing this to a concurrent write is expensive.
  const { error: balanceError } = await supabase.rpc("adjust_account_balance", {
    p_account_id: account.id,
    p_delta_cents: totalDelta,
  });
  if (balanceError) {
    return {
      error: "The transactions imported, but the account balance didn't update. Check it on the Money screen.",
    };
  }

  revalidatePath("/money");
  revalidatePath("/today");
  return { imported: input.rows.length };
}
