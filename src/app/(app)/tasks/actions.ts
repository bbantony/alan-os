"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nextOccurrenceUtc } from "@/lib/reminders/rrule";
import { nudgeInstant } from "@/lib/tasks/nudge";
import { todayInAppTimezone, addDaysToDateString, zonedTimeToUtc } from "@/lib/time";
import { syncToGcal, removeFromGcal } from "@/lib/gcal/sync";
import type { Task, TaskCategory, TaskHorizon } from "@/lib/tasks/types";
import { friendlyDbError } from "@/lib/db-errors";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function getTasks(): Promise<Task[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .is("completed_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  return (data as Task[]) ?? [];
}

export async function getCompletedTasks(): Promise<Task[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(50);
  return (data as Task[]) ?? [];
}

export async function getWeeklyDoneCount(): Promise<number> {
  const { supabase, user } = await requireUser();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("completed_at", "is", null)
    .gte("completed_at", weekAgo);
  return count ?? 0;
}

// Per-horizon "done today" counts for the Tasks page's momentum header
// (e.g. "Today · 3") — a fresh page load's starting point; the client then
// tracks its own increments/decrements live as things get checked off in
// the same session, same pattern already used for streaks elsewhere.
export async function getTodayCompletionCountsByHorizon(): Promise<Record<TaskHorizon, number>> {
  const { supabase, user } = await requireUser();
  const today = todayInAppTimezone();
  const tomorrow = addDaysToDateString(today, 1);
  const [y, m, d] = today.split("-").map(Number);
  const [ty, tm, td] = tomorrow.split("-").map(Number);
  const todayStart = zonedTimeToUtc({ year: y, month: m, day: d, hour: 0, minute: 0, second: 0 }).toISOString();
  const todayEnd = zonedTimeToUtc({ year: ty, month: tm, day: td, hour: 0, minute: 0, second: 0 }).toISOString();

  const { data } = await supabase
    .from("tasks")
    .select("horizon")
    .eq("user_id", user.id)
    .not("completed_at", "is", null)
    .gte("completed_at", todayStart)
    .lt("completed_at", todayEnd);

  const counts: Record<TaskHorizon, number> = { now: 0, today: 0, this_week: 0, this_month: 0, someday: 0 };
  for (const row of data ?? []) {
    const h = row.horizon as TaskHorizon;
    counts[h] = (counts[h] ?? 0) + 1;
  }
  return counts;
}

/**
 * Brings a task's notification row in line with its due date and nudge offset.
 *
 * This is the single place a task-linked reminder is created, moved or removed,
 * which is the point: before, three different call sites each did their own
 * version of it and they drifted. A reminder is no longer something the user
 * edits — it's derived from `due_at` minus `notify_offset_minutes`, and this
 * function is the derivation.
 */
async function syncTaskNudge(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  taskId: string,
  title: string,
  dueAt: string | null,
  offsetMinutes: number | null,
  rrule: string | null
) {
  const fireAt = nudgeInstant(dueAt, offsetMinutes);

  const { data: existing } = await supabase
    .from("reminders")
    .select("id")
    .eq("linked_task_id", taskId)
    .eq("user_id", userId)
    .maybeSingle();

  // No nudge wanted (or nothing to hang it off) — remove any row that exists.
  if (!fireAt) {
    if (existing) {
      await supabase.from("reminders").delete().eq("id", existing.id).eq("user_id", userId);
    }
    return;
  }

  if (existing) {
    await supabase
      .from("reminders")
      .update({ title, remind_at: fireAt, rrule, status: "active" })
      .eq("id", existing.id)
      .eq("user_id", userId);
    return;
  }

  await supabase.from("reminders").insert({
    user_id: userId,
    title,
    remind_at: fireAt,
    rrule,
    linked_task_id: taskId,
  });
}

/**
 * Sets (or clears) a task's nudge on its own, for the bell on a task row.
 *
 * The row-level control is a shortcut, not the full editor — it flips between
 * "no reminder" and a sensible default. Choosing exactly how far ahead is what
 * the detail dialog is for.
 */
export async function setTaskNudge(input: {
  id: string;
  offsetMinutes: number | null;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();

  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, due_at, rrule")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!task) return { error: "That task no longer exists." };
  if (input.offsetMinutes !== null && !task.due_at) {
    return { error: "Give it a due date first, then I'll know when to remind you." };
  }

  await supabase
    .from("tasks")
    .update({ notify_offset_minutes: input.offsetMinutes })
    .eq("id", input.id)
    .eq("user_id", user.id);

  await syncTaskNudge(
    supabase,
    user.id,
    task.id as string,
    task.title as string,
    task.due_at as string | null,
    input.offsetMinutes,
    task.rrule as string | null
  );

  revalidatePath("/plan");
  return {};
}

export async function createTask(input: {
  id: string;
  title: string;
  horizon: TaskHorizon;
  category: TaskCategory;
  parentTaskId?: string | null;
  dueAt?: string | null;
  rrule?: string | null;
  /** Minutes before `dueAt` to notify. `null`/omitted = don't. */
  notifyOffsetMinutes?: number | null;
  notes?: string | null;
}) {
  const { supabase, user } = await requireUser();
  const offset = input.notifyOffsetMinutes ?? null;

  await supabase.from("tasks").insert({
    id: input.id,
    user_id: user.id,
    title: input.title,
    notes: input.notes ?? null,
    horizon: input.horizon,
    category: input.category,
    parent_task_id: input.parentTaskId ?? null,
    due_at: input.dueAt ?? null,
    rrule: input.rrule ?? null,
    notify_offset_minutes: offset,
  });

  await syncTaskNudge(
    supabase,
    user.id,
    input.id,
    input.title,
    input.dueAt ?? null,
    offset,
    input.rrule ?? null
  );

  // A subtask inherits the parent's own calendar slot conceptually — only
  // top-level tasks with their own due date get their own calendar entry,
  // matching how due dates/reminders already only apply at the top level.
  if (!input.parentTaskId && input.dueAt) {
    await syncToGcal({
      supabase,
      userId: user.id,
      table: "tasks",
      rowId: input.id,
      existingEventId: null,
      title: input.title,
      startIso: input.dueAt,
      // Google gets the same nudge, so a phone that has the app closed still
      // gets told — belt and braces on the app's own push.
      reminderMinutesBefore: offset,
    });
  }

  revalidatePath("/plan");
}

// Full-detail editor (horizon/category/due date/repeat/notes) — everything
// the old crammed task row used to expose inline now lives in one place,
// opened by tapping a task rather than scattered across the row itself.
export async function updateTask(input: {
  id: string;
  title: string;
  notes: string | null;
  horizon: TaskHorizon;
  category: TaskCategory;
  dueAt: string | null;
  rrule: string | null;
  /** Minutes before `dueAt` to notify. `null` = don't. */
  notifyOffsetMinutes: number | null;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const { data: existingTask } = await supabase
    .from("tasks")
    .select("gcal_event_id, parent_task_id")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("tasks")
    .update({
      title: input.title,
      notes: input.notes,
      horizon: input.horizon,
      category: input.category,
      due_at: input.dueAt,
      rrule: input.rrule,
      notify_offset_minutes: input.notifyOffsetMinutes,
    })
    .eq("id", input.id)
    .eq("user_id", user.id);
  if (error) return { error: friendlyDbError(error) ?? "That didn't save. Try again." };

  if (existingTask && !existingTask.parent_task_id) {
    await syncToGcal({
      supabase,
      userId: user.id,
      table: "tasks",
      rowId: input.id,
      existingEventId: existingTask.gcal_event_id,
      title: input.title,
      startIso: input.dueAt,
      reminderMinutesBefore: input.notifyOffsetMinutes,
    });
  }

  await syncTaskNudge(
    supabase,
    user.id,
    input.id,
    input.title,
    input.dueAt,
    input.notifyOffsetMinutes,
    input.rrule
  );

  revalidatePath("/plan");
  return {};
}

// Completing a recurring task spawns the next instance (same pattern every
// mainstream to-do app uses: Things, Todoist) rather than the task just
// vanishing forever — computed with the exact same DST-aware rrule math
// reminders already rely on.
export async function setTaskCompleted(input: { id: string; completed: boolean }): Promise<{ nextTask?: Task }> {
  const { supabase, user } = await requireUser();

  if (!input.completed) {
    await supabase
      .from("tasks")
      .update({ completed_at: null })
      .eq("id", input.id)
      .eq("user_id", user.id);

    // Un-ticking brings the nudge back, but only if its moment hasn't already
    // passed — reviving a notification for a time that's already gone by would
    // fire it immediately, which is noise rather than a reminder.
    await supabase
      .from("reminders")
      .update({ status: "active" })
      .eq("linked_task_id", input.id)
      .eq("user_id", user.id)
      .eq("status", "done")
      .gt("remind_at", new Date().toISOString());

    return {};
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();

  await supabase
    .from("tasks")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", input.id)
    .eq("user_id", user.id);

  if (task?.gcal_event_id) {
    await removeFromGcal({ supabase, userId: user.id, table: "tasks", rowId: input.id, existingEventId: task.gcal_event_id });
  }

  // Ticking a task off has to silence its nudge. It didn't, which is the same
  // bug as the deleted-task orphan wearing a different hat: finish something
  // on Thursday that's due Friday at 6pm, and Friday at 6pm you were still
  // told to do it. Marked done rather than deleted so un-ticking can revive it
  // (see the branch above).
  await supabase
    .from("reminders")
    .update({ status: "done" })
    .eq("linked_task_id", input.id)
    .eq("user_id", user.id)
    .eq("status", "active");

  if (!task?.rrule || !task.due_at) return {};

  const next = nextOccurrenceUtc(task.rrule, new Date(task.due_at));
  if (!next) return {};

  const newId = crypto.randomUUID();
  const { data: created } = await supabase
    .from("tasks")
    .insert({
      id: newId,
      user_id: user.id,
      title: task.title,
      notes: task.notes,
      horizon: task.horizon,
      category: task.category,
      due_at: next.toISOString(),
      rrule: task.rrule,
      parent_task_id: task.parent_task_id,
    })
    .select("*")
    .single();

  // Re-point any reminder that was tracking the just-completed instance at
  // the new one, so recurring tasks with a nudge on don't go silent after
  // their very first completion.
  //
  // Three things move together here, and previously only the first did: the
  // link, the status (the block above just marked it done, correctly, because
  // this instance *is* finished), and the time. Leaving `remind_at` pointing
  // at the occurrence that just completed meant the nudge for the next one was
  // already in the past, so it fired the moment the task was ticked off.
  await supabase
    .from("reminders")
    .update({
      linked_task_id: newId,
      status: "active",
      remind_at: next.toISOString(),
    })
    .eq("linked_task_id", input.id)
    .eq("user_id", user.id);

  if (!task.parent_task_id) {
    await syncToGcal({
      supabase,
      userId: user.id,
      table: "tasks",
      rowId: newId,
      existingEventId: null,
      title: task.title,
      startIso: next.toISOString(),
      // The next instance inherits the nudge, on Google's side too.
      reminderMinutesBefore: (task.notify_offset_minutes as number | null) ?? null,
    });
  }

  revalidatePath("/plan");
  return { nextTask: (created as Task) ?? undefined };
}

export async function deleteTask(input: { id: string }) {
  const { supabase, user } = await requireUser();
  const { data: existing } = await supabase
    .from("tasks")
    .select("gcal_event_id")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();

  // Any Google Calendar entries belonging to this task's reminders have to be
  // collected BEFORE the delete. Migration 0022 makes the database cascade
  // those reminder rows away, which is what finally stops them firing — but a
  // deleted row can't tell us afterwards which Google events to tidy up, so
  // they'd be stranded in Google Calendar. A task-linked reminder shouldn't
  // have its own mirror any more (entry 21), so this is normally empty; it's
  // here so the cascade can't silently leak.
  const { data: linkedReminders } = await supabase
    .from("reminders")
    .select("id, gcal_event_id")
    .eq("linked_task_id", input.id)
    .eq("user_id", user.id)
    .not("gcal_event_id", "is", null);

  await supabase.from("tasks").delete().eq("id", input.id).eq("user_id", user.id);

  if (existing?.gcal_event_id) {
    await removeFromGcal({ supabase, userId: user.id, table: "tasks", rowId: input.id, existingEventId: existing.gcal_event_id });
  }

  for (const reminder of linkedReminders ?? []) {
    await removeFromGcal({
      supabase,
      userId: user.id,
      table: "reminders",
      rowId: reminder.id as string,
      existingEventId: reminder.gcal_event_id as string,
    });
  }
}
