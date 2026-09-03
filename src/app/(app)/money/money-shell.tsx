"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { PageHeader, HeaderFact } from "@/components/ui/page-header";
import { Stat, StatStrip } from "@/components/ui/stat";
import { formatCents } from "@/lib/finance/money";
import type {
  Account, Category, Debt, Receipt, RecurringTransaction, SavingsGoal, Transaction,
} from "@/lib/finance/types";
import type { BudgetWithProgress, MerchantMemory } from "./actions";
import type { GoalPlan } from "./goal-actions";
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
  initialRecurring,
  lastReconciled,
  goalPlans,
  defaultAccountId = null,
  autoOpenQuickLog = false,
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
  initialRecurring: RecurringTransaction[];
  lastReconciled: string | null;
  goalPlans: GoalPlan[];
  /**
   * The "Default account" money preference, already validated by the server
   * against the live account list. Null means first in the list.
   */
  defaultAccountId?: string | null;
  /** Set by the `?new=1` link the app-wide quick-add sends here. */
  autoOpenQuickLog?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [accounts, setAccounts] = useState(initialAccounts);
  const [transactions, setTransactions] = useState(initialTransactions);
  // router.refresh() hands this component fresh props, but useState keeps its
  // first value — so refreshed balances and rows never reached the screen and
  // the figures sat stale until a full reload. Adopt the server's data
  // whenever it re-arrives (the documented adjust-state-during-render
  // pattern; an effect would paint the stale frame first). Server data
  // re-arrives after a router.refresh() or any server action's revalidate —
  // in both cases it is post-commit truth, so adopting it never fights an
  // optimistic update (quick-log's echo lands only after its save returned).
  const [prevInitial, setPrevInitial] = useState({ initialAccounts, initialTransactions });
  if (
    prevInitial.initialAccounts !== initialAccounts ||
    prevInitial.initialTransactions !== initialTransactions
  ) {
    setPrevInitial({ initialAccounts, initialTransactions });
    setAccounts(initialAccounts);
    setTransactions(initialTransactions);
  }
  const [budgets, setBudgets] = useState(initialBudgets);
  const [goals, setGoals] = useState(initialGoals);
  const [debts, setDebts] = useState(initialDebts);
  const [receipts, setReceipts] = useState(initialReceipts);
  const [recurring, setRecurring] = useState(initialRecurring);
  // Arriving from the app-wide quick-add (`?new=1`) drops you straight into
  // the amount keypad rather than on the Money page with the form still to be
  // opened. Seeded as initial state rather than set from an effect — the value
  // is known at first render, so an effect would only cause a second one.
  const [showQuickLog, setShowQuickLog] = useState(autoOpenQuickLog);

  // The vitals strip. Recomputed from live client state rather than passed in
  // from the server, so logging an expense updates the headline figures
  // immediately instead of waiting for a refresh.
  const vitals = useMemo(() => {
    const budgetedCents = budgets.reduce((sum, b) => sum + b.amount_cents, 0);
    const spentCents = budgets.reduce((sum, b) => sum + b.spent_cents, 0);
    const overCount = budgets.filter((b) => b.spent_cents > b.amount_cents).length;
    const safeToSpendCents = budgetedCents - spentCents;

    // Net worth: assets minus what's owed. Credit cards and loans are stored
    // as debt accounts, so they subtract.
    //
    // CAD accounts only. This used to add every account's balance together
    // regardless of currency, so a ₹50,000 Indian balance counted as $50,000
    // Canadian — an account can be CAD or INR and nothing anywhere converted
    // between them. Non-CAD accounts are totalled separately below and shown
    // in their own currency rather than being quietly folded in or dropped.
    const cadAccounts = accounts.filter((a) => a.currency === "CAD");
    const otherAccounts = accounts.filter((a) => a.currency !== "CAD");
    const netCents = cadAccounts.reduce(
      (sum, a) => sum + (a.is_debt ? -a.current_balance_cents : a.current_balance_cents),
      0
    );
    const otherCurrency = otherAccounts[0]?.currency ?? null;
    const otherNetCents = otherAccounts.reduce(
      (sum, a) => sum + (a.is_debt ? -a.current_balance_cents : a.current_balance_cents),
      0
    );

    const goalSavedCents = goals.reduce((sum, g) => sum + g.saved_cents, 0);
    const goalTargetCents = goals.reduce((sum, g) => sum + g.target_cents, 0);

    return {
      budgetedCents, spentCents, overCount, safeToSpendCents, netCents,
      otherCurrency, otherNetCents,
      goalSavedCents, goalTargetCents,
      budgetProgress: budgetedCents > 0 ? spentCents / budgetedCents : 0,
    };
  }, [budgets, accounts, goals]);

  return (
    <div>
      <PageHeader
        eyebrow="Budgets, spending, goals"
        title="Money"
        meta={
          <>
            <HeaderFact>{accounts.length} accounts</HeaderFact>
            <HeaderFact>{budgets.length} budgets</HeaderFact>
            {vitals.overCount > 0 && (
              <HeaderFact tone="alert">
                {vitals.overCount} over
              </HeaderFact>
            )}
            {receipts.length > 0 && (
              <HeaderFact>{receipts.length} receipts to review</HeaderFact>
            )}
          </>
        }
        actions={
          <button
            type="button"
            onClick={() => setShowQuickLog(true)}
            aria-label="Log an expense"
            className="press-hard flex h-9 items-center gap-1.5 border-2 border-rule bg-primary px-3 text-xs font-bold tracking-[0.08em] text-primary-foreground uppercase"
          >
            <Plus className="size-4" strokeWidth={3} />
            Log
          </button>
        }
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        {/* The headline numbers, before any tab. Whichever tab you're on, the
            state of the month stays on screen — that's the difference between
            a set of tools and an instrument panel. */}
        <StatStrip columns={3}>
          <Stat
            label="Safe to spend"
            value={formatCents(vitals.safeToSpendCents)}
            tone={vitals.safeToSpendCents < 0 ? "alert" : "default"}
            sub="left this period"
            meter={Math.min(1, vitals.budgetProgress)}
          />
          <Stat
            label="Spent"
            value={formatCents(vitals.spentCents)}
            sub={`of ${formatCents(vitals.budgetedCents)}`}
          />
          <Stat
            label="Net"
            value={formatCents(vitals.netCents)}
            tone={vitals.netCents < 0 ? "alert" : "default"}
            sub={
              vitals.otherCurrency
                ? `+ ${formatCents(vitals.otherNetCents, vitals.otherCurrency)} in ${vitals.otherCurrency}`
                : "across all accounts"
            }
          />
        </StatStrip>

        <Segmented
          options={TABS.map((t) => ({ value: t.key, label: t.label }))}
          value={tab}
          onChange={setTab}
        />

        {tab === "overview" && (
          <OverviewView
            accounts={accounts}
            transactions={transactions}
            categories={categories}
            remittance={remittance}
            receipts={receipts}
            onAccountsChanged={setAccounts}
            onTransactionDeleted={(id) =>
              setTransactions((prev) => prev.filter((t) => t.id !== id))
            }
            onReceiptsChanged={setReceipts}
            onTransactionsAdded={(newTxns) =>
              setTransactions((prev) => [...newTxns, ...prev])
            }
            recurring={recurring}
            onRecurringChanged={setRecurring}
            lastReconciled={lastReconciled}
            defaultAccountId={defaultAccountId}
          />
        )}
        {tab === "budgets" && (
          <BudgetsView budgets={budgets} categories={categories} onChanged={setBudgets} />
        )}
        {tab === "goals" && (
          <GoalsView
            goals={goals}
            onChanged={setGoals}
            goalPlans={goalPlans}
            accounts={accounts}
            categories={categories}
            defaultAccountId={defaultAccountId}
          />
        )}
        {tab === "debts" && <DebtsView debts={debts} onChanged={setDebts} />}
        {tab === "reports" && <ReportsView />}
      </div>

      {showQuickLog && (
        <QuickLogForm
          accounts={accounts}
          categories={categories}
          recentMerchants={recentMerchants}
          initialAccountId={defaultAccountId}
          onClose={() => setShowQuickLog(false)}
          onLogged={(txn, updatedAccount) => {
            setTransactions((prev) => [txn, ...prev]);
            setAccounts((prev) =>
              prev.map((a) => (a.id === updatedAccount.id ? updatedAccount : a))
            );
            setShowQuickLog(false);
          }}
        />
      )}
    </div>
  );
}
