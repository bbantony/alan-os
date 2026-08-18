"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayInAppTimezone } from "@/lib/time";
import { computeStreak } from "@/lib/streaks";
import { isDueOnDate, firstReminderInstant, type RecurrenceOptions, buildRRuleString } from "@/lib/reminders/rrule";
import { syncToGcal, removeFromGcal } from "@/lib/gcal/sync";
import type { TaskCategory } from "@/lib/tasks/types";
import type { Routine, RoutineCompletion, RoutineStep, RoutineWithProgress } from "@/lib/routines/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function getRoutines(): Promise<RoutineWithProgress[]> {
  const { supabase, user } = await requireUser();
  const today = todayInAppTimezone();

  const { data: routines } = await supabase
    .from("routines")
    .select("*")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (!routines || routines.length === 0) return [];

  const routineIds = routines.map((r) => r.id);
  const [{ data: steps }, { data: completions }, { data: linkedReminders }] = await Promise.all([
    supabase.from("routine_steps").select("*").in("routine_id", routineIds).order("sort_order", { ascending: true }),
    supabase.from("routine_completions").select("*").in("routine_id", routineIds).eq("user_id", user.id),
    supabase.from("reminders").select("linked_routine_id").in("linked_routine_id", routineIds).eq("user_id", user.id),
  ]);
  const remindedRoutineIds = new Set((linkedReminders ?? []).map((r) => r.linked_routine_id as string));

  const stepsByRoutine = new Map<string, RoutineStep[]>();
  for (const s of (steps as RoutineStep[]) ?? []) {
    const list = stepsByRoutine.get(s.routine_id) ?? [];
    list.push(s);
    stepsByRoutine.set(s.routine_id, list);
  }

  const completionsByRoutine = new Map<string, RoutineCompletion[]>();
  for (const c of (completions as RoutineCompletion[]) ?? []) {
    const list = completionsByRoutine.get(c.routine_id) ?? [];
    list.push(c);
    completionsByRoutine.set(c.routine_id, list);
  }

  return (routines as Routine[]).map((r) => {
    const routineCompletions = completionsByRoutine.get(r.id) ?? [];
    const dates = routineCompletions.map((c) => c.completed_date);
    return {
      ...r,
      steps: stepsByRoutine.get(r.id) ?? [],
      streak: computeStreak(dates, today),
      completedToday: routineCompletions.find((c) => c.completed_date === today) ?? null,
      hasReminder: remindedRoutineIds.has(r.id),
    };
  });
}

// Only routines actually scheduled for today (per rrule), for the Today
// Timeline and the Tasks page's "due today" framing — getRoutines() above
// returns everything active, for management views that show the full list.
export async function getRoutinesDueToday(): Promise<RoutineWithProgress[]> {
  const all = await getRoutines();
  const today = todayInAppTimezone();
  return all.filter((r) => isDueOnDate(r.rrule, r.created_at.slice(0, 10), today));
}

