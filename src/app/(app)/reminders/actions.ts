"use server";

// The nudges, given a face.
//
// Until now a reminder had no interface anywhere in the app. It is a DERIVED
// row (see lib/tasks/nudge.ts and migration 0023): a task's `due_at` minus its
// `notify_offset_minutes`, or a routine's time of day, written into `reminders`
// only so the cron dispatcher has something to claim. Nothing showed Alan the
// list of nudges heading his way, and the only snooze was a button on the
// notification itself, hardcoded to one hour.
//
// This file changes none of that derivation. It reads the queue and offers the
// two things you can do to a nudge that has already been aimed at you: push it
// back, or silence it. Creating, moving and deleting a nudge still belongs
// exclusively to `tasks/actions.ts` (syncTaskNudge) and `routines/actions.ts` —
// do not add a create or delete here, or migration 0022's invariant (a reminder
// linked to neither a task nor a routine must never exist) stops being
// enforceable from one place.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolvePreferences } from "@/lib/preferences";
import { nextReminderState, snoozeTargetFor } from "@/lib/reminders/anchor";
import { isSnoozePreset, snoozeUntilUtc, type SnoozePreset } from "@/lib/reminders/snooze";
import { APP_TIMEZONE } from "@/lib/time";
import { friendlyDbError } from "@/lib/db-errors";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// ---------------------------------------------------------------------------
// Reading the queue
// ---------------------------------------------------------------------------

/** The task a nudge is for, when it has one. Null for routine nudges. */
export interface UpcomingReminderTask {
  id: string;
  title: string;
  /** UTC ISO. Render with lib/time.ts — never converted here. */
  dueAt: string | null;
  /** Minutes before `dueAt` this nudge was set for; feed to describeNudge(). */
  notifyOffsetMinutes: number | null;
}

/** The routine a nudge is for, when it has one. Null for task nudges. */
export interface UpcomingReminderRoutine {
  id: string;
  title: string;
  /** A bare "HH:MM:SS" wall-clock time in the profile's timezone, not an instant. */
  timeOfDay: string | null;
}

export interface UpcomingReminder {
  id: string;
  title: string;
  notes: string | null;
  /** UTC ISO — the moment it will fire. Convert at display time only. */
  remindAt: string;
  /** `remind_at` is already in the past. Also what splits the two arrays below. */
  isOverdue: boolean;
  /** Raw RRULE text when it repeats; pass to describeRRule() to say it in words. */
  rrule: string | null;
  /** UTC ISO of the last time this actually pushed, or null if it never has. */
  lastFiredAt: string | null;
  /**
   * What the nudge hangs off. "unattached" should be impossible — migration
   * 0022 cascades a reminder away with its task or routine precisely because an
   * orphan fires forever — but it is surfaced rather than hidden so that if one
   * ever does appear, there is a screen it can be silenced from.
   */
  source: "task" | "routine" | "unattached";
  task: UpcomingReminderTask | null;
  routine: UpcomingReminderRoutine | null;
}

export interface UpcomingReminders {
  /** Should already have fired. Soonest first. */
  overdue: UpcomingReminder[];
  /** Still to come, inside the horizon. Soonest first. */
  upcoming: UpcomingReminder[];
}

// HOW FAR AHEAD, AND WHY THERE IS A LIMIT AT ALL.
//
// A repeating nudge is a single row holding only its NEXT fire time, so the
// horizon never truncates a series — it only decides how far out a one-off
// nudge starts being worth mentioning. A task due next August with a "1 week
// before" nudge is real, correct, and of no use whatsoever on a panel about
// what is coming up; a fortnight is roughly the span a person plans over, and
// it matches the outlook the bills panel already uses.
//
// The row cap is a second, separate guard: overdue nudges have no lower bound
// (an overdue nudge is exactly the thing that must not be hidden), so a stretch
// where the cron pinger was down could otherwise return an unbounded pile.
const HORIZON_DAYS = 14;
const MAX_ROWS = 100;

interface EmbeddedTask {
  id: string;
  title: string;
  due_at: string | null;
  notify_offset_minutes: number | null;
}

interface EmbeddedRoutine {
  id: string;
  title: string;
  time_of_day: string | null;
}

interface ReminderRow {
  id: string;
  title: string;
  notes: string | null;
  remind_at: string;
  rrule: string | null;
  last_fired_at: string | null;
  linked_task_id: string | null;
  linked_routine_id: string | null;
  tasks: EmbeddedTask | null;
  routines: EmbeddedRoutine | null;
}

/**
 * Every nudge queued for this account: anything overdue, plus the next two
 * weeks. Both arrays are sorted soonest-first, and each row also carries
 * `isOverdue`, so a caller that wants one flat list can concatenate them and
 * still tell the two apart.
 *
 * Only `status = 'active'` rows are returned. 'done' is a nudge that has fired
 * (or been silenced) and 'paused' is a status nothing currently writes — either
 * way, neither is coming for you, which is what this list is about.
 */
