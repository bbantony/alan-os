// Promoted to src/lib/streaks.ts (Routines became a second consumer of the
// exact same math) — re-exported here so existing Workout imports don't need
// to change.
export { computeStreak, startOfWeek, type StreakResult } from "@/lib/streaks";
