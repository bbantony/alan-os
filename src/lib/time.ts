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
