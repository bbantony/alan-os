"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MODULE_IDS, type ModuleAccess } from "@/lib/permissions";
import { computeStreak } from "@/lib/workout/streaks";
import { todayInAppTimezone } from "@/lib/time";

export interface AdminUserRow {
  id: string;
  display_name: string | null;
  email: string | null;
  role: "owner" | "workout_member" | "full_user";
  crew_id: string | null;
  crew_name: string | null;
  module_access: ModuleAccess;
  created_at: string;
}

export interface AdminCrewRow {
  id: string;
  name: string;
  member_count: number;
  created_at: string;
}

async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "owner") redirect("/today");
  return { supabase, user };
}

function fillModuleAccess(raw: unknown): ModuleAccess {
  const source = (raw ?? {}) as Partial<Record<string, unknown>>;
  const resolved = {} as ModuleAccess;
  for (const id of MODULE_IDS) resolved[id] = source[id] === true;
  return resolved;
}

export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error || !data) return [];
  return (
    data as {
      id: string;
      display_name: string | null;
      email: string | null;
      role: AdminUserRow["role"];
      crew_id: string | null;
      crew_name: string | null;
      module_access: unknown;
      created_at: string;
    }[]
  ).map((row) => ({ ...row, module_access: fillModuleAccess(row.module_access) }));
}

export async function getAdminCrews(): Promise<AdminCrewRow[]> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("admin_list_crews");
  if (error || !data) return [];
  return (data as { id: string; name: string; member_count: number | string; created_at: string }[]).map((row) => ({
    ...row,
    member_count: Number(row.member_count),
  }));
}

export async function createCrew(name: string): Promise<{ error?: string }> {
  const { supabase } = await requireOwner();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the crew a name." };
  const { error } = await supabase.rpc("admin_create_crew", { crew_name: trimmed });
  if (error) return { error: error.message };
  revalidatePath("/settings/admin");
  return {};
}

export async function renameCrew(input: { id: string; name: string }): Promise<{ error?: string }> {
  const { supabase } = await requireOwner();
  const trimmed = input.name.trim();
  if (!trimmed) return { error: "Give the crew a name." };
  const { error } = await supabase.rpc("admin_rename_crew", { target_crew: input.id, new_name: trimmed });
  if (error) return { error: error.message };
  revalidatePath("/settings/admin");
  return {};
}

export async function deleteCrew(id: string): Promise<{ error?: string }> {
  const { supabase } = await requireOwner();
  const { error } = await supabase.rpc("admin_delete_crew", { target_crew: id });
  if (error) return { error: "That crew still has members — move them out first." };
  revalidatePath("/settings/admin");
  return {};
}

export async function assignUserCrew(input: { userId: string; crewId: string | null }): Promise<{ error?: string }> {
  const { supabase } = await requireOwner();
  const { error } = await supabase.rpc("admin_assign_crew", { target_user: input.userId, target_crew: input.crewId });
  if (error) return { error: error.message };
  revalidatePath("/settings/admin");
  return {};
}

export async function setUserModuleAccess(input: { userId: string; access: ModuleAccess }): Promise<{ error?: string }> {
  const { supabase } = await requireOwner();
  const { error } = await supabase.rpc("admin_set_module_access", { target_user: input.userId, access: input.access });
  if (error) return { error: error.message };
  revalidatePath("/settings/admin");
  return {};
}

export async function getInviteCode(): Promise<string> {
  await requireOwner();
  return process.env.INVITE_CODE ?? "";
}

export interface AdminUserWorkoutSummary {
  currentStreak: number;
  loggedToday: boolean;
  totalWorkouts: number;
  recentPrs: { exerciseName: string; kind: string; value: number; achievedAt: string }[];
}

// Owner-only oversight: is_admin() in the 0018 migration's RLS rewrite gives
// the owner unconditional read access to every user's workout rows
// regardless of crew — this simply queries a specific target user the same
// way getWorkoutDashboardSummary queries "your own" rows.
export async function getAdminUserWorkoutSummary(targetUserId: string): Promise<AdminUserWorkoutSummary> {
  const { supabase } = await requireOwner();

  const { data: workouts } = await supabase.from("workouts").select("workout_date").eq("user_id", targetUserId);
  const dates = [...new Set((workouts ?? []).map((w) => w.workout_date as string))];
  const today = todayInAppTimezone();
  const { current } = computeStreak(dates, today);

  const { data: prs } = await supabase
    .from("prs")
    .select("kind, value, achieved_at, exercises(name)")
    .eq("user_id", targetUserId)
    .order("achieved_at", { ascending: false })
    .limit(5);

  return {
    currentStreak: current,
    loggedToday: dates.includes(today),
    totalWorkouts: dates.length,
    recentPrs: (prs ?? []).map((pr) => ({
      exerciseName: (pr as unknown as { exercises: { name: string } | null }).exercises?.name ?? "Exercise",
      kind: pr.kind as string,
      value: pr.value as number,
      achievedAt: pr.achieved_at as string,
    })),
  };
}
