/**
 * Money's five tabs, and how to read one out of the address bar.
 *
 * Deliberately NOT inside `money-shell.tsx`. That file is `"use client"`, and
 * every export of a client module becomes a client reference on the server —
 * so `money/page.tsx` could import this list from there but could never
 * actually call the validator. A plain module both sides can use keeps one
 * list of valid tabs instead of a copy in the page and a copy in the shell.
 */

export type MoneyTab = "overview" | "budgets" | "goals" | "debts" | "reports";

export const MONEY_TABS: { key: MoneyTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "budgets", label: "Budgets" },
  { key: "goals", label: "Goals" },
  { key: "debts", label: "Debts" },
  { key: "reports", label: "Reports" },
];

export const DEFAULT_MONEY_TAB: MoneyTab = "overview";

/**
 * `?tab=` -> a tab, or Overview for anything this app doesn't recognise.
 *
 * Anything can arrive here: a stale bookmark from before a tab was renamed, a
 * typo, a link shared from a future version. None of those should be an error
 * screen — Money opens on Overview and the address is simply ignored.
 */
export function parseMoneyTab(value: string | null | undefined): MoneyTab {
  const match = MONEY_TABS.find((t) => t.key === value);
  return match ? match.key : DEFAULT_MONEY_TAB;
}
