import { test } from "node:test";
import assert from "node:assert/strict";

import { computeStreak, computeDueStreak } from "../src/lib/streaks.ts";
import {
  isDueOnDate,
  nextOccurrenceUtc,
  nextFutureOccurrenceUtc,
  buildRRuleString,
  firstReminderInstant,
} from "../src/lib/reminders/rrule.ts";
import { recurrenceFromWords, parseWallClockTime } from "../src/lib/routines/parse.ts";
import { clampRoutineIcon, ROUTINE_ICON_NAMES } from "../src/lib/routines/icon-names.ts";
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

// ---------------------------------------------------------------------------
// Spoken schedules → the recurrence a routine is actually created with
// ---------------------------------------------------------------------------
//
// The assistant's create_routine tool (lib/ai/tools.ts) takes a sentence's
// worth of loose arguments and has to produce the exact same RecurrenceOptions
// the routine dialog produces. Every case below is a way that mapping can be
// ALMOST right — a schedule off by a day or by a factor of two, which nothing
// reports as an error and which only shows up weeks later as a routine that
// nudges on the wrong days.

// The tool's own two steps in one: loose arguments in, the rrule string that
// would actually be stored on the routine out. Throwing on the error branch
// keeps each case below to a single readable line.
function rruleFromWords(input: Parameters<typeof recurrenceFromWords>[0]): string {
  const parsed = recurrenceFromWords(input);
  if ("error" in parsed) throw new Error(parsed.error);
  return buildRRuleString(parsed.recurrence) ?? "(none)";
}

test("every 3 days builds the every-3-days rule, not every 2", () => {
  assert.equal(
    rruleFromWords({ repeat: "every_n_days", every_n_days: 3 }),
    "RRULE:FREQ=DAILY;INTERVAL=3"
  );
});

test("every 1 day is daily, not silently every other day", () => {
  // buildRRuleString clamps the interval to a minimum of 2, so passing 1
  // straight through would halve how often the routine came round.
  assert.equal(rruleFromWords({ repeat: "every_n_days", every_n_days: 1 }), "RRULE:FREQ=DAILY");
});

test("every Tuesday means Tuesday — the 0=Monday offset is not the model's problem", () => {
  assert.equal(
    rruleFromWords({ repeat: "weekly", weekday: "tuesday" }),
    "RRULE:FREQ=WEEKLY;BYDAY=TU"
  );
  assert.equal(rruleFromWords({ repeat: "weekly", weekday: "Tue" }), "RRULE:FREQ=WEEKLY;BYDAY=TU");
});

test("Sunday is Sunday, the far end of the week where the off-by-one lives", () => {
  assert.equal(
    rruleFromWords({ repeat: "weekly", weekday: "sunday" }),
    "RRULE:FREQ=WEEKLY;BYDAY=SU"
  );
});

test("a bare weekday NUMBER is refused rather than guessed", () => {
  // 0 means Monday here and Sunday in JavaScript's own Date. Guessing wrong
  // gives a routine that is a day out, forever, with nothing on screen to
  // say so.
  assert.ok("error" in recurrenceFromWords({ repeat: "weekly", weekday: 0 }));
});

test("weekly with no day named asks instead of picking Monday", () => {
  assert.ok("error" in recurrenceFromWords({ repeat: "weekly" }));
});

test("monthly on the 1st, and monthly with no date asks", () => {
  assert.equal(
    rruleFromWords({ repeat: "monthly", day_of_month: 1 }),
    "RRULE:FREQ=MONTHLY;BYMONTHDAY=1"
  );
  assert.ok("error" in recurrenceFromWords({ repeat: "monthly" }));
  assert.ok("error" in recurrenceFromWords({ repeat: "monthly", day_of_month: 32 }));
});

