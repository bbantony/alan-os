import type { BudgetPeriod } from "./types";
import type { WeekStart } from "../preferences";
// Runtime imports are relative with an explicit .ts extension (not "@/lib/...")
// so node's test runner can load this file directly — the same convention
// lib/streaks.ts and lib/finance/reconcile.ts already follow.
import { addDaysToDateString, daysBetweenDateStrings } from "../time.ts";
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
  return { start, end, label: shortDay(start), longLabel: rangeLongLabel(start, lastDay) };
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
  return { start, end, label: shortDay(start), longLabel: rangeLongLabel(start, lastDay) };
}

/** "1 Sep" — a week's start day, short enough for a chart axis. */
function shortDay(dateStr: string): string {
  const [, month, day] = dateStr.split("-").map(Number);
  return `${day} ${MONTH_SHORT[month - 1]}`;
}

/**
 * "1–7 Sep 2026", "31 Aug – 6 Sep 2026", "29 Dec 2025 – 4 Jan 2026", "3 Jun 2026"
 * — the month and year are repeated only when the range actually crosses one,
 * so the common case stays short.
 *
 * BOTH ARGUMENTS ARE INCLUSIVE. `lastDay` is the last day the range contains,
 * never the exclusive `PeriodRange.end`: a label is read by a person, and a
 * person reading "1–8 Sep" for a week that stops at the 7th would be reading a
 * lie. Every caller does the `end - 1 day` step before getting here.
 *
 * This was `weekLongLabel` and did the first three cases only; weeks are never
 * one day long, so the single-day case is new and arrived with custom ranges.
 * It is shared rather than copied so a week, a custom range and a trend bucket
 * can never describe the same two dates differently.
 */
function rangeLongLabel(start: string, lastDay: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = lastDay.split("-").map(Number);
  if (sy !== ey) {
    return `${sd} ${MONTH_SHORT[sm - 1]} ${sy} – ${ed} ${MONTH_SHORT[em - 1]} ${ey}`;
  }
  if (sm !== em) {
    return `${sd} ${MONTH_SHORT[sm - 1]} – ${ed} ${MONTH_SHORT[em - 1]} ${ey}`;
  }
  if (sd !== ed) {
    return `${sd}–${ed} ${MONTH_SHORT[sm - 1]} ${sy}`;
  }
  return `${sd} ${MONTH_SHORT[sm - 1]} ${sy}`;
}

/**
 * The same two dates with no year — "1–30 Jun", "1 Jun – 15 Aug", "3 Jun".
 *
 * A chart axis has room for a few characters, and every bucket on one chart is
 * from the same era, so the year is the part that can go. It comes back in
 * `longLabel`, which is what the heading uses.
 */
function rangeShortLabel(start: string, lastDay: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = lastDay.split("-").map(Number);
  if (sy === ey && sm === em) {
    return sd === ed ? `${sd} ${MONTH_SHORT[sm - 1]}` : `${sd}–${ed} ${MONTH_SHORT[sm - 1]}`;
  }
  return `${sd} ${MONTH_SHORT[sm - 1]} – ${ed} ${MONTH_SHORT[em - 1]}`;
}

