"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Account, Category, Debt, Receipt, SavingsGoal, Transaction } from "@/lib/finance/types";
import type { BudgetWithProgress, MerchantMemory } from "./actions";
import { QuickLogForm } from "./quick-log-form";
import { OverviewView } from "./overview-view";
import { BudgetsView } from "./budgets-view";
import { GoalsView } from "./goals-view";
import { DebtsView } from "./debts-view";
import { ReportsView } from "./reports-view";

type Tab = "overview" | "budgets" | "goals" | "debts" | "reports";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "budgets", label: "Budgets" },
  { key: "goals", label: "Goals" },
  { key: "debts", label: "Debts" },
  { key: "reports", label: "Reports" },
];

export function MoneyShell({
  initialAccounts,
  categories,
  initialTransactions,
  initialBudgets,
  initialGoals,
  initialDebts,
  recentMerchants,
  remittance,
  initialReceipts,
}: {
  initialAccounts: Account[];
  categories: Category[];
  initialTransactions: Transaction[];
  initialBudgets: BudgetWithProgress[];
  initialGoals: SavingsGoal[];
  initialDebts: Debt[];
  recentMerchants: MerchantMemory[];
  remittance: { cadTotalCents: number; inrTotalCents: number };
  initialReceipts: Receipt[];
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [accounts, setAccounts] = useState(initialAccounts);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [budgets, setBudgets] = useState(initialBudgets);
  const [goals, setGoals] = useState(initialGoals);
  const [debts, setDebts] = useState(initialDebts);
  const [receipts, setReceipts] = useState(initialReceipts);
  const [showQuickLog, setShowQuickLog] = useState(false);

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-24">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Money</h1>
        <Button type="button" size="sm" className="gap-1.5" onClick={() => setShowQuickLog(true)}>
          <Plus className="size-4" />
          Log
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-5 gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "tap-press rounded-lg border px-1 py-2 text-[11px] font-medium",
              tab === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewView
          accounts={accounts}
          transactions={transactions}
          categories={categories}
          remittance={remittance}
          receipts={receipts}
          onAccountsChanged={setAccounts}
          onTransactionDeleted={(id) => setTransactions((prev) => prev.filter((t) => t.id !== id))}
          onReceiptsChanged={setReceipts}
          onTransactionsAdded={(newTxns) => setTransactions((prev) => [...newTxns, ...prev])}
        />
      )}
      {tab === "budgets" && <BudgetsView budgets={budgets} categories={categories} onChanged={setBudgets} />}
      {tab === "goals" && <GoalsView goals={goals} onChanged={setGoals} />}
      {tab === "debts" && <DebtsView debts={debts} onChanged={setDebts} />}
      {tab === "reports" && <ReportsView />}

      {showQuickLog && (
        <QuickLogForm
          accounts={accounts}
          categories={categories}
          recentMerchants={recentMerchants}
          onClose={() => setShowQuickLog(false)}
          onLogged={(txn, updatedAccount) => {
            setTransactions((prev) => [txn, ...prev]);
            setAccounts((prev) => prev.map((a) => (a.id === updatedAccount.id ? updatedAccount : a)));
            setShowQuickLog(false);
          }}
        />
      )}
    </div>
  );
}
