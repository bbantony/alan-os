export interface StreakResult {
  current: number;
  longest: number;
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// Streak = consecutive calendar days with >=1 workout (SPEC.md Part D), with one
// bonus rule folded in per owner request: a single missed day within any trailing
// 7-calendar-day window is forgiven and doesn't reset the streak (it just doesn't
// grow it either) — a second miss within that same week does reset it. This is
// implemented as an automatic rolling grace rather than a manually pre-planned rest
// day, so it stays a pure computed-on-read function with no extra schema, per
// SPEC.md Part D's "streaks computed on read" note.
//
// `workoutDates` and `today` are YYYY-MM-DD strings in the app timezone (see
// src/lib/time.ts) — distinct dates only, one per user.
export function computeStreak(workoutDates: string[], today: string): StreakResult {
  const dates = new Set(workoutDates);
  if (dates.size === 0) return { current: 0, longest: 0 };

  const earliest = [...dates].sort()[0];

  let current = 0;
  let longest = 0;
  let window: boolean[] = [];

  let cursor = earliest;
  while (cursor <= today) {
    const worked = dates.has(cursor);

    if (worked) {
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
      // else: first miss this week — forgiven, streak stays alive but doesn't grow.
    }

    longest = Math.max(longest, current);
    cursor = addDays(cursor, 1);
  }

  return { current, longest };
}

// Monday on/before the given date (YYYY-MM-DD) — used for "workouts this week"
// on the leaderboard.
export function startOfWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}
