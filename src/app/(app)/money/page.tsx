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
import { getReconciliationHistory } from "./reconcile-actions";
import { MoneyShell } from "./money-shell";

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  // Anything repeating that has come due posts itself here, BEFORE the reads
  // below — so the balances, budgets and transaction list on this page already
  // include this month's rent rather than showing a snapshot from before it.
  // See postDueRecurringTransactions for why this runs on open rather than on
  // a cron, and how it stays safe against two page loads racing.
  await postDueRecurringTransactions();

  const [
    { new: isNew },
    accounts, categories, transactions, budgets, goals, debts, merchants, remittance, receipts, recurring,
    reconciliations,
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
      getReconciliationHistory(1),
    ]);

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
      lastReconciled={reconciliations[0]?.statement_date ?? null}
      autoOpenQuickLog={isNew === "1"}
    />
  );
}
