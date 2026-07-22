// Every timestamp is stored in the database as UTC and only ever converted
// to America/Winnipeg at the point of display — never stored pre-converted.

export const APP_TIMEZONE = "America/Winnipeg";

export function formatInAppTimezone(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", { ...options, timeZone: APP_TIMEZONE }).format(
    date
  );
}

export function todayInAppTimezone(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
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

// Work tasks collapse before 8am/after 6pm and on weekends, America/Winnipeg time.
export function isOutsideWorkHours(date: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);

  const rawHour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const hour = rawHour === 24 ? 0 : rawHour;
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";

  return WEEKEND_DAYS.has(weekday) || hour < 8 || hour >= 18;
}

// The Today dashboard's day-planner ritual switches to "plan tomorrow" mode
// after 8pm America/Winnipeg (SPEC.md Part E1).
export function isEveningPlanningTime(date: Date = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, hour: "numeric", hour12: false }).formatToParts(
      date
    ).find((p) => p.type === "hour")?.value ?? "0"
  );
  return (hour === 24 ? 0 : hour) >= 20;
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
