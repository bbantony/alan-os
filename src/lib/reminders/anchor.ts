// Where a repeating reminder should fire NEXT — computed from the schedule it
// actually belongs to, not from where it happens to be pointing right now.
//
// THE RULE THIS FILE EXISTS FOR: SNOOZING MOVES ONLY THIS OCCURRENCE, NEVER
// THE SERIES. Snooze a daily 07:00 nudge by an hour and you get it at 08:05
// today and at 07:00 tomorrow — not 08:05 forever.
//
// That used to be false. `reminders.remind_at` is a mutable next-fire pointer
// (migration 0011 says so in as many words) and snooze writes straight to it,
// but every site that advanced a repeating reminder stepped from that pointer:
// nextOccurrenceUtc(rrule, remind_at). So a snooze silently re-anchored the
// series, and did it again on every later snooze. The reminder's own `rrule`
// is only ever a copy of its parent's, so the repeat PATTERN survived; the
// TIME OF DAY did not, and that only ever lived on the parent row.
//
// So the next fire time is recomputed from the parent every time:
//   routine-linked  the routine's own rrule + time_of_day
//   task-linked     the task's due_at minus its notify_offset_minutes
// Both of those are themselves kept on-schedule by the code that owns them (a
// routine is one stable row forever; completeTask rolls due_at forward with
// nextFutureOccurrenceUtc), so neither can be dragged along by a snooze.
//
// Recomputing rather than stepping is also what un-eats a lost occurrence. The
// dispatcher advances remind_at AFTER sending the push, so a notification's
// Snooze lands on a row that already points at the next real occurrence and
// overwrites it. Stepping from the snoozed pointer would skip that occurrence
// for good; recomputing from the parent finds it again.
import { firstReminderInstant, nextFutureOccurrenceUtc } from "./rrule.ts";
import { nudgeInstant } from "../tasks/nudge.ts";

/**
 * One reminder plus its parent's scheduling fields — exactly the shape the
 * `get_reminder_anchors` RPC returns (migration 0039), and equally the shape a
 * session-authed caller can build from a `reminders` select with the parents
 * embedded. Snake_case matches both.
 */
export interface ReminderAnchorRow {
  /** The reminder's own repeat rule. Null means a one-off. */
  rrule: string | null;
  /** UTC ISO. The CURRENT pointer, which may be a snooze landing spot. */
  remind_at: string;
  linked_task_id: string | null;
  linked_routine_id: string | null;
  routine_rrule?: string | null;
  /** Bare "HH:MM:SS" wall clock in the app timezone, not an instant. */
  routine_time_of_day?: string | null;
  /**
   * UTC ISO. The routine's own start date, which is what an "every N days"
   * rule counts from — see trueAnchor below. Added to `get_reminder_anchors`
   * by migration 0040; absent on a row built before that, which falls back to
   * the old today-anchored behaviour rather than failing.
   */
  routine_created_at?: string | null;
  task_due_at?: string | null;
  task_notify_offset_minutes?: number | null;
}

export interface ReminderNextState {
  /** UTC ISO to write to remind_at, or null to leave it exactly as it is. */
  remindAt: string | null;
  status: "active" | "done";
  /**
   * Which anchor produced the answer. Not used for control flow — it exists so
   * a caller can say why a reminder went where it did without re-deriving it.
   */
  from: "routine" | "task" | "fallback" | "one_off" | "orphan" | "exhausted" | "unreadable";
}

/**
 * Where a reminder goes after it has just fired (or just been dealt with).
 *
 * Timestamps in and out are UTC ISO; nothing here converts to a local zone.
 * The app timezone is applied inside firstReminderInstant/nextOccurrenceUtc,
 * which is where wall-clock times and DST are resolved.
 */
