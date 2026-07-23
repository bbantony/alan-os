"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addDaysToDateString, todayInAppTimezone, zonedTimeToUtc } from "@/lib/time";
import { buildRRuleString, nextOccurrenceUtc, type RecurrenceOptions } from "@/lib/reminders/rrule";
import { sendPush, type PushSubscriptionRow } from "@/lib/push/send";
import {
  createEvent as gcalCreateEvent,
  deleteEvent as gcalDeleteEvent,
  getOwnGcalConnection,
  listEvents as gcalListEvents,
} from "@/lib/gcal/client";
import { getTasks } from "@/app/(app)/tasks/actions";
import type { Task } from "@/lib/tasks/types";
import type { Reminder, TopGoal } from "@/lib/reminders/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// ---------- Reminders ----------

export async function getReminders(): Promise<Reminder[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("reminders")
    .select("*")
    .eq("user_id", user.id)
    .neq("status", "done")
    .order("remind_at", { ascending: true });
  return (data as Reminder[]) ?? [];
}

async function mirrorReminderToGcal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  reminderId: string,
  title: string,
  remindAtIso: string
) {
  const connection = await getOwnGcalConnection();
  if (!connection) return;
  const start = new Date(remindAtIso);
  const end = new Date(start.getTime() + 15 * 60000);
  const event = await gcalCreateEvent(connection.refresh_token_encrypted, connection.calendar_id, {
    title,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    reminderMinutesBefore: 0,
  });
  await supabase.from("reminders").update({ gcal_event_id: event.id }).eq("id", reminderId).eq("user_id", userId);
}

export async function createReminder(input: {
  title: string;
  notes: string | null;
  remindAt: string; // ISO
  recurrence: RecurrenceOptions;
  mirrorToGcal: boolean;
  linkedTaskId?: string | null;
}): Promise<{ reminder?: Reminder; error?: string }> {
  const { supabase, user } = await requireUser();

  if (input.linkedTaskId) {
    const { data: task } = await supabase
      .from("tasks")
      .select("id")
      .eq("id", input.linkedTaskId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!task) return { error: "That task couldn't be found." };
  }

  const rrule = buildRRuleString(input.recurrence);

  const { data: reminder, error } = await supabase
    .from("reminders")
    .insert({
      user_id: user.id,
      title: input.title.trim(),
      notes: input.notes,
      remind_at: input.remindAt,
      rrule,
      mirror_to_gcal: input.mirrorToGcal,
      linked_task_id: input.linkedTaskId ?? null,
    })
    .select("*")
    .single();

  if (error || !reminder) return { error: error?.message ?? "Could not save reminder." };

  if (input.mirrorToGcal) {
    try {
      await mirrorReminderToGcal(supabase, user.id, reminder.id, input.title.trim(), input.remindAt);
    } catch {
      // Push delivery is the primary channel — a GCal mirror failure
      // shouldn't block saving the reminder itself.
    }
  }

  revalidatePath("/calendar");
  revalidatePath("/today");
  return { reminder: reminder as Reminder };
}

export async function updateReminder(input: {
  id: string;
  title: string;
  notes: string | null;
  remindAt: string;
  recurrence: RecurrenceOptions;
  mirrorToGcal: boolean;
}): Promise<{ reminder?: Reminder; error?: string }> {
  const { supabase, user } = await requireUser();
  const rrule = buildRRuleString(input.recurrence);

  const { data: reminder, error } = await supabase
    .from("reminders")
    .update({
      title: input.title.trim(),
      notes: input.notes,
      remind_at: input.remindAt,
      rrule,
      mirror_to_gcal: input.mirrorToGcal,
    })
    .eq("id", input.id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error || !reminder) return { error: error?.message ?? "Could not update reminder." };
  revalidatePath("/calendar");
  revalidatePath("/today");
  return { reminder: reminder as Reminder };
}

export async function pauseReminder(input: { id: string }) {
  const { supabase, user } = await requireUser();
  await supabase.from("reminders").update({ status: "paused" }).eq("id", input.id).eq("user_id", user.id);
  revalidatePath("/calendar");
}