// ---------------------------------------------------------------------------
// Custom ranges, and the one rule about where a range ends
// ---------------------------------------------------------------------------
//
// THE CONVENTION, WHICH IS NOW THE WHOLE CODEBASE'S:
//
//   Inside the code, every range is HALF-OPEN — [start, end), `end` exclusive.
//   That is what `PeriodRange` has always meant and what every report query
//   does (`.gte(start).lt(end)`). It is the only way consecutive ranges join
//   up with no gap and no day counted twice.
//
//   At the edges — anything a PERSON says, a date picker returns, or the
//   assistant's model sends or is shown — dates are INCLUSIVE, because "to
//   June the 30th" includes the 30th. Every such date is converted the moment
//   it arrives, by `exclusiveEndFor` below, and converted back for display by
//   `inclusiveLastDay`. Nothing between those two points is ever inclusive.
//
// THE BUG THAT MADE THIS A WRITTEN RULE. `get_spending_by_category` in
// lib/ai/tools.ts filtered `.lte(to_date)` while the Reports screen filtered
// `.lt(range.end)` — so "what did I spend in August" had two different answers
// depending on which boundary date the model happened to send. Handed a
// person's dates (1–31 August) the two agreed. Handed the range-shaped
// "1 September" — which is exactly what `get_money_overview` used to hand the
// model back as an unlabelled `period_end` — the tool silently added the whole
// of 1 September to August's total. Run over four transactions sitting on the
// four boundary dates (31 Jul $10, 1 Aug $20, 31 Aug $40, 1 Sep $80), Reports
// said $60 and the tool said $140 for the same month. A money figure that
// depends on how the question was phrased is not a figure.
//
// So the tools now translate at their own boundary and query `.lt` like
// everything else, and no exclusive date is ever shown to the model.
// (lib/ledger.ts keeps an inclusive `from`/`to` on its public function and is
// consistent with this rule by a different route. Five of its six queries
// filter plain DATE columns -- `txn_date`, `workout_date`, `completed_date`,
// `purchased_on`, `statement_date` -- where `.lte(to)` IS the inclusive answer
// and no conversion is needed or wanted. The sixth, `completed_at`, is a
// timestamp, where "on or before the 31st" and "before the 1st" are genuinely
// different questions; that one converts, via `dayEndExclusive(to)` and `.lt`.
// The rule is "never show an exclusive date to a human or a model", not
// "always call exclusiveEndFor".)

/** A person's last-day-included date -> the exclusive end the queries want. */
export function exclusiveEndFor(lastDate: string): string {
  return addDaysToDateString(lastDate, 1);
}

/** An exclusive end -> the last day actually included, for a person to read. */
export function inclusiveLastDay(exclusiveEnd: string): string {
  return addDaysToDateString(exclusiveEnd, -1);
}

/** What a custom range is asked for as: two dates a person named, both included. */
export interface CustomPeriod {
  unit: "custom";
  /** Inclusive, YYYY-MM-DD — the first day to count. */
  start: string;
  /**
   * INCLUSIVE, YYYY-MM-DD — the last day to count.
   *
   * Called `lastDate` and not `end` deliberately. `PeriodRange.end` is
   * exclusive, and a neighbouring field called `end` that meant something else
   * is exactly the confusion this section exists to end. With a different
   * name, handing a `PeriodRange` straight to `getReport` is a compile error
   * rather than a report one day too long.
   */
  lastDate: string;
}

/** Everything `getReport` will answer: a month, a week, or two dates. */
export type ReportRequest = ReportPeriod | CustomPeriod;

/** Sanity bounds. Outside these a date is a typo, not a question. */
const EARLIEST_REPORTABLE_DATE = "2000-01-01";
const LATEST_REPORTABLE_DATE = "2100-01-01";

/**
 * The longest custom range: about five years.
 *
 * Not a performance limit — it is what keeps everything downstream bounded.
 * The trend buckets are derived from the span, so an unbounded span is an
 * unbounded loop building dates, and this is reachable from an authenticated
 * endpoint. Five years is far more than "since June" ever needs.
 */
export const MAX_CUSTOM_RANGE_DAYS = 1830;

/** A real calendar day written exactly as YYYY-MM-DD. "2026-02-30" is not one. */
function isRealDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && toDateString(parsed) === value;
}

/**
 * Why a custom range can't be reported on, in plain English — or null.
 *
 * Separate from `customRangeFor` so a caller can ANSWER rather than throw:
 * `getReport` puts the sentence in `error` and the assistant hands it back to
 * the model. What each bad input does, plainly:
 *
 *   - not a real date ("June", "2026-02-30", "26-06-01") -> refused, not
 *     guessed at. `addDaysToDateString` on a malformed string produces an
 *     Invalid Date, Postgres rejects what comes out of it, and that reaches
 *     Alan as a blank panel instead of a sentence.
 *   - outside 2000-2099 -> refused. A four-digit typo parses perfectly well
 *     and would otherwise scan a range no account can have data in.
 *   - end before start -> refused, NOT silently swapped. Reinterpreting a
 *     money question is worse than declining it.
 *   - longer than five years -> refused, with the span said out loud.
 *   - starting after today (when `today` is given) -> refused, the same way
 *     the month and week views refuse a future offset.
 *
 * A single day (start === lastDate) is a legitimate range of one day.
 */
