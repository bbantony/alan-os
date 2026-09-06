import {
  getAccounts,
  getBudgets,
  getCategories,
  getDebts,
  getRecentMerchants,
  getRecentTransactions,
  getRemittanceSummary,
  getSavingsGoals,
} from "./actions";
import { getPendingReceipts } from "./receipt-actions";
import { getRecurringTransactions, postDueRecurringTransactions } from "./recurring-actions";
import { getMonthEndCheckStatus } from "./reconcile-actions";
import { getGoalPlans } from "./goal-actions";
import { getPreferences } from "@/app/(app)/settings/preferences-actions";
import { MoneyShell } from "./money-shell";
import { parseMoneyTab } from "./tabs";

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; tab?: string }>;
}) {
  // Anything repeating that has come due posts itself here, BEFORE the reads
  // below — so the balances, budgets and transaction list on this page already
  // include this month's rent rather than showing a snapshot from before it.
  // See postDueRecurringTransactions for why this runs on open rather than on
  // a cron, and how it stays safe against two page loads racing.
  await postDueRecurringTransactions();

  const [
    { new: isNew, tab },
    accounts, categories, transactions, budgets, goals, debts, merchants, remittance, receipts, recurring,
    monthEndCheck,
    goalPlans,
    preferences,
  ] = await Promise.all([
      searchParams,
      getAccounts(),
      getCategories(),
      getRecentTransactions(30),
      getBudgets(),
      getSavingsGoals(),
      getDebts(),
      getRecentMerchants(),
      getRemittanceSummary(),
      getPendingReceipts(),
      getRecurringTransactions(),
      // "Is the month-end check due?" is decided HERE, not on the screen. It
      // depends on today's date in the profile's own timezone and on when the
      // books began, neither of which a client component can know honestly —
      // its `new Date()` is the phone's clock, which near midnight on the 1st
      // is a different day. The screen renders the answer; it doesn't work it
      // out. This also replaces the separate `getReconciliationHistory(1)`
      // read that used to fetch the same last-statement date on its own.
      getMonthEndCheckStatus(),
      getGoalPlans(),
      getPreferences(),
    ]);

  // The "Default account" setting (Settings → Money). Validated against the
  // accounts that actually exist, so a preference pointing at a deleted
  // account falls back to the old behaviour (first in the list) rather than
  // seeding the form with an id that matches nothing.
  const defaultAccountId =
    preferences.defaultAccountId && accounts.some((a) => a.id === preferences.defaultAccountId)
      ? preferences.defaultAccountId
      : null;

  return (
    <MoneyShell
      initialAccounts={accounts}
      categories={categories}
      initialTransactions={transactions}
      initialBudgets={budgets}
      initialGoals={goals}
      initialDebts={debts}
      recentMerchants={merchants}
      remittance={remittance}
      initialReceipts={receipts}
      initialRecurring={recurring}
      monthEndCheck={monthEndCheck}
      goalPlans={goalPlans}
      defaultAccountId={defaultAccountId}
      autoOpenQuickLog={isNew === "1"}
      // Which of the five tabs to open on, straight out of the address —
      // so /money?tab=budgets can be linked to, bookmarked and shared, and
      // the Back button returns to the tab you were looking at. Validated
      // here rather than in the browser: an unknown ?tab= falls back to
      // Overview instead of rendering nothing at all.
      initialTab={parseMoneyTab(tab)}
    />
  );
}
