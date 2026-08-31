"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolvePreferences } from "@/lib/preferences";
import { todayInAppTimezone } from "@/lib/time";
import { balanceDeltaCents } from "@/lib/finance/balance";
import { friendlyDbError } from "@/lib/db-errors";
import {
  dueOccurrences,
  firstOccurrenceOnOrAfter,
  nextOccurrenceAfter,
} from "@/lib/finance/recurring";
import type {
  AccountType,
  RecurrenceFrequency,
  RecurringTransaction,
} from "@/lib/finance/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function getRecurringTransactions(): Promise<RecurringTransaction[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("recurring_transactions")
    .select("*")
    .eq("user_id", user.id)
    .order("next_date", { ascending: true });
  return (data as RecurringTransaction[]) ?? [];
}

export async function createRecurringTransaction(input: {
  accountId: string;
  categoryId: string;
  name: string;
  amountCents: number;
  merchant: string | null;
  note: string | null;
  frequency: RecurrenceFrequency;
  anchorDate: string;
  endDate: string | null;
  autoPost: boolean;
}): Promise<{ recurring?: RecurringTransaction; error?: string }> {
  const { supabase, user } = await requireUser();
  if (input.amountCents <= 0) return { error: "Enter an amount." };

  const { data: account } = await supabase
    .from("accounts")
    .select("id, currency")
    .eq("id", input.accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) return { error: "Couldn't find that account." };

  // Starts from the first occurrence that hasn't happened yet. Setting up
  // "rent, monthly, the 1st" on the 15th must not immediately post a payment
  // for the 1st, which already went out of the real bank account.
  const today = todayInAppTimezone();
  const nextDate = firstOccurrenceOnOrAfter(input.frequency, input.anchorDate, today);

  const { data, error } = await supabase
    .from("recurring_transactions")
    .insert({
      user_id: user.id,
      account_id: input.accountId,
      category_id: input.categoryId,
      name: input.name.trim(),
      amount_cents: input.amountCents,
      currency: account.currency,
      merchant: input.merchant,
      note: input.note,
      frequency: input.frequency,
      anchor_date: input.anchorDate,
      next_date: nextDate,
      end_date: input.endDate,
      auto_post: input.autoPost,
    })
    .select("*")
    .single();
  if (error || !data) return { error: friendlyDbError(error) ?? "Could not save that." };

  revalidatePath("/money");
  revalidatePath("/today");
  return { recurring: data as RecurringTransaction };
}

export async function setRecurringActive(input: {
  id: string;
  active: boolean;
}): Promise<{ recurring?: RecurringTransaction; error?: string }> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("recurring_transactions")
    .update({ active: input.active, updated_at: new Date().toISOString() })
    .eq("id", input.id)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error || !data) return { error: friendlyDbError(error) ?? "Could not update that." };
  revalidatePath("/money");
  return { recurring: data as RecurringTransaction };
}

export async function deleteRecurringTransaction(input: { id: string }) {
  const { supabase, user } = await requireUser();
  // The transactions it already posted stay. That money really did leave the
  // account — hence ON DELETE SET NULL on transactions.recurring_id, the
  // opposite call from reminders (0022), for the opposite reason.
  await supabase.from("recurring_transactions").delete().eq("id", input.id).eq("user_id", user.id);
  revalidatePath("/money");
  revalidatePath("/today");
}

export interface PostedSummary {
  posted: number;
  totalExpenseCents: number;
  totalIncomeCents: number;
}

/**
 * Posts every recurring transaction that has come due, catching up on any
 * missed while the app wasn't opened, and returns what it did.
 *
 * WHERE THIS RUNS. On page load, from Money and from the Today dashboard's
 * finance summary — not from a cron. Two reasons that's the right call and not
 * just the easy one:
 *
 *   - A cron would have to reach across every user's rows with no session,
 *     which in this codebase means another security-definer RPC taking the
 *     cron secret (see 0012). That's real machinery to maintain for a job
 *     whose result nobody can see until they open the app anyway.
 *   - Posting on open is *correct whenever it's observed*. Rent that came due
 *     on Tuesday is dated Tuesday whether the sweep ran Tuesday or Friday,
 *     because each occurrence posts under its own date.
 *
 * IDEMPOTENCE. Each occurrence is claimed before it is inserted: the update
 * moving `next_date` forward is conditional on `next_date` still being the
 * value this call read. Two concurrent page loads therefore cannot both post
 * the same rent — the second one's claim matches no row and it stops.
 */