export async function createRoutine(input: {
  id: string;
  title: string;
  icon: string;
  category: TaskCategory;
  recurrence: RecurrenceOptions;
  timeOfDay?: string | null;
  steps: string[]; // at least one — a single-habit routine has exactly one, matching its own title
  remindMe?: boolean;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const rrule = buildRRuleString(input.recurrence) ?? "RRULE:FREQ=DAILY";

  const { error } = await supabase.from("routines").insert({
    id: input.id,
    user_id: user.id,
    title: input.title.trim(),
    icon: input.icon,
    category: input.category,
    rrule,
    time_of_day: input.timeOfDay ?? null,
  });
  if (error) return { error: error.message };

  const stepTitles = input.steps.length > 0 ? input.steps : [input.title.trim()];
  await supabase.from("routine_steps").insert(
    stepTitles.map((title, i) => ({
      routine_id: input.id,
      title: title.trim(),
      sort_order: i,
    }))
  );

  if (input.remindMe && input.timeOfDay) {
    const remindAt = firstReminderInstant(rrule, input.timeOfDay).toISOString();
    await supabase.from("reminders").insert({
      user_id: user.id,
      title: input.title.trim(),
      remind_at: remindAt,
      rrule,
      linked_routine_id: input.id,
    });
  }

  if (input.timeOfDay) {
    const startIso = firstReminderInstant(rrule, input.timeOfDay).toISOString();
    await syncToGcal({
      supabase,
      userId: user.id,
      table: "routines",
      rowId: input.id,
      existingEventId: null,
      title: input.title.trim(),
      startIso,
      recurrence: [rrule],
      // A routine fires at its time of day rather than ahead of it, so
      // Google's popup is 0 minutes before. Without this the app would nudge
      // you and Google would sit silent, which is the opposite of what "syncs
      // to Google Calendar" should mean.
      reminderMinutesBefore: input.remindMe ? 0 : null,
    });
  }

  revalidatePath("/tasks");
  revalidatePath("/today");
  return {};
}

export async function updateRoutine(input: {
  id: string;
  title: string;
  icon: string;
  category: TaskCategory;
  recurrence: RecurrenceOptions;
  timeOfDay?: string | null;
  steps: string[];
  remindMe?: boolean;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const rrule = buildRRuleString(input.recurrence) ?? "RRULE:FREQ=DAILY";
  const trimmedTitle = input.title.trim();

  const { data: existingRoutine } = await supabase
    .from("routines")
    .select("gcal_event_id")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("routines")
    .update({
      title: trimmedTitle,
      icon: input.icon,
      category: input.category,
      rrule,
      time_of_day: input.timeOfDay ?? null,
    })
    .eq("id", input.id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  const newStepTitles = (input.steps.length > 0 ? input.steps : [trimmedTitle]).map((s) => s.trim());
  const { data: currentSteps } = await supabase
    .from("routine_steps")
    .select("title")
    .eq("routine_id", input.id)
    .order("sort_order", { ascending: true });
  const currentTitles = (currentSteps ?? []).map((s) => s.title as string);
  if (JSON.stringify(currentTitles) !== JSON.stringify(newStepTitles)) {
    await supabase.from("routine_steps").delete().eq("routine_id", input.id);
    await supabase.from("routine_steps").insert(
      newStepTitles.map((title, i) => ({ routine_id: input.id, title, sort_order: i }))
    );
  }

  const { data: existingReminder } = await supabase
    .from("reminders")
    .select("id")
    .eq("linked_routine_id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (input.remindMe && input.timeOfDay) {
    const remindAt = firstReminderInstant(rrule, input.timeOfDay).toISOString();
    if (existingReminder) {
      await supabase
        .from("reminders")
        .update({ title: trimmedTitle, remind_at: remindAt, rrule, status: "active" })
        .eq("id", existingReminder.id);
    } else {
      await supabase.from("reminders").insert({
        user_id: user.id,
        title: trimmedTitle,
        remind_at: remindAt,
        rrule,
        linked_routine_id: input.id,
      });
    }
  } else if (existingReminder) {
    await supabase.from("reminders").delete().eq("id", existingReminder.id);
  }

  const startIso = input.timeOfDay ? firstReminderInstant(rrule, input.timeOfDay).toISOString() : null;
  await syncToGcal({
    supabase,
    userId: user.id,
    table: "routines",
    rowId: input.id,
    existingEventId: existingRoutine?.gcal_event_id ?? null,
    title: trimmedTitle,
    startIso,
    recurrence: [rrule],
    reminderMinutesBefore: input.remindMe && input.timeOfDay ? 0 : null,
  });

  revalidatePath("/tasks");
  revalidatePath("/today");
  return {};
}

export async function archiveRoutine(input: { id: string }) {
  const { supabase, user } = await requireUser();
  const { data: existing } = await supabase
    .from("routines")
    .select("gcal_event_id")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();

  await supabase.from("routines").update({ active: false }).eq("id", input.id).eq("user_id", user.id);
  await supabase.from("reminders").delete().eq("linked_routine_id", input.id).eq("user_id", user.id);

  if (existing?.gcal_event_id) {
    await removeFromGcal({ supabase, userId: user.id, table: "routines", rowId: input.id, existingEventId: existing.gcal_event_id });
  }

  revalidatePath("/tasks");
  revalidatePath("/today");
}

export async function completeRoutineToday(input: {
  routineId: string;
  stepsDone: string[];
}): Promise<{ streak: { current: number; longest: number } }> {
  const { supabase, user } = await requireUser();
  const today = todayInAppTimezone();

  await supabase.from("routine_completions").upsert(
    {
      routine_id: input.routineId,
      user_id: user.id,
      completed_date: today,
      steps_done: input.stepsDone,
    },
    { onConflict: "routine_id,completed_date" }
  );

  const { data: completions } = await supabase
    .from("routine_completions")
    .select("completed_date")
    .eq("routine_id", input.routineId)
    .eq("user_id", user.id);

  const streak = computeStreak((completions ?? []).map((c) => c.completed_date as string), today);
  revalidatePath("/tasks");
  revalidatePath("/today");
  return { streak };
}

export async function uncompleteRoutineToday(input: { routineId: string }) {
  const { supabase, user } = await requireUser();
  const today = todayInAppTimezone();
  await supabase
    .from("routine_completions")
    .delete()
    .eq("routine_id", input.routineId)
    .eq("user_id", user.id)
    .eq("completed_date", today);
  revalidatePath("/tasks");
  revalidatePath("/today");
}

// The "you keep adding this — make it a routine?" nudge: a task title
// (trimmed/lowercased) created 3+ times in the last 45 days, none of which
// are currently open with a routine already covering the same title. Plain
// SQL frequency counting, no AI — matching the "AI is Phase 7" boundary held
// all session.
export interface RoutineSuggestion {
  title: string;
  count: number;
}

export async function getRoutineSuggestions(): Promise<RoutineSuggestion[]> {
  const { supabase, user } = await requireUser();
  const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: tasks }, { data: routines }] = await Promise.all([
    supabase
      .from("tasks")
      .select("title, created_at")
      .eq("user_id", user.id)
      .is("parent_task_id", null)
      .gte("created_at", since),
    supabase.from("routines").select("title").eq("user_id", user.id).eq("active", true),
  ]);

  const routineTitles = new Set((routines ?? []).map((r) => (r.title as string).trim().toLowerCase()));
  const counts = new Map<string, { title: string; count: number }>();
  for (const t of tasks ?? []) {
    const key = (t.title as string).trim().toLowerCase();
    if (!key || routineTitles.has(key)) continue;
    const existing = counts.get(key);
    counts.set(key, { title: (t.title as string).trim(), count: (existing?.count ?? 0) + 1 });
  }

  return [...counts.values()].filter((c) => c.count >= 3).sort((a, b) => b.count - a.count);
}
