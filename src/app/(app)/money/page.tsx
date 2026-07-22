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
import { MoneyShell } from "./money-shell";

export default async function MoneyPage() {
  const [accounts, categories, transactions, budgets, goals, debts, merchants, remittance] = await Promise.all([
    getAccounts(),
    getCategories(),
    getRecentTransactions(30),
    getBudgets(),
    getSavingsGoals(),
    getDebts(),
    getRecentMerchants(),
    getRemittanceSummary(),
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
    />
  );
}