export async function postDueRecurringTransactions(): Promise<PostedSummary> {
  const { supabase, user } = await requireUser();
  const summary: PostedSummary = { posted: 0, totalExpenseCents: 0, totalIncomeCents: 0 };

  // Settings → Money can turn automatic posting off, in which case repeating
  // items still show as upcoming but wait to be added by hand.
  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences, timezone")
    .eq("id", user.id)
    .maybeSingle();
  const prefs = resolvePreferences(profile?.preferences);
  if (!prefs.recurringAutoPost) return summary;

  const today = todayInAppTimezone((profile?.timezone as string) || undefined);

  const { data: dueRows } = await supabase
    .from("recurring_transactions")
    .select("*")
    .eq("user_id", user.id)
    .eq("active", true)
    .eq("auto_post", true)
    .lte("next_date", today);

  const due = (dueRows as RecurringTransaction[]) ?? [];
  if (due.length === 0) return summary;

  const [{ data: accounts }, { data: categories }] = await Promise.all([
    supabase.from("accounts").select("id, type, current_balance_cents").eq("user_id", user.id),
    supabase.from("categories").select("id, kind").eq("user_id", user.id),
  ]);
  const accountById = new Map(
    ((accounts as { id: string; type: string; current_balance_cents: number }[]) ?? []).map((a) => [a.id, a])
  );
  const kindById = new Map(
    ((categories as { id: string; kind: string }[]) ?? []).map((c) => [c.id, c.kind])
  );

  for (const rule of due) {
    const occurrences = dueOccurrences(
      rule.frequency,
      rule.anchor_date,
      rule.next_date,
      today,
      rule.end_date
    );
    if (occurrences.length === 0) continue;

    const lastOccurrence = occurrences[occurrences.length - 1];
    const newNextDate = nextOccurrenceAfter(rule.frequency, rule.anchor_date, lastOccurrence);

    // Claim first. If another render already advanced this row, the `eq` on
    // the old next_date matches nothing and we skip rather than double-post.
    const { data: claimed } = await supabase
      .from("recurring_transactions")
      .update({
        next_date: newNextDate,
        last_posted_date: lastOccurrence,
        // A fixed-term series switches itself off once it runs past its end.
        active: rule.end_date ? newNextDate <= rule.end_date : true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rule.id)
      .eq("user_id", user.id)
      .eq("next_date", rule.next_date)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    const isIncome = kindById.get(rule.category_id) === "income";
    const rows = occurrences.map((date) => ({
      user_id: user.id,
      account_id: rule.account_id,
      category_id: rule.category_id,
      amount_cents: rule.amount_cents,
      currency: rule.currency,
      merchant: rule.merchant,
      note: rule.note,
      txn_date: date,
      source: "recurring",
      recurring_id: rule.id,
    }));
    const { error: insertError } = await supabase.from("transactions").insert(rows);
    if (insertError) {
      // PUT THE CLAIM BACK. This used to be a bare `continue`, which left the
      // row marked as posted with no transaction behind it — and because
      // `next_date` had already moved on, no later sweep would ever retry it.
      // That month's rent simply vanished from the ledger and the balance,
      // permanently and silently. Restoring the pre-claim values makes the
      // next sweep pick it up again.
      await supabase
        .from("recurring_transactions")
        .update({
          next_date: rule.next_date,
          last_posted_date: rule.last_posted_date,
          active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rule.id)
        .eq("user_id", user.id);
      continue;
    }

    const account = accountById.get(rule.account_id);
    if (account) {
      // Atomic, for the same reason as everywhere else — this runs on both the
      // Money page and the Today page, so two loads really can race.
      const delta =
        balanceDeltaCents(rule.amount_cents, isIncome, account.type as AccountType) *
        occurrences.length;
      const { data: updated, error: balanceError } = await supabase.rpc(
        "adjust_account_balance",
        { p_account_id: account.id, p_delta_cents: delta }
      );
      if (balanceError || updated === null || updated === undefined) {
        // This runs unattended on page load, so there is nobody to tell — but
        // a transaction posted without its balance moving is a real
        // divergence, and it must not vanish silently.
        console.error(
          `[recurring] posted ${rule.name} but the balance did not move on account ` +
            `${account.id}: ${balanceError?.message ?? "no row returned"}`
        );
      } else {
        account.current_balance_cents = Number(updated);
      }
    }

    summary.posted += occurrences.length;
    if (isIncome) summary.totalIncomeCents += rule.amount_cents * occurrences.length;
    else summary.totalExpenseCents += rule.amount_cents * occurrences.length;
  }

  // Deliberately no revalidatePath here, unlike every other write in this
  // file: this one is called during a server render, and Next's cache
  // invalidation APIs are not render-safe. It doesn't need one anyway —
  // callers post *before* they read, so the page's own queries already see
  // everything this posted.
  return summary;
}

// ---------------------------------------------------------------------------
// What's about to land
// ---------------------------------------------------------------------------

export interface UpcomingBill {
  id: string;
  name: string;
  amountCents: number;
  currency: "CAD" | "INR";
  dueDate: string;
  daysAway: number;
  isIncome: boolean;
}

/**
 * Repeating payments due in the next `days`.
 *
 * The point is the gap between the app knowing and you knowing. It has always
 * known rent is due on the 1st; the first you'd hear of it was the transaction
 * appearing afterwards, with safe-to-spend already lower.
 *
 * Income is included and marked, because "£2,400 lands on Friday" is exactly as
 * useful as "rent goes on Tuesday" when you're deciding whether to buy
 * something today.
 */
export async function getUpcomingBills(days = 7): Promise<UpcomingBill[]> {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  const today = todayInAppTimezone((profile?.timezone as string) || undefined);

  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + days);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("recurring_transactions")
    .select("id, name, amount_cents, currency, next_date, category_id, categories(kind)")
    .eq("user_id", user.id)
    .eq("active", true)
    // A fixed-term series stays `active` until a posting sweep switches it
    // off — and that sweep never runs when auto_post is false. So "About to
    // land" kept promising payments that had already ended, and
    // upcoming-bills.tsx kept subtracting them from safe-to-spend.
    .or(`end_date.is.null,end_date.gte.${today}`)
    .gte("next_date", today)
    .lte("next_date", horizonIso)
    .order("next_date", { ascending: true });

  return ((data as unknown as {
    id: string;
    name: string;
    amount_cents: number;
    currency: "CAD" | "INR";
    next_date: string;
    categories: { kind: string } | null;
  }[]) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    amountCents: r.amount_cents,
    currency: r.currency,
    dueDate: r.next_date,
    daysAway: Math.round(
      (new Date(`${r.next_date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
        86400000
    ),
    isIncome: r.categories?.kind === "income",
  }));
}
