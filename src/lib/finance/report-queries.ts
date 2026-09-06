import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PeriodRange } from "./period";

/**
 * The database half of a spending report, shared by the screen and the model.
 *
 * This used to live inside `money/actions.ts` as three private functions, and
 * that was right up to the moment a second caller needed the same numbers.
 * `getReport` (the Reports screen) and `get_money_report` (the assistant) now
 * both call these, so "how did I do since June" cannot give two answers
 * depending on who asked.
 *
 * WHAT THIS IS NOT. It is not yet the only category query in the app.
 * `get_spending_by_category` in lib/ai/tools.ts still runs its own, narrower
 * one -- it answers "which categories" alone, without the trend, the merchants
 * or the daily rate, and folding it in here would mean fetching four things to
 * answer one. The two DID once disagree by a day, which is the bug the long
 * note in lib/finance/period.ts describes; they no longer can, because both
 * now turn the inclusive date at their own boundary with `exclusiveEndFor` and
 * query `.lt`. That is a shared RULE rather than shared CODE, so it is worth
 * saying out loud: change the boundary convention and there are two call sites
 * to change, not one.
 *
 * It is a plain module, not a `"use server"` one, on purpose: everything here
 * takes the CALLER'S already-authenticated Supabase client, so nothing in this
 * file is an endpoint anyone can post to. `money/actions.ts` keeps `getReport`
 * as the one authenticated way in for the screen; `lib/ai/tools.ts` passes the
 * user's own client from the tool context. Row Level Security applies either
 * way, and `user_id` is still passed and filtered on regardless — defence in
 * depth, per SPEC Part B3.
 */

/** The Supabase client the caller is already holding, session and all. */
export type ReportClient = SupabaseClient;

export interface CategorySpend {
  categoryId: string;
  categoryName: string;
  totalCents: number;
}
// ---------------------------------------------------------------------------
// The query bodies, shared
// ---------------------------------------------------------------------------
//
// Each of these is the database work behind one panel, with the client, the
// user id and the ALREADY-RESOLVED date range handed in. They resolve no dates
// and read no clock: whoever calls them has already decided which days the
// report covers, so a month, a week and "since June" all arrive here as the
// same half-open [start, end) `PeriodRange` and are counted the same way.
//
// They are not endpoints. `getReport` in money/actions.ts stays the only
// authenticated way in for the screen — one login-protected call rather than a
// per-panel one nothing else uses — and the assistant's tools reach them with
// the user's own client from the tool context.
//
// The filters they share, and why:
//   currency = CAD          - one currency per chart, or the totals are fiction
//   transfer_group_id null  - moving your own money between accounts is not spend
//   categories.kind expense - a payday deposit is not "where the money went"
// plus user_id, which RLS also enforces - defence in depth, per SPEC Part B3.
//
// `failed` is returned rather than thrown so the caller can tell the screen
// (or the model) the difference between "nothing spent" and "couldn't load
// it" - see `error` on ReportSummary. An empty list means neither on its own.

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

export async function queryCategorySpend(
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
export async function querySpendTrend(
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

export async function queryTopMerchants(
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

/**
 * What came IN over the range, in cents — the other half of "how did I do".
 *
 * Same range, same currency, same not-a-transfer rule as the spending
 * queries; only the category kind flips. It is a separate function rather than
 * a second return value from `queryCategorySpend` because the Reports screen
 * doesn't show income and shouldn't pay for it, while the assistant's report
 * cannot answer "how did I do since June" without it.
 *
 * Cents in, cents out, integers throughout — no division happens here.
 */
export async function queryIncomeTotal(
  supabase: ReportClient,
  userId: string,
  range: PeriodRange
): Promise<{ totalCents: number; failed: boolean }> {
  const { rows, failed } = await fetchAllRows((from, to) =>
    supabase
      .from("transactions")
      .select("amount_cents, categories(kind)")
      .eq("user_id", userId)
      .eq("currency", "CAD")
      .is("transfer_group_id", null)
      .gte("txn_date", range.start)
      .lt("txn_date", range.end)
      .order("id", { ascending: true })
      .range(from, to)
  );
  if (failed) return { totalCents: 0, failed: true };

  let total = 0;
  for (const row of rows) {
    const kind = (row as unknown as { categories: { kind: string } | null }).categories?.kind;
    if (kind === "income") total += row.amount_cents as number;
  }
  return { totalCents: total, failed: false };
}
