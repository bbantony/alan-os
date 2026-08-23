"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addDaysToDateString, todayInAppTimezone, zonedTimeToUtc } from "@/lib/time";
import { sendPush, type PushSubscriptionRow } from "@/lib/push/send";
import { getOwnGcalConnection, listEvents as gcalListEvents } from "@/lib/gcal/client";
import { backfillGcalSync, type GcalSyncSummary } from "@/lib/gcal/sync";
import { getTasks } from "@/app/(app)/tasks/actions";
import type { Task } from "@/lib/tasks/types";
import type { TopGoal } from "@/lib/reminders/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
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
  // /calendar is a redirect stub now, so revalidating it did nothing. Plan is
  // what actually renders synced events.
  revalidatePath("/plan");
}

export async function setGcalSyncEnabled(input: { enabled: boolean }) {
  const { supabase, user } = await requireUser();
  await supabase.from("gcal_connections").update({ sync_enabled: input.enabled }).eq("user_id", user.id);
  revalidatePath("/settings/calendar");
}

// Manual retry for whatever the one-time backfill-on-connect missed or
// failed on (e.g. a transient Google API error) — same idempotent function,
// just re-triggerable without disconnecting and reconnecting.
export async function retryGcalSync(): Promise<GcalSyncSummary> {
  const { supabase, user } = await requireUser();
  const result = await backfillGcalSync(supabase, user.id);
  revalidatePath("/settings/calendar");
  return result;
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
