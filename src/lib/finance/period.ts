import type { BudgetPeriod } from "./types";

/**
 * Days in a given month, 1-indexed month, UTC.
 *
 * Exported because `recurring.ts` had a byte-identical private copy. Both use
 * it for the same job — clamping an anchor day to a short month, so a rule
 * anchored to the 31st still lands on the 30th in April and the 28th in
 * February — and two copies of that is two chances to fix it in only one place.
 */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface PeriodBounds {
  start: string; // inclusive, YYYY-MM-DD
  end: string; // exclusive, YYYY-MM-DD
}

// The budget period containing `today`, anchored to `anchorDate` (payday) —
// weekly/biweekly repeat every 7/14 days from the anchor; monthly repeats on
// the anchor's day-of-month each month (clamped to the last day of shorter
// months, e.g. an anchor of the 31st runs Feb 28/29 -> Mar 31).
export function currentPeriodBounds(period: BudgetPeriod, anchorDate: string, today: string): PeriodBounds {
  if (period === "monthly") {
    const anchorDay = Number(anchorDate.slice(8, 10));
    const [ty, tm, td] = today.split("-").map(Number);

    // Compared against the anchor CLAMPED TO THIS MONTH, not the raw anchor.
    // With a raw 31 and today 28 Feb, `28 < 31` sent the period start back to
    // 31 Jan and made the end 28 Feb — and `end` is exclusive, so 28 February
    // fell outside its own current period. Everything spent that day was
    // invisible to budgets and to safe-to-spend, then reappeared on 1 March.
    const anchorThisMonth = Math.min(anchorDay, daysInMonth(ty, tm));

    let startYear = ty;
    let startMonth = tm;
    if (td < anchorThisMonth) {
      startMonth -= 1;
      if (startMonth === 0) {
        startMonth = 12;
        startYear -= 1;
      }
    }

    let endYear = startYear;
    let endMonth = startMonth + 1;
    if (endMonth === 13) {
      endMonth = 1;
      endYear += 1;
    }

    const start = new Date(Date.UTC(startYear, startMonth - 1, Math.min(anchorDay, daysInMonth(startYear, startMonth))));
    const end = new Date(Date.UTC(endYear, endMonth - 1, Math.min(anchorDay, daysInMonth(endYear, endMonth))));
    return { start: toDateString(start), end: toDateString(end) };
  }

  const intervalDays = period === "weekly" ? 7 : 14;
  const anchor = new Date(`${anchorDate}T00:00:00Z`);
  const todayDate = new Date(`${today}T00:00:00Z`);
  const diffDays = Math.floor((todayDate.getTime() - anchor.getTime()) / 86400000);
  const periodsElapsed = Math.floor(diffDays / intervalDays);
  const start = new Date(anchor.getTime() + periodsElapsed * intervalDays * 86400000);
  const end = new Date(start.getTime() + intervalDays * 86400000);
  return { start: toDateString(start), end: toDateString(end) };
}
