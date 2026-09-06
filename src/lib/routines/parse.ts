// Turning loosely-worded arguments into the exact shapes routines/actions.ts
// wants. Pure, no database, no server-only imports — so `npm test` can load it
// directly and so the AI tool layer and any future importer share one set of
// rules rather than each inventing its own.
//
// This file exists because of one specific class of failure: a value that is
// ALMOST right. A weekday off by one, an interval quietly bumped from 1 to 2,
// a time that parsed as something else — none of these throw, none of them show
// an error, they just produce a routine that nudges on the wrong day forever.
// Everything here therefore either returns a value it is sure of, or an error
// sentence plain enough to hand straight back to the person.

import type { RecurrenceOptions } from "../reminders/rrule";

/**
 * How a routine repeats, in the vocabulary a sentence uses.
 *
 * A deliberate subset of `RecurrencePreset` (lib/reminders/types.ts): "none"
 * is meaningless for a routine (a routine that never repeats is a task) and
 * "custom" is a form control, not something anyone says out loud.
 */
export type RoutineRepeat = "daily" | "weekdays" | "every_n_days" | "weekly" | "monthly";

export const ROUTINE_REPEATS: RoutineRepeat[] = [
  "daily",
  "weekdays",
  "every_n_days",
  "weekly",
  "monthly",
];

/**
 * Weekdays BY NAME, because the number is a trap.
 *
 * `RecurrenceOptions.weekday` is 0=Monday..6=Sunday — the ISO ordering the
 * rrule spec uses. JavaScript's own `Date.getDay()` is 0=Sunday, and so is
 * most of the world's mental model of "day 0". Anything handing us a bare
 * number is therefore as likely to mean Sunday as Monday, and the two produce
 * routines a day apart with no complaint from anyone. Names have no such
 * ambiguity, so names are the only thing accepted.
 */
const WEEKDAY_INDEX: Record<string, number> = {
  monday: 0, mon: 0,
  tuesday: 1, tue: 1, tues: 1,
  wednesday: 2, wed: 2,
  thursday: 3, thu: 3, thur: 3, thurs: 3,
  friday: 4, fri: 4,
  saturday: 5, sat: 5,
  sunday: 6, sun: 6,
};

/** The names the tool schema offers, in the order a week is usually read. */
export const WEEKDAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

/** 0=Mon..6=Sun, or null. Never guesses from a number — see above. */
export function parseWeekdayName(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return key in WEEKDAY_INDEX ? WEEKDAY_INDEX[key] : null;
}

/**
 * A wall-clock "HH:MM" in the app's timezone, or null if it isn't a time.
 *
 * WALL CLOCK, not an instant: it is stored in a Postgres `time` column and
 * turned into a real moment later by `firstReminderInstant`, which knows the
 * timezone and the date and therefore knows whether that day is on daylight
 * time. Nothing here may ever add an offset — see the note in lib/ai/tools.ts
 * about the five months a year a hardcoded `-05:00` was wrong.
 *
 * Accepts what a model actually emits: "19:00", "7:00", "07:00:00", and the
 * 12-hour forms ("7pm", "7:30 PM") it slips into when the person said them.
 */
export function parseWallClockTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3];

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (minute > 59) return null;

  if (meridiem) {
    // 12am is midnight and 12pm is noon — the one pair that isn't "+12".
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "am" && hour === 12) hour = 0;
    else if (meridiem === "pm" && hour !== 12) hour += 12;
  } else if (hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * The recurrence a routine should be created with, or a question to ask back.
 *
 * `repeat` is inferred from whichever detail was supplied when it is missing
 * or unrecognised, because "every 3 days" and "on the 1st" each say the
 * pattern on their own. What is NEVER inferred is the detail itself: a weekly
 * routine with no day named, or a monthly one with no date, comes back as an
 * error so the assistant asks rather than picking Monday the 1st and being
 * quietly wrong every week from then on.
 */
export function recurrenceFromWords(input: {
  repeat?: unknown;
  every_n_days?: unknown;
  weekday?: unknown;
  day_of_month?: unknown;
}): { recurrence: RecurrenceOptions } | { error: string } {
  const asked = typeof input.repeat === "string" ? input.repeat.trim().toLowerCase() : "";
  const interval =
    typeof input.every_n_days === "number" && Number.isFinite(input.every_n_days)
      ? Math.round(input.every_n_days)
      : null;
  const weekday = parseWeekdayName(input.weekday);
  const monthDay =
    typeof input.day_of_month === "number" && Number.isFinite(input.day_of_month)
      ? Math.round(input.day_of_month)
      : null;

  let repeat: RoutineRepeat;
  if ((ROUTINE_REPEATS as string[]).includes(asked)) {
    repeat = asked as RoutineRepeat;
  } else if (asked === "weekday") {
    repeat = "weekdays";
  } else if (interval !== null) {
    repeat = "every_n_days";
  } else if (input.weekday !== undefined && input.weekday !== null) {
    repeat = "weekly";
  } else if (monthDay !== null) {
    repeat = "monthly";
  } else {
    repeat = "daily";
  }

  switch (repeat) {
    case "daily":
      return { recurrence: { preset: "daily" } };
    case "weekdays":
      return { recurrence: { preset: "weekdays" } };
    case "every_n_days": {
      if (interval === null) {
        return { error: "How many days apart should it repeat — every 2 days, every 3?" };
      }
      if (interval < 1 || interval > 366) {
        return { error: "That gap between repeats isn't something a routine can do." };
      }
      // "Every 1 day" IS daily, and saying so here matters: buildRRuleString
      // clamps the interval to a minimum of 2, so an interval of 1 would
      // silently become an every-other-day routine — half the reminders the
      // person asked for, with nothing on screen to say why.
      if (interval === 1) return { recurrence: { preset: "daily" } };
      return { recurrence: { preset: "every_n_days", intervalDays: interval } };
    }
    case "weekly": {
      if (weekday === null) {
        return {
          error:
            input.weekday === undefined || input.weekday === null
              ? "Which day of the week should it repeat on?"
              : "Say the day by name — Monday, Tuesday, and so on.",
        };
      }
      return { recurrence: { preset: "weekly", weekday } };
    }
    case "monthly": {
      if (monthDay === null) {
        return { error: "Which day of the month should it repeat on?" };
      }
      if (monthDay < 1 || monthDay > 31) {
        return { error: "A day of the month has to be between 1 and 31." };
      }
      return { recurrence: { preset: "monthly", monthDay } };
    }
  }
}