export async function resumeReminder(input: { id: string }) {
  const { supabase, user } = await requireUser();
  await supabase.from("reminders").update({ status: "active" }).eq("id", input.id).eq("user_id", user.id);
  revalidatePath("/calendar");
}

export async function completeReminder(input: { id: string }) {
  const { supabase, user } = await requireUser();
  const { data: reminder } = await supabase
    .from("reminders")
    .select("rrule, remind_at")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .single();

  if (reminder?.rrule) {
    const next = nextOccurrenceUtc(reminder.rrule, new Date(reminder.remind_at));
    if (next) {
      await supabase
        .from("reminders")
        .update({ remind_at: next.toISOString(), status: "active" })
        .eq("id", input.id)
        .eq("user_id", user.id);
      revalidatePath("/calendar");
      return;
    }
  }

  await supabase.from("reminders").update({ status: "done" }).eq("id", input.id).eq("user_id", user.id);
  revalidatePath("/calendar");
  revalidatePath("/today");
}

export async function snoozeReminder(input: { id: string; minutes: number }) {
  const { supabase, user } = await requireUser();
  const remindAt = new Date(Date.now() + input.minutes * 60000).toISOString();
  await supabase
    .from("reminders")
    .update({ remind_at: remindAt, status: "active" })
    .eq("id", input.id)
    .eq("user_id", user.id);
  revalidatePath("/calendar");
}

export async function deleteReminder(input: { id: string }) {
  const { supabase, user } = await requireUser();
  const { data: reminder } = await supabase
    .from("reminders")
    .select("gcal_event_id")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();

  await supabase.from("reminders").delete().eq("id", input.id).eq("user_id", user.id);

  if (reminder?.gcal_event_id) {
    const connection = await getOwnGcalConnection();
    if (connection) {
      try {
        await gcalDeleteEvent(connection.refresh_token_encrypted, connection.calendar_id, reminder.gcal_event_id);
      } catch {
        // Reminder is already gone from our side either way.
      }
    }
  }

  revalidatePath("/calendar");
  revalidatePath("/today");
}

// One-tap "Remind me" from a task with a due date (Part B4-style hook).
export async function createReminderFromTask(input: { taskId: string }): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, due_at, rrule")
    .eq("id", input.taskId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!task || !task.due_at) return { error: "That task has no due date to remind you about." };

  const { data: existing } = await supabase
    .from("reminders")
    .select("id")
    .eq("linked_task_id", task.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return {};

  // Copies the task's own rrule, matching updateTask's reminder-upsert path —
  // otherwise a recurring task's bell-icon reminder would fire once and stop.
  await supabase.from("reminders").insert({
    user_id: user.id,
    title: task.title,
    remind_at: task.due_at,
    rrule: task.rrule,
    linked_task_id: task.id,
  });

  revalidatePath("/tasks");
  revalidatePath("/calendar");
  return {};
}

// ---------- Push subscriptions ----------

export async function getPushSubscriptions() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function savePushSubscription(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  deviceLabel: string;
}) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint: input.endpoint, keys: input.keys, device_label: input.deviceLabel },
      { onConflict: "endpoint" }
    );
  revalidatePath("/settings/calendar");
}

export async function removePushSubscription(input: { id: string }) {
  const { supabase, user } = await requireUser();
  await supabase.from("push_subscriptions").delete().eq("id", input.id).eq("user_id", user.id);
  revalidatePath("/settings/calendar");
}

export async function sendTestPush(): Promise<{ sent: number }> {
  const { supabase, user } = await requireUser();
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, keys")
    .eq("user_id", user.id);

  const result = await sendPush(
    (subs as PushSubscriptionRow[]) ?? [],
    { title: "Alan OS", body: "Test notification — push is working." },
    async (id) => {
      await supabase.from("push_subscriptions").delete().eq("id", id);
    }
  );
  return { sent: result.sent };
}

// ---------- Day-planner ritual ----------

export interface TodayFocusGoal extends TopGoal {
  done: boolean;
}

