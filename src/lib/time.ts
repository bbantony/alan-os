// Every timestamp is stored in the database as UTC and only ever converted to
// the reader's timezone at the point of display — never stored pre-converted.
//
// TIMEZONE, HONESTLY. `profiles.timezone` has existed since migration 0001 and
// was never read: every function here hardcoded America/Winnipeg. Alan travels,
// so it's real now — each function takes a timezone, defaulting to the constant
// so that any caller not yet threading it through keeps its old behaviour
// exactly.
//
// THE RULE FOR RECURRENCES: they are anchored to the *profile's* timezone, not
// the device's. "Daily at 9am" means 9am where you say you live, so flying to
// India doesn't drag every reminder five and a half hours. Changing the setting
// moves future occurrences only — nothing already stamped is rewritten.
export const APP_TIMEZONE = "America/Winnipeg";

export function formatInAppTimezone(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
  timeZone: string = APP_TIMEZONE
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", { ...options, timeZone }).format(date);
}

export function todayInAppTimezone(timeZone: string = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Pure calendar-date arithmetic on YYYY-MM-DD strings — no timezone involved,
// just adding whole days to a date string (used for "tomorrow" in the
// day-planner ritual).
export function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKEND_DAYS = new Set(["Sat", "Sun"]);

export interface WorkHours {
  start: number;
  end: number;
  weekendsOff: boolean;
}

const DEFAULT_WORK_HOURS: WorkHours = { start: 8, end: 18, weekendsOff: true };

// Work tasks collapse outside working hours. The window was fixed at 8am-6pm
// weekdays; it now comes from preferences (lib/preferences.ts), with the old
// values as the default so nothing moved for anyone who never changes it.
export function isOutsideWorkHours(
  date: Date = new Date(),
  hours: WorkHours = DEFAULT_WORK_HOURS,
  timeZone: string = APP_TIMEZONE
): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);

  const rawHour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const hour = rawHour === 24 ? 0 : rawHour;
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";

  if (hours.weekendsOff && WEEKEND_DAYS.has(weekday)) return true;
  return hour < hours.start || hour >= hours.end;
}

// The Today dashboard's day-planner ritual switches to "plan tomorrow" mode in
// the evening (SPEC.md Part E1). The hour was fixed at 8pm and is now a setting.
export function isEveningPlanningTime(
  date: Date = new Date(),
  eveningHour = 20,
  timeZone: string = APP_TIMEZONE
): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).formatToParts(
      date
    ).find((p) => p.type === "hour")?.value ?? "0"
  );
  return (hour === 24 ? 0 : hour) >= eveningHour;
}

/** The hour of the day, in a given timezone — used by the quiet-hours check. */
export function hourInTimezone(date: Date = new Date(), timeZone: string = APP_TIMEZONE): number {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).formatToParts(
      date
    ).find((p) => p.type === "hour")?.value ?? "0"
  );
  return hour === 24 ? 0 : hour;
}

export interface WallClockParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - date.getTime()) / 60000;
}

// Converts wall-clock fields *as observed in timeZone* to the correct UTC
// instant — DST-aware (two-pass correction), so "daily at 9am" reminders
// don't drift an hour across a DST boundary the way naive
// UTC-plus-24-hours arithmetic would. Used by src/lib/reminders/rrule.ts.
export function zonedTimeToUtc(parts: WallClockParts, timeZone: string = APP_TIMEZONE): Date {
  const naiveUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let offsetMinutes = getOffsetMinutes(new Date(naiveUtc), timeZone);
  let candidate = new Date(naiveUtc - offsetMinutes * 60000);
  offsetMinutes = getOffsetMinutes(candidate, timeZone);
  candidate = new Date(naiveUtc - offsetMinutes * 60000);
  return candidate;
}

// The inverse: wall-clock fields for a UTC instant, as observed in timeZone.
export function utcToZonedParts(date: Date, timeZone: string = APP_TIMEZONE): WallClockParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}
