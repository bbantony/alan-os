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
