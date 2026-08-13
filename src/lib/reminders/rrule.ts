import { RRule } from "rrule";
import { APP_TIMEZONE, zonedTimeToUtc, utcToZonedParts } from "@/lib/time";
import type { RecurrencePreset } from "./types";

const DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export interface RecurrenceOptions {
  preset: RecurrencePreset;
  intervalDays?: number; // every_n_days
  weekday?: number; // 0=Mon..6=Sun, for "weekly"
  monthDay?: number; // 1-31, for "monthly"
  custom?: { freq: "DAILY" | "WEEKLY" | "MONTHLY"; interval: number; byweekday?: number[] };
}

// Builds just the RRULE line (no DTSTART) — DTSTART is supplied separately at
// computation time from the reminder's own remind_at, since that's the only
// place the actual start date/time lives (see rruleAtInstant below).
export function buildRRuleString(opts: RecurrenceOptions): string | null {
  switch (opts.preset) {
    case "none":
      return null;
    case "daily":
      return "RRULE:FREQ=DAILY";
    case "weekdays":
      return "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "weekly":
      return `RRULE:FREQ=WEEKLY;BYDAY=${DAY_CODES[opts.weekday ?? 0]}`;
    case "every_n_days":
      return `RRULE:FREQ=DAILY;INTERVAL=${Math.max(2, opts.intervalDays ?? 2)}`;
    case "monthly":
      return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${opts.monthDay ?? 1}`;
    case "custom": {
      const c = opts.custom;
      if (!c) return null;
      const byday = c.byweekday?.length ? `;BYDAY=${c.byweekday.map((d) => DAY_CODES[d]).join(",")}` : "";
      return `RRULE:FREQ=${c.freq};INTERVAL=${Math.max(1, c.interval)}${byday}`;
    }
  }
}

// The inverse of buildRRuleString, for pre-filling an edit form from a
// stored rrule — restores the actual weekday/interval/month-day instead of
// just the preset type, so re-saving a form the user didn't touch a
// particular field on doesn't silently reset it (e.g. an "every Wednesday"
// routine/task defaulting back to Monday just because its edit dialog only
// recovered the preset, not the day). `fallbackPreset` is what an
// unrecognized or absent rrule maps to — "none" for a one-off task, "daily"
// for a routine/reminder that must always repeat.
export function parseRecurrenceFromRRule(
  rruleText: string | null,
  fallbackPreset: RecurrencePreset = "none"
): { preset: RecurrencePreset; weekday: number; intervalDays: string; monthDay: string } {
  const fallback = { preset: fallbackPreset, weekday: 0, intervalDays: "2", monthDay: "1" };
  if (!rruleText) return fallback;
  if (rruleText.includes("BYDAY=MO,TU,WE,TH,FR")) return { ...fallback, preset: "weekdays" };
  const weeklyMatch = rruleText.match(/FREQ=WEEKLY;BYDAY=(\w\w)/);
  if (weeklyMatch) {
    const idx = DAY_CODES.indexOf(weeklyMatch[1]);
    return { ...fallback, preset: "weekly", weekday: idx >= 0 ? idx : 0 };
  }
  const monthlyMatch = rruleText.match(/FREQ=MONTHLY;BYMONTHDAY=(\d+)/);
  if (monthlyMatch) return { ...fallback, preset: "monthly", monthDay: monthlyMatch[1] };
  const everyNMatch = rruleText.match(/FREQ=DAILY;INTERVAL=(\d+)/);
  if (everyNMatch) return { ...fallback, preset: "every_n_days", intervalDays: everyNMatch[1] };
  if (rruleText.includes("FREQ=DAILY")) return { ...fallback, preset: "daily" };
  return fallback;
}

export function describeRRule(rruleText: string): string {
  try {
    const rule = RRule.fromString(rruleText);
    return rule.toText();
  } catch {
    return "Repeats";
  }
}

// Rebuilds an RRule with dtstart pinned to `atUtc`'s wall-clock time in
// APP_TIMEZONE, represented as a "floating" Date whose UTC getters equal
// those wall-clock numbers — the standard workaround for computing
// timezone-correct recurrences with a library (rrule.js) that only reasons
// in either true UTC or the host machine's local time, neither of which is
// what we want on a UTC-running Vercel function displaying Winnipeg times.
function rruleAtInstant(rruleText: string, atUtc: Date): RRule {
  const parts = utcToZonedParts(atUtc, APP_TIMEZONE);
  const floatingDtstart = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  );
  const parsed = RRule.parseString(rruleText);
  return new RRule({ ...parsed, dtstart: floatingDtstart });
}

// Next occurrence strictly after `afterUtc` (which should itself be a valid
// occurrence — i.e. the reminder's current remind_at), returned as a true
// UTC instant with the DST offset re-resolved for that future date, not
// carried over from afterUtc's original offset. This is what prevents a
// "daily at 9am" reminder from drifting an hour across a DST boundary.
export function nextOccurrenceUtc(rruleText: string, afterUtc: Date): Date | null {
  const rule = rruleAtInstant(rruleText, afterUtc);
  const dtstart = rule.options.dtstart;
  const nextFloating = rule.after(dtstart, false);
  if (!nextFloating) return null;

  return zonedTimeToUtc(
    {
      year: nextFloating.getUTCFullYear(),
      month: nextFloating.getUTCMonth() + 1,
      day: nextFloating.getUTCDate(),
      hour: nextFloating.getUTCHours(),
      minute: nextFloating.getUTCMinutes(),
      second: nextFloating.getUTCSeconds(),
    },
    APP_TIMEZONE
  );
}

// Routines care about calendar days, not precise instants (unlike reminders'
// remind_at) — so this checks plain YYYY-MM-DD membership with floating UTC
// dates rather than doing the timezone-instant reconstruction nextOccurrenceUtc
// needs. `dtstartDateStr` anchors interval-based patterns (every_n_days) to a
// stable epoch — a routine's own created_at date is the natural choice.
export function isDueOnDate(rruleText: string, dtstartDateStr: string, dateStr: string): boolean {
  const [dy, dm, dd] = dtstartDateStr.split("-").map(Number);
  const dtstart = new Date(Date.UTC(dy, dm - 1, dd));
  const parsed = RRule.parseString(rruleText);
  const rule = new RRule({ ...parsed, dtstart });

  const [y, m, d] = dateStr.split("-").map(Number);
  const dayStart = new Date(Date.UTC(y, m - 1, d));
  const dayEnd = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  return rule.between(dayStart, dayEnd, true).length > 0;
}

// The correct first remind_at for a brand-new (or just-edited) recurring
// reminder anchored to a wall-clock "time of day" rather than a specific
// picked date+time (routines' "Around what time?" field, unlike the
// Calendar reminder form which has the user pick an explicit date). Naively
// using today's date at that time — what the routine reminder code used to
// do — is wrong in two ways: if that time has already passed today, the
// reminder is already "due" and fires on the very next cron tick instead of
// waiting for its real next occurrence; and if today doesn't match the
// rrule's own pattern (e.g. "weekly on Wednesday" set up on a Monday), it
// fires on the wrong day entirely. Both are fixed by checking today against
// the rrule and rolling forward to the true next occurrence whenever
// today's slot isn't a valid, still-upcoming one.
export function firstReminderInstant(rruleText: string, timeOfDay: string, nowUtc: Date = new Date()): Date {
  const [hh, mm] = timeOfDay.split(":").map(Number);
  const now = utcToZonedParts(nowUtc, APP_TIMEZONE);
  const todayStr = `${now.year}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`;
  const todayCandidate = zonedTimeToUtc(
    { year: now.year, month: now.month, day: now.day, hour: hh || 0, minute: mm || 0, second: 0 },
    APP_TIMEZONE
  );

  if (isDueOnDate(rruleText, todayStr, todayStr) && todayCandidate > nowUtc) {
    return todayCandidate;
  }
  return nextOccurrenceUtc(rruleText, todayCandidate) ?? todayCandidate;
}
