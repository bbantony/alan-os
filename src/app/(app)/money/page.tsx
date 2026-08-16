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
import { MoneyShell } from "./money-shell";

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const [
    { new: isNew },
    accounts, categories, transactions, budgets, goals, debts, merchants, remittance, receipts,
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
      autoOpenQuickLog={isNew === "1"}
    />
  );
}