// Closes the loop the evening ritual never had: a picked goal now shows
// whether it actually got done, instead of being write-once/never-checked-
// again. Free-typed goals (taskId null) have no task to check against, so
// they just never show as done — that's an accepted limitation, not a bug.
export async function getTodayFocus(): Promise<{ source: "planned" | "auto"; goals: TodayFocusGoal[] }> {
  const { supabase, user } = await requireUser();
  const today = todayInAppTimezone();

  const { data: plan } = await supabase
    .from("day_plans")
    .select("top_goals")
    .eq("user_id", user.id)
    .eq("plan_date", today)
    .maybeSingle();

  const planned = (plan?.top_goals as TopGoal[] | undefined) ?? [];
  if (planned.length > 0) {
    const taskIds = planned.filter((g) => g.taskId).map((g) => g.taskId as string);
    let completedIds = new Set<string>();
    if (taskIds.length > 0) {
      const { data: completed } = await supabase
        .from("tasks")
        .select("id")
        .in("id", taskIds)
        .not("completed_at", "is", null);
      completedIds = new Set((completed ?? []).map((t) => t.id as string));
    }
    return {
      source: "planned",
      goals: planned.map((g) => ({ ...g, done: g.taskId ? completedIds.has(g.taskId) : false })),
    };
  }

  const tasks = await getTasks();
  const [y, m, d] = today.split("-").map(Number);
  const todayStartUtc = zonedTimeToUtc({ year: y, month: m, day: d, hour: 0, minute: 0, second: 0 });

  const overdue = tasks.filter((t) => t.due_at && new Date(t.due_at) < todayStartUtc);
  const overdueIds = new Set(overdue.map((t) => t.id));
  const todayHorizon = tasks.filter((t) => !overdueIds.has(t.id) && (t.horizon === "now" || t.horizon === "today"));

  const combined: Task[] = [...overdue, ...todayHorizon].slice(0, 3);
  return { source: "auto", goals: combined.map((t) => ({ taskId: t.id, title: t.title, done: false })) };
}

export async function getYesterdayReflection(): Promise<string | null> {
  const { supabase, user } = await requireUser();
  const yesterday = addDaysToDateString(todayInAppTimezone(), -1);
  const { data } = await supabase
    .from("day_plans")
    .select("evening_reflection")
    .eq("user_id", user.id)
    .eq("plan_date", yesterday)
    .maybeSingle();
  return data?.evening_reflection ?? null;
}

export async function planTomorrow(input: { goals: TopGoal[]; reflection: string | null }) {
  const { supabase, user } = await requireUser();
  const today = todayInAppTimezone();
  const tomorrow = addDaysToDateString(today, 1);

  if (input.goals.length > 0) {
    await supabase
      .from("day_plans")
      .upsert(
        { user_id: user.id, plan_date: tomorrow, top_goals: input.goals.slice(0, 3) },
        { onConflict: "user_id,plan_date" }
      );
  }

  const reflection = input.reflection?.trim();
  if (reflection) {
    await supabase
      .from("day_plans")
      .upsert(
        { user_id: user.id, plan_date: today, evening_reflection: reflection },
        { onConflict: "user_id,plan_date" }
      );
  }

  revalidatePath("/today");
}

// ---------- Google Calendar ----------

export async function getGcalStatus(): Promise<{ connected: boolean; calendarId: string | null; syncEnabled: boolean }> {
  const connection = await getOwnGcalConnection();
  if (!connection) return { connected: false, calendarId: null, syncEnabled: false };
  return { connected: true, calendarId: connection.calendar_id, syncEnabled: connection.sync_enabled };
}

export async function disconnectGcal() {
  const { supabase, user } = await requireUser();
  await supabase.from("gcal_connections").delete().eq("user_id", user.id);
  revalidatePath("/settings/calendar");
  revalidatePath("/calendar");
}

export async function setGcalSyncEnabled(input: { enabled: boolean }) {
  const { supabase, user } = await requireUser();
  await supabase.from("gcal_connections").update({ sync_enabled: input.enabled }).eq("user_id", user.id);
  revalidatePath("/settings/calendar");
}

