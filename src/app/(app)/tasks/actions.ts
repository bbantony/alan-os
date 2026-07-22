"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

export async function createTask(input: {
  id: string;
  title: string;
  horizon: TaskHorizon;
  category: TaskCategory;
  parentTaskId?: string | null;
  dueAt?: string | null;
}) {
  const { supabase, user } = await requireUser();
  await supabase.from("tasks").insert({
    id: input.id,
    user_id: user.id,
    title: input.title,
    horizon: input.horizon,
    category: input.category,
    parent_task_id: input.parentTaskId ?? null,
    due_at: input.dueAt ?? null,
  });
}

export async function setTaskCompleted(input: { id: string; completed: boolean }) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("tasks")
    .update({ completed_at: input.completed ? new Date().toISOString() : null })
    .eq("id", input.id)
    .eq("user_id", user.id);
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
  await supabase.from("tasks").delete().eq("id", input.id).eq("user_id", user.id);
}
