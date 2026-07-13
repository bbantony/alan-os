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