export async function createCalendarEvent(input: {
  title: string;
  startIso: string;
  endIso: string;
}): Promise<{ error?: string }> {
  const connection = await getOwnGcalConnection();
  if (!connection || !connection.sync_enabled) return { error: "Connect Google Calendar first." };

  try {
    await gcalCreateEvent(connection.refresh_token_encrypted, connection.calendar_id, {
      title: input.title,
      startIso: input.startIso,
      endIso: input.endIso,
    });
  } catch {
    return { error: "Couldn't reach Google Calendar. Try again in a moment." };
  }

  revalidatePath("/calendar");
  return {};
}

export interface AgendaItem {
  id: string;
  title: string;
  time: string; // ISO
  source: "gcal" | "reminder" | "task";
  allDay?: boolean;
  htmlLink?: string | null;
}

export async function getAgenda(range: "today" | "week"): Promise<AgendaItem[]> {
  const { supabase, user } = await requireUser();
  const today = todayInAppTimezone();
  const [y, m, d] = today.split("-").map(Number);
  const rangeStart = zonedTimeToUtc({ year: y, month: m, day: d, hour: 0, minute: 0, second: 0 });
  const daysAhead = range === "today" ? 1 : 7;
  const rangeEnd = new Date(rangeStart.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const items: AgendaItem[] = [];

  const connection = await getOwnGcalConnection();
  if (connection && connection.sync_enabled) {
    try {
      const events = await gcalListEvents(
        connection.refresh_token_encrypted,
        connection.calendar_id,
        rangeStart.toISOString(),
        rangeEnd.toISOString()
      );
      for (const e of events) {
        items.push({ id: `gcal-${e.id}`, title: e.title, time: e.start, source: "gcal", allDay: e.allDay, htmlLink: e.htmlLink });
      }
    } catch {
      // Google unreachable — agenda still shows reminders/tasks below.
    }
  }

  const { data: reminders } = await supabase
    .from("reminders")
    .select("id, title, remind_at, linked_task_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .gte("remind_at", rangeStart.toISOString())
    .lt("remind_at", rangeEnd.toISOString());
  const taskIdsWithReminder = new Set(
    (reminders ?? []).filter((r) => r.linked_task_id).map((r) => r.linked_task_id as string)
  );
  for (const r of reminders ?? []) {
    items.push({ id: `reminder-${r.id}`, title: r.title, time: r.remind_at, source: "reminder" });
  }

  // A task with a linked reminder already has an entry above (from the
  // reminder itself, which is push-capable and richer) — skip it here so it
  // doesn't show twice.
  const tasks = await getTasks();
  for (const t of tasks) {
    if (!t.due_at || taskIdsWithReminder.has(t.id)) continue;
    const dueTime = new Date(t.due_at);
    if (dueTime >= rangeStart && dueTime < rangeEnd) {
      items.push({ id: `task-${t.id}`, title: t.title, time: t.due_at, source: "task" });
    }
  }

  items.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return items;
}

// ---------- Today dashboard ----------

export async function getCalendarDashboardSummary(): Promise<{
  nextEventTitle: string | null;
  nextEventTime: string | null;
  remindersDueToday: number;
}> {
  const { supabase, user } = await requireUser();
  const today = todayInAppTimezone();
  const [y, m, d] = today.split("-").map(Number);
  const todayStart = zonedTimeToUtc({ year: y, month: m, day: d, hour: 0, minute: 0, second: 0 });
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const { count: remindersDueToday } = await supabase
    .from("reminders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "active")
    .gte("remind_at", todayStart.toISOString())
    .lt("remind_at", todayEnd.toISOString());

  let nextEventTitle: string | null = null;
  let nextEventTime: string | null = null;
  const connection = await getOwnGcalConnection();
  if (connection && connection.sync_enabled) {
    try {
      const events = await gcalListEvents(
        connection.refresh_token_encrypted,
        connection.calendar_id,
        new Date().toISOString(),
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      );
      if (events[0]) {
        nextEventTitle = events[0].title;
        nextEventTime = events[0].start;
      }
    } catch {
      // Fine — widget just shows the reminder count.
    }
  }

  return { nextEventTitle, nextEventTime, remindersDueToday: remindersDueToday ?? 0 };
}
