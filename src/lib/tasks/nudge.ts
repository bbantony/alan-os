/**
 * When to be told about something, as distinct from when it's due.
 *
 * The old model had a due date and a bell, and the bell fired at exactly the
 * due time — i.e. it told you to do the thing at the moment it became late.
 * A nudge is an offset *before* the deadline, which is what a reminder is
 * actually for.
 *
 * The offset is stored on the task (`tasks.notify_offset_minutes`). The
 * `reminders` row is derived from it and exists only so the dispatcher has
 * something to claim — nothing in the UI edits a reminder directly any more.
 */

export const NUDGE_NEVER = null;

export interface NudgeOption {
  /** Minutes before due. `null` means don't notify. */
  minutes: number | null;
  label: string;
  /** Shown once a nudge is set, e.g. "1 hour before it's due". */
  sentence: string;
}

export const NUDGE_OPTIONS: NudgeOption[] = [
  { minutes: null, label: "Don't remind me", sentence: "No reminder" },
  { minutes: 0, label: "At the time", sentence: "Right when it's due" },
  { minutes: 10, label: "10 min before", sentence: "10 minutes before it's due" },
  { minutes: 30, label: "30 min before", sentence: "30 minutes before it's due" },
  { minutes: 60, label: "1 hour before", sentence: "An hour before it's due" },
  { minutes: 180, label: "3 hours before", sentence: "3 hours before it's due" },
  { minutes: 1440, label: "1 day before", sentence: "The day before" },
  { minutes: 10080, label: "1 week before", sentence: "A week before" },
];

/** The default when someone switches a nudge on without choosing anything. */
export const DEFAULT_NUDGE_MINUTES = 30;

export function describeNudge(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "No reminder";
  const match = NUDGE_OPTIONS.find((o) => o.minutes === minutes);
  if (match) return match.sentence;
  // A value that isn't one of the presets (from an older row, or a future
  // custom picker) still needs to describe itself rather than showing a
  // bare number of minutes.
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? "" : "s"} before`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"} before`;
  }
  return `${minutes} minutes before`;
}

/** Short form for a list row: "1h before", "at time". */
export function shortNudge(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  if (minutes === 0) return "on time";
  if (minutes % 10080 === 0) return `${minutes / 10080}w before`;
  if (minutes % 1440 === 0) return `${minutes / 1440}d before`;
  if (minutes % 60 === 0) return `${minutes / 60}h before`;
  return `${minutes}m before`;
}

/**
 * The instant a notification should fire, given a deadline and an offset.
 * Returns null when there's nothing to schedule.
 */
export function nudgeInstant(
  dueAtIso: string | null | undefined,
  offsetMinutes: number | null | undefined
): string | null {
  if (!dueAtIso || offsetMinutes === null || offsetMinutes === undefined) return null;
  const due = new Date(dueAtIso);
  if (Number.isNaN(due.getTime())) return null;
  return new Date(due.getTime() - offsetMinutes * 60_000).toISOString();
}
