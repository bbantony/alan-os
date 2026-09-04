// Runtime import is relative with an explicit .ts extension (not "@/lib/time")
// so node's test runner can load this file directly — same convention as
// lib/finance/reconcile.ts. Next's bundler accepts it too
// (allowImportingTsExtensions).
import { addDaysToDateString } from "./time.ts";

export interface StreakResult {
  current: number;
  longest: number;
}

// Schedule-aware streak, in plain English:
//
//   - Only DUE days count. `isDue` says which calendar days the habit was
//     actually scheduled for (from its rrule); the days in between simply
//     don't exist as far as the streak is concerned. A weekly routine's
//     streak therefore counts weeks, not days — the six days it was never
//     scheduled on can't reset it.
//   - Each due day with a completion grows the streak by 1.
//   - One missed due day within any trailing window of 7 due days is
//     forgiven: the streak survives but doesn't grow. A second miss inside
//     that same window resets it to 0. (For a daily habit that's the
//     original "one free miss per week"; for a weekly one it's one free
//     skipped week per ~7 weeks — the same shape of grace at its own scale.)
//   - Today, if due but not yet ticked off, is never a miss — the day
//     isn't over.
//   - A completion logged on a NON-due day is ignored (it neither grows
//     nor protects the streak).
//
// `completedDates` and `today` are YYYY-MM-DD strings in the app timezone
// (see src/lib/time.ts) — distinct dates, one per routine per day.
export function computeDueStreak(
  completedDates: string[],
  today: string,
  isDue: (dateIso: string) => boolean
): StreakResult {
  const dates = new Set(completedDates);
  if (dates.size === 0) return { current: 0, longest: 0 };

  const earliest = [...dates].sort()[0];

  let current = 0;
  let longest = 0;
  let window: boolean[] = [];

  let cursor = earliest;
  while (cursor <= today) {
    if (isDue(cursor)) {
      const done = dates.has(cursor);

      if (done) {
        window.push(true);
        if (window.length > 7) window.shift();
        current += 1;
      } else if (cursor === today) {
        // Today isn't over yet — don't treat an as-yet-unlogged today as a miss.
        break;
      } else {
        window.push(false);
        if (window.length > 7) window.shift();
        const missesInWindow = window.filter((w) => !w).length;
        if (missesInWindow > 1) {
          current = 0;
          window = [];
        }
        // else: first miss in this window — forgiven, streak stays alive but doesn't grow.
      }

      longest = Math.max(longest, current);
    }
    cursor = addDaysToDateString(cursor, 1);
  }

  return { current, longest };
}

// The original every-calendar-day streak (built for Workout, SPEC.md Part D):
// consecutive days with >=1 completion, one forgiven miss per trailing
// 7 days. Exactly computeDueStreak with "due every day" — kept as the named
// entry point for callers with no schedule (workout days, admin stats), so
// there is one implementation and two names, not two implementations.
export function computeStreak(completedDates: string[], today: string): StreakResult {
  return computeDueStreak(completedDates, today, () => true);
}

// Monday on/before the given date (YYYY-MM-DD).
export function startOfWeek(dateStr: string, weekStart: "monday" | "sunday" = "monday"): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  // Monday was hardcoded. It's a preference now (lib/preferences.ts), with
  // Monday still the default so no existing week boundary moved.
  const diff = weekStart === "sunday" ? day : day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}
