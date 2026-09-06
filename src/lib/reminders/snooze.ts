// Snooze, as a fixed set of choices rather than "however many minutes the
// browser felt like sending".
//
// WHY AN ALLOW-LIST. `snoozeReminder` is a server action, so its argument
// arrives from the client and cannot be trusted. A raw `minutes: number` would
// accept 0 (fires again on the very next cron tick, forever), a negative number
// (instantly overdue), or 525600 (silently gone for a year). The four options
// below are the entire vocabulary, and anything else is refused with a sentence
// rather than quietly clamped — silently doing something other than what was
// asked is worse than saying no.
//
// WHY THIS FILE EXISTS AT ALL. A "use server" module may only export async
// functions, so a constant array exported from `reminders/actions.ts` is a
// build error. Keeping the presets here also means a client component can
// import the labels without pulling in the server action.
//
// RELATIVE IMPORTS WITH EXTENSIONS, ON PURPOSE. `tests/*.test.mts` run under
// node's own runner, which resolves plain paths and knows nothing about the
// `@/` alias — a single aliased import here made the whole module untestable.
// anchor.ts and rrule.ts already write their imports this way for exactly that
// reason, and the morning-hour rule below is arithmetic that has already been
// wrong once, so it belongs under test.
import { isQuietHour, type NotificationPreferences } from "../preferences.ts";
import {
  APP_TIMEZONE,
  addDaysToDateString,
  formatInAppTimezone,
  utcToZonedParts,
  zonedTimeToUtc,
} from "../time.ts";

export const SNOOZE_PRESETS = [
  { value: 10, label: "10 minutes", sentence: "Back in 10 minutes" },
  { value: 60, label: "1 hour", sentence: "Back in an hour" },
  { value: 240, label: "4 hours", sentence: "Back in 4 hours" },
  // DELIBERATELY NOT "Tomorrow morning", even though it usually means tomorrow.
  // Snoozed before the morning hour — at 2am, or at 07:30 on an 8am morning —
  // this lands on the morning that is a few hours away rather than the one 30
  // hours away, which is the right thing to do (see snoozeUntilUtc). The old
  // label was the part that lied. So the button now says the thing both cases
  // have in common, and the confirmation sentence names the day and time it
  // actually landed on (describeSnooze).
  { value: "tomorrow_morning", label: "In the morning", sentence: "Back in the morning" },
] as const;

export type SnoozePreset = (typeof SNOOZE_PRESETS)[number]["value"];

export function isSnoozePreset(value: unknown): value is SnoozePreset {
  return SNOOZE_PRESETS.some((preset) => (preset.value as unknown) === value);
}

/**
 * How far a landing time may sit from what a preset asked for and still be
 * described in the button's own words. A minute either way is round-trip
 * latency; anything more is a different answer and gets said out loud.
 */
const AS_ASKED_TOLERANCE_MS = 60_000;

/**
 * The sentence shown after a successful snooze — describing where the nudge
 * ACTUALLY landed, not where the button hoped it would.
 *
 * Those two come apart in both directions. A repeating nudge already pointing
 * at a genuine occurrence sooner than the snooze keeps that occurrence
 * (snoozeTargetFor in lib/reminders/anchor.ts), so tapping "4 hours" can
 * honestly mean two. And "in the morning" is this morning when the morning
 * hasn't happened yet. Either way the confirmation has to match what was
 * saved, so callers pass the instant that was stored and this names it.
 */
export function describeSnooze(
  preset: SnoozePreset,
  until: Date | string,
  timeZone: string = APP_TIMEZONE,
  now: Date = new Date()
): string {
  const fallback = SNOOZE_PRESETS.find((p) => p.value === preset)?.sentence ?? "Snoozed";
  const at = until instanceof Date ? until : new Date(until);
  if (Number.isNaN(at.getTime())) return fallback;

  // A minute preset that got exactly what it asked for keeps the button's own
  // words: "back in an hour" reads better than a clock time for a gap you
  // just picked yourself.
  if (
    preset !== "tomorrow_morning" &&
    Math.abs(at.getTime() - (now.getTime() + preset * 60_000)) <= AS_ASKED_TOLERANCE_MS
  ) {
    return fallback;
  }

  return `Back ${landingSentence(at, timeZone, now)}`;
}

/**
 * "today at 8:00 a.m.", "tomorrow at 8:00 a.m.", "Tue, Sep 15 at 9:00 a.m."
 *
 * Exported because snoozing is not the only thing that has to name when a nudge
 * comes back: silencing a REPEATING one also sends it to a real time, and
 * "it comes round again (every day)" left out the only part that mattered —
 * an overdue daily nudge can land back within the hour. Same sentence shape in
 * both places, so the two confirmations read alike.
 */