export function customRangeProblem(
  startDate: string,
  lastDate: string,
  today?: string
): string | null {
  if (!isRealDate(startDate) || !isRealDate(lastDate)) {
    return "I need both dates as real days written YYYY-MM-DD, like 2026-06-01.";
  }
  if (startDate < EARLIEST_REPORTABLE_DATE || lastDate >= LATEST_REPORTABLE_DATE) {
    return "Those dates are outside the years this app can report on.";
  }
  if (lastDate < startDate) {
    return "That range ends before it starts.";
  }
  const days = daysBetweenDateStrings(startDate, lastDate) + 1; // both ends counted
  if (days > MAX_CUSTOM_RANGE_DAYS) {
    return `That's ${days} days. Reports cover about five years at a time — try a shorter range.`;
  }
  if (today && startDate > today) {
    return "That range hasn't started yet, so there's nothing to show.";
  }
  return null;
}

/**
 * The range between two dates a person named, both of them included.
 *
 * `lastDate` is INCLUSIVE and the `PeriodRange.end` that comes back is
 * EXCLUSIVE — this is one of the two places in the app where that translation
 * happens, which is the whole reason it exists rather than each caller doing
 * its own.
 *
 * Throws on input `customRangeProblem` rejects, with that same plain-English
 * sentence as the message. It cannot return a range for input it does not
 * accept, and there is no third behaviour to remember: callers that want to
 * answer rather than throw check `customRangeProblem` first, and both are
 * reading one list of rules.
 */
export function customRangeFor(startDate: string, lastDate: string): PeriodRange {
  const problem = customRangeProblem(startDate, lastDate);
  if (problem) throw new Error(problem);
  return {
    start: startDate,
    end: exclusiveEndFor(lastDate),
    label: rangeShortLabel(startDate, lastDate),
    longLabel: rangeLongLabel(startDate, lastDate),
  };
}

/**
 * Which bucket a custom range's trend chart should use, by how long it is.
 *
 * Ten weeks of bars is a chart; two hundred and sixty is a smear. Up to about
 * ten weeks gets weekly bars, anything longer gets months.
 */
export function trendUnitFor(range: PeriodRange): PeriodUnit {
  return daysBetweenDateStrings(range.start, range.end) > 70 ? "month" : "week";
}

/** Enough bars for five years of months; past this a chart is unreadable anyway. */
const MAX_TREND_BUCKETS = 64;

function bucketsOfUnit(
  range: PeriodRange,
  unit: PeriodUnit,
  weekStart: WeekStart
): PeriodRange[] | null {
  const buckets: PeriodRange[] = [];
  let cursor = range.start;
  while (cursor < range.end) {
    if (buckets.length >= MAX_TREND_BUCKETS) return null;
    const whole = unit === "week" ? weekRangeFor(cursor, 0, weekStart) : monthRangeFor(cursor, 0);
    // Clipped to the range at both ends: the first and last buckets are part
    // months (or part weeks), and a bar must not count days the report doesn't.
    const start = cursor;
    const end = whole.end < range.end ? whole.end : range.end;
    buckets.push({
      start,
      end,
      // A part-month is still that month on the axis; a part-week is labelled
      // by the day it actually starts, which is what `weekRangeFor` does too.
      label: unit === "month" ? whole.label : rangeShortLabel(start, start),
      longLabel: rangeLongLabel(start, inclusiveLastDay(end)),
    });
    cursor = whole.end; // always after `cursor`, so this terminates
  }
  return buckets;
}

/**
 * A custom range chopped into consecutive buckets — the bars of its trend chart.
 *
 * The buckets are contiguous and clipped to the range, so they sum to exactly
 * the range's own total: no gap, no day in two bars. `querySpendTrend` takes
 * these unchanged, which is why nothing about the report queries had to learn
 * that custom ranges exist.
 *
 * Too many bars is handled by CHANGING THE BUCKET, never by dropping bars off
 * the end: weeks fall back to months, and a range somehow too long even for
 * months comes back as one bar covering all of it. A truncated trend chart is
 * a wrong picture with nothing on screen saying so.
 */
export function bucketsWithin(
  range: PeriodRange,
  unit: PeriodUnit,
  weekStart: WeekStart = "monday"
): PeriodRange[] {
  return (
    bucketsOfUnit(range, unit, weekStart) ??
    (unit === "week" ? bucketsOfUnit(range, "month", weekStart) : null) ?? [range]
  );
}