export async function getUpcomingReminders(): Promise<UpcomingReminders> {
  const { supabase, user } = await requireUser();

  const horizonEnd = new Date(Date.now() + HORIZON_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // The two embeds resolve through `linked_task_id` and `linked_routine_id`
  // (the only foreign keys from reminders to either table), and they are what
  // lets the panel say "Renew passport — 30 minutes before it's due" instead of
  // repeating a bare title that means nothing on its own.
  const { data } = await supabase
    .from("reminders")
    .select(
      "id, title, notes, remind_at, rrule, last_fired_at, linked_task_id, linked_routine_id, " +
        "tasks(id, title, due_at, notify_offset_minutes), routines(id, title, time_of_day)"
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .lte("remind_at", horizonEnd)
    .order("remind_at", { ascending: true })
    .limit(MAX_ROWS);

  const now = Date.now();
  const overdue: UpcomingReminder[] = [];
  const upcoming: UpcomingReminder[] = [];

  for (const raw of (data ?? []) as unknown as ReminderRow[]) {
    const isOverdue = new Date(raw.remind_at).getTime() <= now;
    const reminder: UpcomingReminder = {
      id: raw.id,
      title: raw.title,
      notes: raw.notes,
      remindAt: raw.remind_at,
      isOverdue,
      rrule: raw.rrule,
      lastFiredAt: raw.last_fired_at,
      source: raw.linked_task_id ? "task" : raw.linked_routine_id ? "routine" : "unattached",
      task: raw.tasks
        ? {
            id: raw.tasks.id,
            title: raw.tasks.title,
            dueAt: raw.tasks.due_at,
            notifyOffsetMinutes: raw.tasks.notify_offset_minutes,
          }
        : null,
      routine: raw.routines
        ? { id: raw.routines.id, title: raw.routines.title, timeOfDay: raw.routines.time_of_day }
        : null,
    };
    (isOverdue ? overdue : upcoming).push(reminder);
  }

  return { overdue, upcoming };
}

// ---------------------------------------------------------------------------
// Acting on one
// ---------------------------------------------------------------------------

const GONE_MESSAGE =
  "That reminder isn't waiting any more — it may already be done, or the thing it belonged to was deleted.";

/**
 * Pushes a nudge back by one of the four allowed amounts.
 *
 * This is the in-app snooze, authenticated by the session. The separate
 * token-authed route (`/api/reminders/[id]/snooze`) keeps its own job: it is
 * tapped from a push notification, where there is no session to check, and it
 * is deliberately fixed at one hour to match that button's own label. Both now
 * apply the same "never write over a sooner real occurrence" guard from
 * lib/reminders/anchor.ts.
 *
 * Only 'active' nudges can be snoozed, and the status is left alone — snoozing
 * moves WHEN something fires, it does not resurrect something already finished.
 */
export async function snoozeReminder(
  id: string,
  preset: SnoozePreset
): Promise<{ error?: string; remindAt?: string }> {
  const { supabase, user } = await requireUser();

  if (!isSnoozePreset(preset)) {
    return {
      error:
        "That's not one of the snooze choices. Pick 10 minutes, an hour, 4 hours, or the morning.",
    };
  }

  // Timezone from the profile, never a constant: the morning preset has to mean
  // morning where Alan says he lives. Quiet hours come along for the ride so a
  // morning snooze doesn't land inside a window where nothing is allowed to
  // fire (see morningHourFor in lib/reminders/snooze.ts).
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, preferences")
    .eq("id", user.id)
    .maybeSingle();

  const timezone = (profile?.timezone as string) || APP_TIMEZONE;
  const preferences = resolvePreferences(profile?.preferences);
  const until = snoozeUntilUtc(preset, preferences.notifications, timezone);

  // SNOOZING MOVES ONLY THIS OCCURRENCE, NEVER THE SERIES.
  //
  // Two halves to that. The dispatcher advances `remind_at` AFTER it pushes,
  // so a repeating nudge may already be pointing at its next genuine
  // occurrence by the time this is called — writing the snooze over one that
  // lands sooner than the snooze itself would delete that occurrence, so
  // snoozeTargetFor keeps the sooner of the two. And whatever does get
  // written, the series is recomputed from the parent's own schedule the next
  // time the nudge is dealt with (lib/reminders/anchor.ts), so a snoozed time
  // can never become the new schedule the way it used to.
  const { data: current } = await supabase
    .from("reminders")
    .select("rrule, remind_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!current) return { error: GONE_MESSAGE };

  const target = snoozeTargetFor(
    { rrule: current.rrule as string | null, remind_at: current.remind_at as string },
    until
  );

  const { data: updated, error } = await supabase
    .from("reminders")
    .update({ remind_at: target.toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .select("id, remind_at")
    .maybeSingle();

  const message = friendlyDbError(error);
  if (message) return { error: message };
  if (!updated) return { error: GONE_MESSAGE };

  revalidatePath("/plan");
  revalidatePath("/today");
  // The stored instant goes back to the caller, read off the row that was just
  // written rather than reconstructed here. The screen guesses the new time so
  // the row moves the moment you tap, and that guess can be wrong by design —
  // snoozeTargetFor above keeps a sooner genuine occurrence, so "4 hours" on a
  // nudge already due in two stores two. Without this the row and the
  // confirmation would show a time the database never held.
  return { remindAt: updated.remind_at as string };
}

/**
 * Silences a nudge. It does NOT complete the task or routine behind it.
 *
 * That distinction is the whole point: a nudge is a reminder to do a thing, not
 * the thing. Ticking the task off is what completes the task, and doing that
 * already silences its nudge on the way past (completeTask in
 * tasks/actions.ts). Making "Done" on the reminder complete the task as well
 * would mean two different screens can tick something off, one of them without
 * ever showing what was being agreed to.
 *
 * "Silenced" is not the same as "gone forever", and what it means depends on
 * whether the nudge repeats:
 *
 *   one-off      status -> 'done'. Exactly what the dispatcher does after it
 *                fires, and what completeTask does when the task is ticked off.
 *
 *   repeating    this occurrence is dropped and `remind_at` moves to the next
 *                one, still 'active'. 'done' on a repeating nudge would kill
 *                every future occurrence with no way back except editing the
 *                task or routine — the same "silently stops working forever"
 *                shape that migration 0022 exists to prevent. The next
 *                occurrence is recomputed from the PARENT's own schedule (the
 *                routine's rrule and time of day, or the task's due date minus
 *                its nudge offset) rather than stepped from `remind_at`, so a
 *                nudge that had been snoozed snaps back to the time it is
 *                actually asked for instead of keeping the snoozed time
 *                forever. That rule — snoozing moves only this occurrence,
 *                never the series — lives in one place for all four callers:
 *                lib/reminders/anchor.ts.
 */
export async function completeReminder(
  id: string
): Promise<{ error?: string; remindAt?: string }> {
  const { supabase, user } = await requireUser();

  const { data: row } = await supabase
    .from("reminders")
    .select(
      "id, rrule, remind_at, linked_task_id, linked_routine_id, " +
        "routines(rrule, time_of_day, created_at), tasks(due_at, notify_offset_minutes)"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!row) return { error: GONE_MESSAGE };

  const joined = row as unknown as {
    rrule: string | null;
    remind_at: string;
    linked_task_id: string | null;
    linked_routine_id: string | null;
    routines: { rrule: string | null; time_of_day: string | null; created_at: string | null } | null;
    tasks: { due_at: string | null; notify_offset_minutes: number | null } | null;
  };

  const next = nextReminderState({
    rrule: joined.rrule,
    remind_at: joined.remind_at,
    linked_task_id: joined.linked_task_id,
    linked_routine_id: joined.linked_routine_id,
    routine_rrule: joined.routines?.rrule ?? null,
    routine_time_of_day: joined.routines?.time_of_day ?? null,
    // The series' start date. This runs with a live session, so unlike the
    // three notification routes it can simply read it — and it must, or the
    // "every N days" drift that migration 0040 exists to kill would survive
    // in the one path this wave actually added a button for.
    routine_created_at: joined.routines?.created_at ?? null,
    task_due_at: joined.tasks?.due_at ?? null,
    task_notify_offset_minutes: joined.tasks?.notify_offset_minutes ?? null,
  });

  const patch: { status?: "done"; remind_at?: string } = next.remindAt
    ? { remind_at: next.remindAt }
    : { status: "done" };

  const { data: updated, error } = await supabase
    .from("reminders")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .select("id, remind_at, status")
    .maybeSingle();

  const message = friendlyDbError(error);
  if (message) return { error: message };
  if (!updated) return { error: GONE_MESSAGE };

  revalidatePath("/plan");
  revalidatePath("/today");
  // WHEN IT COMES BACK, READ OFF THE ROW THAT WAS JUST WRITTEN — the same
  // contract snoozeReminder has, and for the same reason. The screen used to
  // say a repeating nudge "comes round again (every day)" without naming a
  // time, and "every day" can honestly mean "in forty minutes": an overdue
  // repeating nudge is rescheduled from its parent's schedule, which may hand
  // back today's slot if that slot is still ahead. Only sent for a reminder
  // that is still active — a one-off has just been retired and has no next
  // time to name.
  const stillActive = (updated.status as string) === "active";
  return stillActive ? { remindAt: updated.remind_at as string } : {};
}
