import { daysInMonth } from "./period.ts";
import type { RecurrenceFrequency } from "./types";

// Date maths for recurring money — rent, salary, subscriptions.
//
// WHY THIS ISN'T RRULE. The reminders and routines side of the app runs on
// real RRULEs (src/lib/reminders/rrule.ts) and it would be tempting to reuse
// them here. But `FREQ=MONTHLY;BYMONTHDAY=31` *skips* every month without a
// 31st, which is exactly right by the iCalendar spec and exactly wrong for
// money: rent due on the 31st must still come out in February. Budgets already
// made this call once (see period.ts, which clamps a payday anchor to the last
// day of a short month) and this follows it, so the two agree.
//
// Everything here is pure calendar arithmetic on YYYY-MM-DD strings. No
// timezone is involved and none should be: "the 1st of the month" is a
// calendar fact, not an instant.

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "Every month",
  yearly: "Every year",
};

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parse(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

/**
 * The `index`-th occurrence of a series (0 = the anchor itself).
 *
 * Monthly and yearly clamp the day to the length of the target month, so an
 * anchor on the 31st lands on the 28th/29th in February and returns to the
 * 31st in March — it does not drift to the 28th forever, because every
 * occurrence is computed from the anchor rather than from the one before it.
 */
export function occurrenceAt(
  frequency: RecurrenceFrequency,
  anchorDate: string,
  index: number
): string {
  const anchor = parse(anchorDate);

  if (frequency === "weekly" || frequency === "biweekly") {
    const step = frequency === "weekly" ? 7 : 14;
    const d = new Date(Date.UTC(anchor.year, anchor.month - 1, anchor.day));
    d.setUTCDate(d.getUTCDate() + step * index);
    return toIso(d);
  }

  const monthsForward = frequency === "monthly" ? index : index * 12;
  const totalMonths = anchor.month - 1 + monthsForward;
  const year = anchor.year + Math.floor(totalMonths / 12);
  // JavaScript's % keeps the sign of its left operand, so a negative index
  // would produce a negative month here. `index` is never negative in this
  // app, but the guard costs nothing and this is precisely the bug that broke
  // the Reports month navigator (see actions.ts monthRange).
  const month = ((totalMonths % 12) + 12) % 12 + 1;
  const day = Math.min(anchor.day, daysInMonth(year, month));
  return toIso(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * The first occurrence strictly after `afterDate`.
 *
 * The index is estimated arithmetically rather than found by counting from
 * the anchor, so a series anchored in 2019 doesn't cost 80 iterations — then
 * nudged, because month-length clamping can put an estimate one step out.
 */
export function nextOccurrenceAfter(
  frequency: RecurrenceFrequency,
  anchorDate: string,
  afterDate: string
): string {
  const anchor = parse(anchorDate);
  const after = parse(afterDate);

  let index: number;
  if (frequency === "weekly" || frequency === "biweekly") {
    const step = frequency === "weekly" ? 7 : 14;
    const anchorMs = Date.UTC(anchor.year, anchor.month - 1, anchor.day);
    const afterMs = Date.UTC(after.year, after.month - 1, after.day);
    index = Math.floor((afterMs - anchorMs) / (86400000 * step));
  } else {
    const monthsApart =
      (after.year - anchor.year) * 12 + (after.month - anchor.month);
    index = frequency === "monthly" ? monthsApart : Math.floor(monthsApart / 12);
  }

  index = Math.max(0, index - 1);
  // At most a handful of steps: the estimate is never more than one or two out.
  for (let i = index; i < index + 8; i++) {
    const candidate = occurrenceAt(frequency, anchorDate, i);
    if (candidate > afterDate) return candidate;
  }
  return occurrenceAt(frequency, anchorDate, index + 8);
}

/**
 * The first occurrence on or after `fromDate` — what a brand-new series starts
 * from, so that setting up "rent, monthly, the 1st" on the 15th doesn't
 * immediately post a payment for the 1st that already went out.
 */
export function firstOccurrenceOnOrAfter(
  frequency: RecurrenceFrequency,
  anchorDate: string,
  fromDate: string
): string {
  if (anchorDate >= fromDate) return anchorDate;
  // "on or after today" is "after yesterday" — one helper instead of two.
  const { year, month, day } = parse(fromDate);
  const yesterday = new Date(Date.UTC(year, month - 1, day));
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return nextOccurrenceAfter(frequency, anchorDate, toIso(yesterday));
}

/**
 * Every occurrence due on or before `today` that hasn't been posted yet,
 * oldest first — the catch-up list after the app hasn't been opened for a
 * while. Capped so a series anchored years ago with a stale `next_date` can't
 * post hundreds of rows in one go.
 */
export function dueOccurrences(
  frequency: RecurrenceFrequency,
  anchorDate: string,
  nextDate: string,
  today: string,
  endDate: string | null,
  maxCatchUp = 24
): string[] {
  const due: string[] = [];
  let cursor = nextDate;
  while (cursor <= today && due.length < maxCatchUp) {
    if (endDate && cursor > endDate) break;
    due.push(cursor);
    cursor = nextOccurrenceAfter(frequency, anchorDate, cursor);
  }
  return due;
}
