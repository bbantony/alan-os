/**
 * Pure date helpers for the calendar grid and the date/time pickers.
 *
 * Everything here works in **local wall-clock terms** and speaks the same
 * string formats the app's form fields already use — `YYYY-MM-DD` for a date
 * and `YYYY-MM-DDTHH:mm` for a date and time, exactly what `<input type="date">`
 * and `<input type="datetime-local">` produced. That's deliberate: the pickers
 * are a drop-in replacement for those inputs, so every caller's existing
 * conversion to UTC keeps working untouched. Timezone handling stays where it
 * already lives (src/lib/time.ts) rather than being quietly reinvented here.
 */

export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface CalendarDay {
  /** `YYYY-MM-DD`. */
  iso: string;
  day: number;
  /** False for the leading/trailing days borrowed from the adjacent months. */
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toDateTimeString(d: Date): string {
  return `${toDateString(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Splits `YYYY-MM-DDTHH:mm` (or a bare date) into its two halves. */
export function splitDateTime(value: string): { date: string; time: string } {
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

export function parseDateString(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(iso: string, days: number): string {
  const d = parseDateString(iso) ?? new Date();
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/**
 * Six weeks of days for a month grid, always starting on a Monday.
 *
 * Always six rows, never five — a grid that changes height as you page through
 * months makes everything below it jump around, which is far more annoying
 * than one mostly-empty trailing row.
 */
export function buildMonthGrid(year: number, month: number, todayIso: string): CalendarDay[] {
  const first = new Date(year, month, 1);
  // getDay() is Sunday-based; shift so Monday is 0.
  const leading = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - leading);

  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const weekday = (d.getDay() + 6) % 7;
    days.push({
      iso: toDateString(d),
      day: d.getDate(),
      inMonth: d.getMonth() === month,
      isToday: toDateString(d) === todayIso,
      isWeekend: weekday >= 5,
    });
  }
  return days;
}

/** "Wed 19 August" — the app's standard way of naming a day in prose. */
export function formatDayLong(iso: string): string {
  const d = parseDateString(iso);
  if (!d) return iso;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  return `${weekday} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

/** "Today" / "Tomorrow" / "Yesterday" where it applies, otherwise the date. */
export function formatDayRelative(iso: string, todayIso: string): string {
  if (iso === todayIso) return "Today";
  if (iso === addDays(todayIso, 1)) return "Tomorrow";
  if (iso === addDays(todayIso, -1)) return "Yesterday";
  return formatDayLong(iso);
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

export interface Clock12 {
  hour12: number;
  minute: number;
  meridiem: "AM" | "PM";
}

export function to12Hour(hour24: number, minute: number): Clock12 {
  const meridiem: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minute, meridiem };
}

export function to24Hour({ hour12, meridiem }: Pick<Clock12, "hour12" | "meridiem">): number {
  if (meridiem === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

export function formatTime12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h)) return time;
  const { hour12, meridiem } = to12Hour(h, m || 0);
  return `${hour12}:${pad(m || 0)} ${meridiem}`;
}

export function formatTime24(hour24: number, minute: number): string {
  return `${pad(hour24)}:${pad(minute)}`;
}

/**
 * Which number on a clock face a point corresponds to.
 *
 * `steps` is how many positions the ring has — 12 for hours, 60 for minutes.
 * Angle is measured clockwise from twelve o'clock, which is why the y term is
 * negated and x comes first in the atan2 call.
 */
export function angleToValue(dx: number, dy: number, steps: number): number {
  const angle = Math.atan2(dx, -dy);
  const normalized = angle < 0 ? angle + Math.PI * 2 : angle;
  return Math.round((normalized / (Math.PI * 2)) * steps) % steps;
}

/** Position of a value on the clock face, as a fraction of the radius. */
export function valueToPoint(value: number, steps: number): { x: number; y: number } {
  const angle = (value / steps) * Math.PI * 2;
  return { x: Math.sin(angle), y: -Math.cos(angle) };
}
