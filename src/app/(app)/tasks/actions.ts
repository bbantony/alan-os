"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nextOccurrenceUtc } from "@/lib/reminders/rrule";
import { todayInAppTimezone, addDaysToDateString, zonedTimeToUtc } from "@/lib/time";
import { syncToGcal, removeFromGcal } from "@/lib/gcal/sync";
import type { Task, TaskCategory, TaskHorizon } from "@/lib/tasks/types";

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

// Does this task have a linked reminder? (Used to show a bell state without
// a separate join everywhere the task list renders.)
export async function getTaskIdsWithReminders(): Promise<string[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("reminders")
    .select("linked_task_id")
    .eq("user_id", user.id)
    .not("linked_task_id", "is", null);
  return [...new Set((data ?? []).map((r) => r.linked_task_id as string))];
}

async function createLinkedReminder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  taskId: string,
  title: string,
  dueAt: string,
  rrule: string | null
) {
  await supabase.from("reminders").insert({
    user_id: userId,
    title,
    remind_at: dueAt,
    rrule,
    linked_task_id: taskId,
  });
}

export async function createTask(input: {
  id: string;
  title: string;
  horizon: TaskHorizon;
  category: TaskCategory;
  parentTaskId?: string | null;
  dueAt?: string | null;
  rrule?: string | null;
  remindMe?: boolean;
  notes?: string | null;
}) {
  const { supabase, user } = await requireUser();
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
  });

  if (input.remindMe && input.dueAt) {
    await createLinkedReminder(supabase, user.id, input.id, input.title, input.dueAt, input.rrule ?? null);
  }

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
    });
  }

  revalidatePath("/tasks");
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
  remindMe: boolean;
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
    })
    .eq("id", input.id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  if (existingTask && !existingTask.parent_task_id) {
    await syncToGcal({
      supabase,
      userId: user.id,
      table: "tasks",
      rowId: input.id,
      existingEventId: existingTask.gcal_event_id,
      title: input.title,
      startIso: input.dueAt,
    });
  }

  const { data: existingReminder } = await supabase
    .from("reminders")
    .select("id")
    .eq("linked_task_id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (input.remindMe && input.dueAt) {
    if (existingReminder) {
      await supabase
        .from("reminders")
        .update({ title: input.title, remind_at: input.dueAt, rrule: input.rrule, status: "active" })
        .eq("id", existingReminder.id);
    } else {
      await createLinkedReminder(supabase, user.id, input.id, input.title, input.dueAt, input.rrule);
    }
  } else if (!input.remindMe && existingReminder) {
    await supabase.from("reminders").delete().eq("id", existingReminder.id);
  }

  revalidatePath("/tasks");
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
  // the new one, so recurring tasks with "Remind me" on don't go silent
  // after their very first completion.
  await supabase
    .from("reminders")
    .update({ linked_task_id: newId })
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
    });
  }

  revalidatePath("/tasks");
  return { nextTask: (created as Task) ?? undefined };
}

export async function moveTaskHorizon(input: { id: string; horizon: TaskHorizon }) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("tasks")
    .update({ horizon: input.horizon })
    .eq("id", input.id)
    .eq("user_id", user.id);
}

export async function deleteTask(input: { id: string }) {
  const { supabase, user } = await requireUser();
  const { data: existing } = await supabase
    .from("tasks")
    .select("gcal_event_id")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();

  await supabase.from("tasks").delete().eq("id", input.id).eq("user_id", user.id);

  if (existing?.gcal_event_id) {
    await removeFromGcal({ supabase, userId: user.id, table: "tasks", rowId: input.id, existingEventId: existing.gcal_event_id });
  }
}