export function describeLanding(
  at: Date | string,
  timeZone: string = APP_TIMEZONE,
  now: Date = new Date()
): string {
  const when = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(when.getTime())) return "later";
  return landingSentence(when, timeZone, now);
}

function landingSentence(at: Date, timeZone: string, now: Date): string {
  const time = formatInAppTimezone(at, { hour: "numeric", minute: "2-digit" }, timeZone);
  const today = zonedDateString(now, timeZone);
  const landing = zonedDateString(at, timeZone);

  if (landing === today) return `today at ${time}`;
  if (landing === addDaysToDateString(today, 1)) return `tomorrow at ${time}`;

  const date = formatInAppTimezone(
    at,
    { weekday: "short", month: "short", day: "numeric" },
    timeZone
  );
  return `${date} at ${time}`;
}

/** The calendar date an instant falls on, in the profile's timezone. */
function zonedDateString(date: Date, timeZone: string): string {
  const parts = utcToZonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * What "morning" means for this account.
 *
 * 8am by default, but never earlier than the moment notifications are allowed
 * again: the cron dispatcher HOLDS anything due inside quiet hours (it doesn't
 * drop it), so snoozing to 8am on a profile whose quiet hours run until 10am
 * would land in the held pile and arrive at 10am anyway. Better to schedule it
 * where it will actually fire than to promise 8am and deliver 10am.
 *
 * ONLY WHEN 8AM IS ACTUALLY INSIDE THE WINDOW, THOUGH. This used to be a flat
 * `Math.max(8, quietHoursEnd)`, which quietly assumed every quiet window is an
 * overnight one. Both ends are free 0–23 choices in Settings → Notifications,
 * so a daytime window of 1pm→6pm — perfectly legal, nothing stops it — made
 * "in the morning" mean 18:00, i.e. tomorrow EVENING. 8am is nowhere near that
 * window and never needed deferring at all.
 *
 * `isQuietHour` in lib/preferences.ts is the one authority on what "inside the
 * window" means (it is the same function the dispatcher holds against), so the
 * question is asked of it rather than re-derived here — including the wrap past
 * midnight, which is the case that made the old shortcut look correct.
 */
export const DEFAULT_MORNING_HOUR = 8;

export function morningHourFor(notifications: NotificationPreferences): number {
  if (!isQuietHour(DEFAULT_MORNING_HOUR, notifications)) return DEFAULT_MORNING_HOUR;
  // Inside the window: quietHoursEnd is the first hour notifications are
  // allowed again, so that is the earliest a nudge can genuinely arrive.
  return notifications.quietHoursEnd;
}

/**
 * The UTC instant a snooze should fire at. Stored as-is — nothing in the
 * database is ever pre-converted to a local time (SPEC.md Part B3).
 *
 * The minute-based presets are plain arithmetic. The morning preset is the only
 * one that needs a timezone, and it is the PROFILE's timezone, never the
 * device's: Alan travels, and "morning" has to mean morning where he says he
 * lives, the same rule recurrences already follow (see lib/time.ts).
 *
 * One deliberate subtlety: snoozed at 2am, "in the morning" means the morning
 * that is a few hours away, not the one 30 hours away. So this returns the NEXT
 * time the morning hour comes round, which is today's when the morning hasn't
 * happened yet and tomorrow's the rest of the time. That also covers the
 * narrower case of snoozing at 07:30 on an 8am morning — half an hour, not a
 * day and a half. The preset is labelled "In the morning" rather than
 * "Tomorrow morning" precisely so the button can't promise the wrong day.
 */
export function snoozeUntilUtc(
  preset: SnoozePreset,
  notifications: NotificationPreferences,
  timeZone: string = APP_TIMEZONE,
  now: Date = new Date()
): Date {
  if (preset !== "tomorrow_morning") {
    return new Date(now.getTime() + preset * 60_000);
  }

  const hour = morningHourFor(notifications);
  const local = utcToZonedParts(now, timeZone);
  const todayStr = zonedDateString(now, timeZone);
  const dayStr = local.hour < hour ? todayStr : addDaysToDateString(todayStr, 1);
  const [year, month, day] = dayStr.split("-").map(Number);

  return zonedTimeToUtc({ year, month, day, hour, minute: 0, second: 0 }, timeZone);
}
