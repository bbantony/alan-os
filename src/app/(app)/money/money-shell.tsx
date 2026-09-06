"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import type { MonthEndCheck } from "./reconcile-actions";
import { QuickLogForm } from "./quick-log-form";
import { OverviewView } from "./overview-view";
import { BudgetsView } from "./budgets-view";
import { GoalsView } from "./goals-view";
import { DebtsView } from "./debts-view";
import { ReportsView } from "./reports-view";
import { DEFAULT_MONEY_TAB, MONEY_TABS, parseMoneyTab, type MoneyTab } from "./tabs";

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
  monthEndCheck,
  goalPlans,
  defaultAccountId = null,
  autoOpenQuickLog = false,
  initialTab = DEFAULT_MONEY_TAB,
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
  /**
   * "Is the month-end check due?", already decided on the server against the
   * profile's own timezone. Passed straight through to Overview, which renders
   * it — the decision is not the screen's to make. It carries the last
   * statement date with it, so there is one answer rather than a date in one
   * place and a judgement about it in another.
   */
  monthEndCheck: MonthEndCheck;
  goalPlans: GoalPlan[];
  /**
   * The "Default account" money preference, already validated by the server
   * against the live account list. Null means first in the list.
   */
  defaultAccountId?: string | null;
  /**
   * Set by `?new=1` on the /money address. Nothing in the app sends that any
   * more — the app-wide "+" is a capture sheet that logs an expense where you
   * stand — but a bookmark or a hand-typed link still works.
   */
  autoOpenQuickLog?: boolean;
  /** Which tab `?tab=` asked for, already validated by the server. */
  initialTab?: MoneyTab;
}) {
  // The tab lives in the address (`?tab=budgets`), not only in this component.
  // It used to be plain state, which meant Budgets could not be linked to,
  // a reload always dumped you back on Overview, and Back out of a receipt or
  // the reconcile screen returned you to the wrong tab.
  const [tab, setTab] = useState<MoneyTab>(initialTab);

  // THE ADDRESS BAR IS THE AUTHORITY HERE, NOT THE PROP.
  //
  // This used to adopt a changed `initialTab` prop, on the stated grounds that
  // "tapping a tab can't trip this: that writes the address with the History
  // API and never re-runs the server." That was wrong, and a wrong explanation
  // is worse than none. Next patches `window.history.pushState` into the App
  // Router, and every money action calls `revalidatePath("/money")` while
  // `overview-view` also calls `router.refresh()` — so this page refetches,
  // and a refetch issued while you were on Overview can land AFTER you have
  // tapped Reports, carrying `initialTab: "overview"`. The old guard would
  // then have yanked the screen back to Overview while the address bar still
  // said Reports. The window is not small: this page awaits
  // `postDueRecurringTransactions()` and then a dozen more reads.
  //
  // So the correction is driven by the LIVE URL instead. `useSearchParams`
  // follows both real navigations and History-API tab taps, and no stale
  // server payload can move it. A tap sets `tab` immediately, so the strip
  // never waits on the router, and the URL agrees a moment later — which makes
  // this block a no-op in that case. It only does real work when the address
  // itself changed: a link into /money?tab=goals, or Back.
  const searchParams = useSearchParams();
  const urlTab = parseMoneyTab(searchParams.get("tab"));
  const [prevUrlTab, setPrevUrlTab] = useState(urlTab);
  if (prevUrlTab !== urlTab) {
    setPrevUrlTab(urlTab);
    setTab(urlTab);
  }
  const [accounts, setAccounts] = useState(initialAccounts);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [budgets, setBudgets] = useState(initialBudgets);
  const [goals, setGoals] = useState(initialGoals);
  const [debts, setDebts] = useState(initialDebts);
  const [receipts, setReceipts] = useState(initialReceipts);
  const [recurring, setRecurring] = useState(initialRecurring);
  // router.refresh() hands this component fresh props, but useState keeps its
  // first value — so refreshed balances and rows never reached the screen and
  // the figures sat stale until a full reload. Adopt the server's data
  // whenever it re-arrives (the documented adjust-state-during-render
  // pattern; an effect would paint the stale frame first). Server data
  // re-arrives after a router.refresh() or any server action's revalidate —
  // in both cases it is post-commit truth, so adopting it never fights an
  // optimistic update (quick-log's echo lands only after its save returned).
  //
  // Receipts joined the list on 5 Sep 2026: approving one from the capture
  // sheet while standing on this screen files the transaction but left the
  // receipt sitting in the "to review" panel — and tapping it again opened a
  // receipt that no longer existed. It sits below its own useState rather than
  // above, because reading `setReceipts` before that line runs is a crash.
  //
  // Budgets, goals, debts and recurring are deliberately NOT here. Their
  // staleness predates this and fixing it is its own piece of work — they hold
  // computed progress that the views also update by hand, so adopting them
  // needs checking view by view rather than in passing.
  const [prevInitial, setPrevInitial] = useState({
    initialAccounts,
    initialTransactions,
    initialReceipts,
  });
  if (
    prevInitial.initialAccounts !== initialAccounts ||
    prevInitial.initialTransactions !== initialTransactions ||
    prevInitial.initialReceipts !== initialReceipts
  ) {
    setPrevInitial({ initialAccounts, initialTransactions, initialReceipts });
    setAccounts(initialAccounts);
    setTransactions(initialTransactions);
    setReceipts(initialReceipts);
  }
  // A `?new=1` address drops you straight into the amount keypad rather than
  // onto the Money page with the form still to be opened. (It was the app-wide
  // quick-add's link until that became a capture sheet with the keypad inside
  // it.) Seeded as initial state rather than set from an effect — the value is
  // known at first render, so an effect would only cause a second one.
  const [showQuickLog, setShowQuickLog] = useState(autoOpenQuickLog);

  /**
   * Tapping a tab writes it into the address bar — with the browser's own
   * history API, not the Next router.
   *
   * `router.push` would re-run this page on the server on every single tap,
   * and this page is expensive: accounts, categories, thirty transactions,
   * budgets with progress, goals, debts, merchant memory, remittances,
   * receipts, repeating rules, reconciliation history and goal plans. All five
   * tabs' data is already in this component; the tab strip is a client-side
   * switch and should cost nothing.
   *
   * PUSH, not replace. `assistant-chat.tsx` uses `replaceState` for the
   * opposite reason and says so in its own comment: it is scrubbing a spent
   * `?q=` out of the address so a refresh doesn't re-ask a paid question —
   * there is nothing there worth going Back to. Here each tab IS somewhere
   * you have been, so each tap earns a history entry and Back walks the tabs
   * in the order they were opened.
   *
   * Overview drops the parameter entirely rather than writing `?tab=overview`,
   * so the plain /money address keeps meaning what it already means. `?new=1`
   * is deliberately not carried along either: it has done its job by the time
   * a tab is tapped, and an address that still says "open the keypad" is one
   * that re-opens it for anyone who bookmarks or shares it from here. (It does
   * NOT re-open on the way Back — `showQuickLog` is seeded at mount only, and
   * popstate doesn't remount this component. An earlier version of this
   * comment gave that as the reason, which was simply untrue.)
   *
   * Tapping the tab you are already on does nothing. Before this wave the tabs
   * wrote no history at all, so there was nothing to stack; a draft written
   * during it pushed an entry on every tap, which meant three taps on Budgets
   * cost three presses of Back to leave. The guard is against that draft, not
   * against anything ever shipped.
   */
  function selectTab(next: MoneyTab) {
    if (next === tab) return;
    setTab(next);
    if (typeof window === "undefined") return;
    window.history.pushState(null, "", next === DEFAULT_MONEY_TAB ? "/money" : `/money?tab=${next}`);
  }

  // An address this app doesn't recognise — `?tab=nonsense`, or a bookmark
  // from before a tab was renamed — already renders Overview, because
  // `parseMoneyTab` sees to that on the server. This scrubs the bad parameter
  // out of the bar as well, so it stops being the thing that gets bookmarked
  // again or shared onward. Any other parameters are left exactly as they are,
  // and `replaceState` adds no history entry, so Back still goes where it was
  // already going.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("tab");
    if (raw === null || raw === parseMoneyTab(raw)) return;
    params.delete("tab");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/money?${query}` : "/money");
  }, []);

  // ...and Back/Forward move the strip, since those entries are ours. Without
  // this the address would say Budgets while the screen showed Overview.
  // `useSearchParams` above sees popstate too, so this is belt as well as
  // braces — kept because it is the one path that must never fail, and both
  // routes read the same parameter through the same parser, so they cannot
  // disagree.
  useEffect(() => {
    function handlePopState() {
      const fromUrl = new URLSearchParams(window.location.search).get("tab");
      setTab(parseMoneyTab(fromUrl));
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
          options={MONEY_TABS.map((t) => ({ value: t.key, label: t.label }))}
          value={tab}
          onChange={selectTab}
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
            monthEndCheck={monthEndCheck}
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
