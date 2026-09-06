import type { BudgetPeriod } from "./types";
import type { WeekStart } from "../preferences";
// Runtime imports are relative with an explicit .ts extension (not "@/lib/...")
// so node's test runner can load this file directly — the same convention
// lib/streaks.ts and lib/finance/reconcile.ts already follow.
import { addDaysToDateString } from "../time.ts";
import { startOfWeek } from "../streaks.ts";

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

// ---------------------------------------------------------------------------
// Report periods — the month or the week a report is looking at
// ---------------------------------------------------------------------------
//
// Reports only ever spoke in calendar months, so "what did I spend this week?"
// had no answer anywhere in the app. These are the pure range/label maths
// behind both units, living here rather than inside the server action so they
// can be tested without a database (see tests/money-and-units.test.mts).
//
// EVERYTHING IS A YYYY-MM-DD STRING IN THE APP TIMEZONE. `today` is passed in
// by the caller, which gets it from `todayInAppTimezone()` — never from a
// browser clock. All arithmetic below is done at UTC midnight on those
// strings, so a daylight-saving change inside a week cannot shorten or
// lengthen it: a week is always exactly seven calendar dates.

export type PeriodUnit = "month" | "week";

/** Which slice of time a report is showing. `offset` is 0 = current, -1 = previous. */
export interface ReportPeriod {
  unit: PeriodUnit;
  offset: number;
}

export interface PeriodRange {
  /** Inclusive, YYYY-MM-DD. */
  start: string;
  /** Exclusive, YYYY-MM-DD. */
  end: string;
  /** Short form for a chart axis: "Sep" for a month, "1 Sep" for a week. */
  label: string;
  /** Full form for the period navigator: "September 2026", "1–7 Sep 2026". */
  longLabel: string;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The month `offset` months from the month containing `today`.
 *
 * THE BUG THIS PRESERVES A FIX FOR. An earlier version normalised with
 * `((month - 1) % 12) + 1`, and JavaScript's `%` keeps the sign of its left
 * operand — so any offset crossing back over a year boundary produced a
 * negative month number and dates like "2025-00-01". Postgres rejects those
 * outright, the query's error was discarded by `const { data } =`, and the
 * screen showed $0 spent rather than a failure. Date.UTC normalises correctly
 * for any offset in either direction, so the arithmetic is handed to it.
 */
export function monthRangeFor(today: string, offset: number): PeriodRange {
  const [year, month] = today.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, month - 1 + offset, 1));
  const endDate = new Date(Date.UTC(year, month + offset, 1));
  return {
    start: toDateString(startDate),
    end: toDateString(endDate),
    label: MONTH_SHORT[startDate.getUTCMonth()],
    longLabel: `${MONTH_LONG[startDate.getUTCMonth()]} ${startDate.getUTCFullYear()}`,
  };
}

/**
 * The week `offset` weeks from the week containing `today`.
 *
 * When a week begins is a PREFERENCE (`weekStart` in lib/preferences.ts), not
 * a constant — and `startOfWeek` in lib/streaks.ts is already the one place
 * that answers it, so this reuses it rather than writing a second definition
 * of Monday. Note what this is NOT: the audit finding about that preference
 * names the two workout screens, and both still ignore it. This closes no part
 * of that — it adds a second place in the app that honours the setting, the
 * first being the AI's insights.
 */
export function weekRangeFor(today: string, offset: number, weekStart: WeekStart = "monday"): PeriodRange {
  const start = addDaysToDateString(startOfWeek(today, weekStart), offset * 7);
  const end = addDaysToDateString(start, 7);
  const lastDay = addDaysToDateString(start, 6); // `end` is exclusive; humans read the inclusive day.
  return { start, end, label: shortDay(start), longLabel: weekLongLabel(start, lastDay) };
}

/** Whichever of the two the period asks for. */
export function periodRangeFor(today: string, period: ReportPeriod, weekStart: WeekStart = "monday"): PeriodRange {
  return period.unit === "week"
    ? weekRangeFor(today, period.offset, weekStart)
    : monthRangeFor(today, period.offset);
}

/**
 * The `count` consecutive ranges ENDING at `period` (oldest first) — the
 * buckets behind the trend chart.
 *
 * A week view compares against the last several *weeks*, not months, which is
 * why the labels come back attached to the data: the screen cannot infer them
 * from a month-name table without lying about what it is showing.
 */
export function trendRangesFor(
  today: string,
  period: ReportPeriod,
  count: number,
  weekStart: WeekStart = "monday"
): PeriodRange[] {
  const ranges: PeriodRange[] = [];
  for (let i = count - 1; i >= 0; i--) {
    ranges.push(periodRangeFor(today, { unit: period.unit, offset: period.offset - i }, weekStart));
  }
  return ranges;
}

/**
 * The range `by` periods away from a range you ALREADY HAVE.
 *
 * Every other function here needs to know what day it is. This one doesn't:
 * it is anchored on a range the server already worked out and returned, so it
 * involves no clock of any kind and is safe to call in the browser.
 *
 * That is the entire point of it. When the Reports screen loses its
 * connection mid-tap, the period navigator still has to say which period the
 * arrows took you to — and it must not do that by reading the device clock,
 * which is the browser-timezone bug this whole module exists to avoid. With
 * nothing loaded yet, or after switching between months and weeks, there is
 * no anchor to shift and the screen says so instead of guessing.
 *
 * Weeks shift by seven days from the known start rather than being recomputed
 * through `startOfWeek`, so the user's week-start preference is carried along
 * implicitly and never has to be guessed at on the client.
 */
export function shiftPeriodRange(range: PeriodRange, unit: PeriodUnit, by: number): PeriodRange {
  // `range.start` is the 1st of its month, so it works as the anchor date.
  if (unit === "month") return monthRangeFor(range.start, by);
  const start = addDaysToDateString(range.start, by * 7);
  const end = addDaysToDateString(start, 7);
  const lastDay = addDaysToDateString(start, 6);
  return { start, end, label: shortDay(start), longLabel: weekLongLabel(start, lastDay) };
}

/** "1 Sep" — a week's start day, short enough for a chart axis. */
function shortDay(dateStr: string): string {
  const [, month, day] = dateStr.split("-").map(Number);
  return `${day} ${MONTH_SHORT[month - 1]}`;
}

// "1–7 Sep 2026", "31 Aug – 6 Sep 2026", "29 Dec 2025 – 4 Jan 2026" — the
// month and year are repeated only when the week actually crosses one, so the
// common case stays short.
function weekLongLabel(start: string, lastDay: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = lastDay.split("-").map(Number);
  if (sy !== ey) {
    return `${sd} ${MONTH_SHORT[sm - 1]} ${sy} – ${ed} ${MONTH_SHORT[em - 1]} ${ey}`;
  }
  if (sm !== em) {
    return `${sd} ${MONTH_SHORT[sm - 1]} – ${ed} ${MONTH_SHORT[em - 1]} ${ey}`;
  }
  return `${sd}–${ed} ${MONTH_SHORT[sm - 1]} ${sy}`;
}