test("the pattern is inferred from whichever detail was given", () => {
  assert.equal(rruleFromWords({ every_n_days: 4 }), "RRULE:FREQ=DAILY;INTERVAL=4");
  assert.equal(rruleFromWords({ weekday: "friday" }), "RRULE:FREQ=WEEKLY;BYDAY=FR");
  assert.equal(rruleFromWords({}), "RRULE:FREQ=DAILY");
  assert.equal(rruleFromWords({ repeat: "weekdays" }), "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
});

// ---------------------------------------------------------------------------
// Repeats that used to be guessed
// ---------------------------------------------------------------------------
// Three real cases QA found on 6 Sep 2026, all the same shape: a routine that
// nudges on a schedule nobody asked for, with nothing anywhere saying so.

test("fortnightly is asked about, not silently turned into daily", () => {
  // "Fortnightly" is a thing people say and not a pattern this app has, so it
  // fell off the end of the inference chain onto the daily default: a nudge
  // every single day, forever.
  const parsed = recurrenceFromWords({ repeat: "fortnightly" });
  assert.ok("error" in parsed);
  // The question has to name the word back, or it's unanswerable.
  assert.ok("error" in parsed && parsed.error.includes("fortnightly"));

  assert.ok("error" in recurrenceFromWords({ repeat: "every other week" }));
  assert.ok("error" in recurrenceFromWords({ repeat: 3 }));
  // Saying nothing at all is still daily — that is a default, not a guess.
  assert.equal(rruleFromWords({ repeat: "" }), "RRULE:FREQ=DAILY");
});

test("daily AND every 3 days is two patterns, so it asks which", () => {
  // This used to keep "daily" and drop the 3 entirely: three times as often as
  // asked for.
  assert.ok("error" in recurrenceFromWords({ repeat: "daily", every_n_days: 3 }));
  assert.ok("error" in recurrenceFromWords({ repeat: "weekdays", every_n_days: 2 }));
  assert.ok("error" in recurrenceFromWords({ repeat: "daily", weekday: "monday" }));
  assert.ok("error" in recurrenceFromWords({ repeat: "monthly", day_of_month: 3, weekday: "mon" }));
  assert.ok("error" in recurrenceFromWords({ repeat: "weekly", weekday: "mon", day_of_month: 3 }));
  // "Every 1 day" IS daily, so those two agree and nothing is asked.
  assert.equal(rruleFromWords({ repeat: "daily", every_n_days: 1 }), "RRULE:FREQ=DAILY");
  // A detail with no pattern named still infers — it can't contradict itself.
  assert.equal(
    rruleFromWords({ repeat: "every_n_days", every_n_days: 3 }),
    "RRULE:FREQ=DAILY;INTERVAL=3"
  );
});

test("two and a half days apart is asked about, not rounded up to three", () => {
  assert.ok("error" in recurrenceFromWords({ repeat: "every_n_days", every_n_days: 2.6 }));
  assert.ok("error" in recurrenceFromWords({ every_n_days: 0.5 }));
  // A number that isn't a number at all asks too, rather than falling through
  // to daily the way it used to.
  assert.ok("error" in recurrenceFromWords({ every_n_days: "3" }));
  assert.ok("error" in recurrenceFromWords({ every_n_days: Number.NaN }));
  assert.ok("error" in recurrenceFromWords({ repeat: "monthly", day_of_month: 15.5 }));
});

// ---------------------------------------------------------------------------
// Wall-clock times
// ---------------------------------------------------------------------------

test("7pm is 19:00 and midday is not midnight", () => {
  assert.equal(parseWallClockTime("7pm"), "19:00");
  assert.equal(parseWallClockTime("7:30 PM"), "19:30");
  assert.equal(parseWallClockTime("12pm"), "12:00");
  assert.equal(parseWallClockTime("12am"), "00:00");
  assert.equal(parseWallClockTime("19:00"), "19:00");
  assert.equal(parseWallClockTime("7:05"), "07:05");
  assert.equal(parseWallClockTime("07:00:00"), "07:00");
});

test("a time that cannot be read comes back null, never a default", () => {
  assert.equal(parseWallClockTime("evening"), null);
  assert.equal(parseWallClockTime("25:00"), null);
  assert.equal(parseWallClockTime("7:99"), null);
  assert.equal(parseWallClockTime("13pm"), null);
  assert.equal(parseWallClockTime(""), null);
  assert.equal(parseWallClockTime(undefined), null);
});

test("the parsed time is a wall clock, not an instant with an offset baked in", () => {
  // Why HH:MM is stored rather than a moment: firstReminderInstant resolves it
  // against a real date and the app timezone, so the routine is at 19:00 local
  // in both halves of the year. A hardcoded offset is what made
  // assistant-created things an hour early for five months a year.
  const timeOfDay = parseWallClockTime("7pm")!;
  const summer = firstReminderInstant(
    "RRULE:FREQ=DAILY",
    timeOfDay,
    new Date("2026-07-01T12:00:00Z"),
    "2026-07-01"
  );
  const winter = firstReminderInstant(
    "RRULE:FREQ=DAILY",
    timeOfDay,
    new Date("2026-12-01T12:00:00Z"),
    "2026-12-01"
  );
  assert.equal(utcToZonedParts(summer, APP_TIMEZONE).hour, 19);
  assert.equal(utcToZonedParts(winter, APP_TIMEZONE).hour, 19);
  // Different UTC instants — CDT vs CST — for the same wall clock.
  assert.equal(summer.toISOString().slice(11, 16), "00:00");
  assert.equal(winter.toISOString().slice(11, 16), "01:00");
});

test("an every-3-days routine's first nudge counts from its own start date", () => {
  // Migration 0040's anchor. Created on the 6th, so its due days are the 6th,
  // 9th, 12th... Asked at midday on the 7th, the next 19:00 slot is the 9th —
  // NOT the 8th, which is what an unanchored rule (today as day zero) gives.
  const anchored = firstReminderInstant(
    "RRULE:FREQ=DAILY;INTERVAL=3",
    "19:00",
    new Date("2026-09-07T17:00:00Z"),
    "2026-09-06"
  );
  // Compared in Winnipeg, not in UTC: 19:00 CDT is already the next day in
  // UTC, so an ISO-string date comparison here would read 2026-09-10 and
  // prove nothing about the schedule.
  assert.equal(utcToZonedParts(anchored, APP_TIMEZONE).day, 9);
  assert.equal(utcToZonedParts(anchored, APP_TIMEZONE).hour, 19);

  // The same routine asked before its own first slot on day zero: it fires
  // today.
  const sameDay = firstReminderInstant(
    "RRULE:FREQ=DAILY;INTERVAL=3",
    "19:00",
    new Date("2026-09-06T17:00:00Z"),
    "2026-09-06"
  );
  assert.equal(utcToZonedParts(sameDay, APP_TIMEZONE).day, 6);
  assert.equal(utcToZonedParts(sameDay, APP_TIMEZONE).hour, 19);
});

// ---------------------------------------------------------------------------
// Routine icons
// ---------------------------------------------------------------------------

test("an icon the model invented becomes a real one instead of a wrong picture", () => {
  assert.equal(clampRoutineIcon("Droplet"), "Droplet");
  assert.equal(clampRoutineIcon("droplet"), "Droplet");
  assert.equal(clampRoutineIcon("WateringCan"), "Repeat");
  assert.equal(clampRoutineIcon(undefined), "Repeat");
  assert.equal(clampRoutineIcon(7), "Repeat");
  // Every name the tool offers the model is one the registry can draw.
  for (const name of ROUTINE_ICON_NAMES) assert.equal(clampRoutineIcon(name), name);
});
