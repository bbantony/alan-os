import { test } from "node:test";
import assert from "node:assert/strict";

import { computeStreak, computeDueStreak } from "../src/lib/streaks.ts";
import { isDueOnDate, nextOccurrenceUtc, nextFutureOccurrenceUtc } from "../src/lib/reminders/rrule.ts";
import { utcToZonedParts, APP_TIMEZONE } from "../src/lib/time.ts";

/**
 * Streaks and recurrence — the "visibly broken in use" pair.
 *
 * Same charter as money-and-units.test.mts: every case here is a bug that
 * WAS REAL in this codebase. Two of them shipped:
 *
 *  1. A weekly routine's streak could never pass 1 — the streak maths
 *     counted consecutive CALENDAR days, so a routine due once a week
 *     "missed" six days out of every seven and reset forever.
 *     computeDueStreak counts due days only.
 *
 *  2. A repeating task completed late never caught up — completing it
 *     stepped the rrule exactly once from the OLD due date, so a task three
 *     weeks overdue spawned a next instance that was still overdue.
 *     nextFutureOccurrenceUtc rolls forward until the future.
 *
 * Fixture dates are real 2026 dates (2026-01-04/11/18/25 and 2026-02-01 are
 * Sundays; 2026-08-12 through 2026-09-09 step Wednesdays), verified against
 * the calendar. Timezone-sensitive expectations assume APP_TIMEZONE is
 * America/Winnipeg: CDT (UTC-5) in August–October, so 18:00 local = 23:00Z.
 */

// The exact predicate routines/actions.ts builds: the routine's own rrule,
// anchored at its creation date.
const dueOnSundays = (dateIso: string) =>
  isDueOnDate("RRULE:FREQ=WEEKLY;BYDAY=SU", "2026-01-01", dateIso);

// ---------------------------------------------------------------------------
// Schedule-aware streaks (weekly routines)
// ---------------------------------------------------------------------------

test("a weekly routine completed 3 Sundays running has a streak of 3, not 1", () => {
  // The original bug: six not-even-scheduled weekdays counted as misses, so
  // the streak reset to 0 (then 1) every single week.
  const done = ["2026-01-04", "2026-01-11", "2026-01-18"];
  assert.deepEqual(computeDueStreak(done, "2026-01-20", dueOnSundays), {
    current: 3,
    longest: 3,
  });
});

test("today's due-day, not yet ticked off, doesn't break the streak", () => {
  // It's Sunday morning and the routine isn't done YET — the day isn't over,
  // so it can't be a miss.
  const done = ["2026-01-04", "2026-01-11"];
  assert.deepEqual(computeDueStreak(done, "2026-01-18", dueOnSundays), {
    current: 2,
    longest: 2,
  });
});

test("one skipped week is forgiven — the same grace the daily maths gives one missed day", () => {
  // computeStreak forgives one missed day per trailing 7 days; the due-day
  // version forgives one missed due-day per trailing 7 due-days. Skip a
  // single Sunday and the streak survives (it just doesn't grow that week).
  const done = ["2026-01-04", "2026-01-11", "2026-01-25"]; // 01-18 skipped
  assert.deepEqual(computeDueStreak(done, "2026-01-26", dueOnSundays), {
    current: 3,
    longest: 3,
  });
});

test("a second skipped week inside the window DOES reset the streak", () => {
  const done = ["2026-01-04", "2026-01-11", "2026-02-01"]; // 01-18 and 01-25 skipped
  assert.deepEqual(computeDueStreak(done, "2026-02-02", dueOnSundays), {
    current: 1,
    longest: 2,
  });
});

test("a completion logged on a NON-due day neither grows nor protects the streak", () => {
  // Done on a Monday for a Sunday routine: as far as the schedule is
  // concerned, nothing happened.
  assert.deepEqual(computeDueStreak(["2026-01-05"], "2026-01-06", dueOnSundays), {
    current: 0,
    longest: 0,
  });
});

test("with a due-every-day predicate, computeDueStreak IS the original computeStreak", () => {
  // computeStreak is now a wrapper over computeDueStreak, and this pins that
  // contract so daily routines and workout streaks can never drift: same
  // consecutive-day counting, same one-forgiven-miss-per-week grace.
  const done = ["2026-01-01", "2026-01-02", "2026-01-04", "2026-01-05"]; // 01-03 missed, forgiven
  const today = "2026-01-05";
  const viaDue = computeDueStreak(done, today, () => true);
  assert.deepEqual(viaDue, computeStreak(done, today));
  assert.deepEqual(viaDue, { current: 4, longest: 4 });
});

// ---------------------------------------------------------------------------
// Repeating tasks completed late (roll-forward)
// ---------------------------------------------------------------------------

const WEEKLY_WED = "RRULE:FREQ=WEEKLY;BYDAY=WE";

test("a weekly task ticked off 3 weeks late lands in the FUTURE, right weekday, right time", () => {
  // The original bug: one step from the old due date (Wed 2026-08-12, 6pm
  // Winnipeg = 23:00Z in CDT) gave Wed 2026-08-19 — still weeks in the past.
  const oldDue = new Date("2026-08-12T23:00:00Z");
  const now = new Date("2026-09-01T12:00:00Z");
  const next = nextFutureOccurrenceUtc(WEEKLY_WED, oldDue, now);

  assert.equal(next?.toISOString(), "2026-09-02T23:00:00.000Z");
  // And in the app timezone that is still a Wednesday at 18:00 — the
  // time-of-day survives the roll.
  const parts = utcToZonedParts(next!, APP_TIMEZONE);
  assert.equal(parts.hour, 18);
  assert.equal(new Date(next!.toISOString().slice(0, 10) + "T00:00:00Z").getUTCDay(), 3); // 3 = Wednesday
});

test("an on-time completion steps exactly one period, same as before", () => {
  const due = new Date("2026-09-02T23:00:00Z");
  const now = new Date("2026-09-02T23:30:00Z"); // ticked off half an hour after it was due
  const next = nextFutureOccurrenceUtc(WEEKLY_WED, due, now);

  assert.equal(next?.toISOString(), "2026-09-09T23:00:00.000Z");
  assert.equal(next?.toISOString(), nextOccurrenceUtc(WEEKLY_WED, due)?.toISOString());
});

test("the iteration guard falls back to the plain single step", () => {
  // A daily task 8 months overdue can't reach the future in 3 steps — the
  // guard gives up and returns what the old code would have: one step from
  // the old due date (2026-01-01 at 9am Winnipeg = 15:00Z in CST).
  const oldDue = new Date("2026-01-01T15:00:00Z");
  const now = new Date("2026-09-01T00:00:00Z");
  const next = nextFutureOccurrenceUtc("RRULE:FREQ=DAILY", oldDue, now, 3);

  assert.equal(next?.toISOString(), "2026-01-02T15:00:00.000Z");
  assert.equal(next?.toISOString(), nextOccurrenceUtc("RRULE:FREQ=DAILY", oldDue)?.toISOString());
});