export function nextReminderState(row: ReminderAnchorRow, now: Date = new Date()): ReminderNextState {
  // 0022'S INVARIANT, ENFORCED RATHER THAN ASSUMED. A reminder attached to
  // neither a task nor a routine must not exist — the whole point of that
  // migration is that an orphan has nothing left to trace it back to and so
  // fires forever. If one somehow appears, it is retired here and never
  // resurrected, whatever its rrule says.
  if (!row.linked_task_id && !row.linked_routine_id) {
    return { remindAt: null, status: "done", from: "orphan" };
  }

  // A one-off is finished when it fires. Nothing to advance.
  if (!row.rrule) {
    return { remindAt: null, status: "done", from: "one_off" };
  }

  const anchored = trueAnchor(row, now);
  if (anchored) {
    return { remindAt: anchored.at.toISOString(), status: "active", from: anchored.from };
  }

  // FALLBACK: the parent exists but carries no usable anchor (a routine with
  // no time of day, a task whose due date or nudge offset was cleared). Roll
  // forward from the current pointer rather than stepping once, so a reminder
  // recovered after the pinger was down for a week does not spend that week
  // firing catch-up copies of itself. This is the old behaviour at worst,
  // never worse than it.
  // Guarded, and the guard is load-bearing. A reminder's rrule is only ever a
  // copy of its parent's, so the realistic broken row has the SAME unusable
  // rule in both places: the parent parse fails above, and re-parsing the
  // identical string here threw straight out of this function — taking down
  // the whole dispatch batch with it, which is the one failure this helper
  // exists to make impossible.
  //
  // Retired rather than left active, on evidence: `advance_reminder` coalesces
  // a null remind_at, i.e. leaves the pointer alone. An unschedulable reminder
  // kept active therefore keeps a past pointer and re-fires on EVERY tick,
  // forever. Going quiet is the lesser harm — and a rule that cannot be parsed
  // cannot be honoured anyway. `from` says which of the two happened so a
  // future reader can tell a finished series from a broken one.
  let next: Date | null = null;
  try {
    next = nextFutureOccurrenceUtc(row.rrule, new Date(row.remind_at), now);
  } catch {
    return { remindAt: null, status: "done", from: "unreadable" };
  }
  if (!next) {
    // The rule genuinely ran out (COUNT/UNTIL). Retire it.
    return { remindAt: null, status: "done", from: "exhausted" };
  }
  return { remindAt: next.toISOString(), status: "active", from: "fallback" };
}

function trueAnchor(row: ReminderAnchorRow, now: Date): { at: Date; from: "routine" | "task" } | null {
  try {
    if (row.linked_routine_id && row.routine_rrule && row.routine_time_of_day) {
      // firstReminderInstant already answers "the next time this routine's
      // time of day comes round on a day the rule allows", including today
      // when today still has that slot ahead of it. That is precisely the
      // question here, which is why this is the same call routines/actions.ts
      // makes when it creates the reminder in the first place — one
      // implementation of "when does this routine next want me".
      //
      // The routine's created_at is passed as the series' start date because
      // "a day the rule allows" is not a property of the rule alone. "Every 3
      // days" needs a day to count from, and the routine counts from its own
      // created_at everywhere else it decides whether it is due (the "due
      // today" filter and the streak maths in routines/actions.ts). Anchoring
      // on today instead — which is what this did before migration 0040 —
      // made a reminder dealt with on a non-due day re-anchor the series onto
      // the wrong set of days, permanently: created Tue 1 Sep, every 3 days,
      // fires Fri 4th, snoozed into Sat 5th, next fire Tue 8th instead of Mon
      // 7th. Sliced to a plain date exactly as routines/actions.ts slices it,
      // so both sides read the same value the same way.
      const at = firstReminderInstant(
        row.routine_rrule,
        row.routine_time_of_day,
        now,
        row.routine_created_at ? row.routine_created_at.slice(0, 10) : null
      );
      return at > now ? { at, from: "routine" } : null;
    }

    if (
      row.linked_task_id &&
      row.task_due_at &&
      row.task_notify_offset_minutes !== null &&
      row.task_notify_offset_minutes !== undefined
    ) {
      const base = nudgeInstant(row.task_due_at, row.task_notify_offset_minutes);
      if (!base) return null;
      const baseDate = new Date(base);
      if (Number.isNaN(baseDate.getTime())) return null;

      // A repeating task's due_at is rolled forward by completeTask, so it is
      // usually ALREADY the next occurrence — in which case its nudge instant
      // is the answer, and stepping again would skip a whole cycle. Only step
      // when the anchor is behind us.
      if (baseDate > now) return { at: baseDate, from: "task" };

      const next = nextFutureOccurrenceUtc(row.rrule as string, baseDate, now);
      return next ? { at: next, from: "task" } : null;
    }
  } catch {
    // A malformed rrule on the parent must not take the dispatcher down for
    // every other reminder in the batch. The caller falls back.
    return null;
  }
  return null;
}

/**
 * Where a SNOOZE should move a reminder to, given the moment it was asked for.
 *
 * The snooze target normally wins outright: the point of snoozing is to be
 * asked again then. The one exception is the reason this is a function rather
 * than a bare assignment — a repeating reminder whose pointer already sits on
 * a genuine future occurrence SOONER than the snooze target must keep it.
 * Otherwise "remind me in an hour" on an hourly nudge would overwrite the
 * occurrence due in 55 minutes and quietly delete it from the series.
 *
 * Everything else a snooze disturbs is repaired by nextReminderState() the
 * next time the reminder is dealt with: the series is recomputed from the
 * parent, so it lands back on its true schedule rather than on the snooze.
 */
export function snoozeTargetFor(
  row: Pick<ReminderAnchorRow, "rrule" | "remind_at">,
  target: Date,
  now: Date = new Date()
): Date {
  if (!row.rrule) return target;
  const pointer = new Date(row.remind_at);
  if (Number.isNaN(pointer.getTime())) return target;
  return pointer > now && pointer < target ? pointer : target;
}
