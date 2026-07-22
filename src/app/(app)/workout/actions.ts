"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayInAppTimezone } from "@/lib/time";
import { sessionBests, detectNewPrs, type NewPr } from "@/lib/workout/pr";
import { computeStreak, startOfWeek } from "@/lib/workout/streaks";
import type {
  CrewProfile,
  EquipmentType,
  Exercise,
  ExerciseHistoryEntry,
  FeedWorkout,
  MuscleGroup,
  Pr,
  PrKind,
  Reaction,
  Run,
  WeightUnit,
  Workout,
  WorkoutSet,
  WorkoutTemplate,
} from "@/lib/workout/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// ---------- Exercises ----------

// Each user keeps their own exercise list (owner request — same as
// templates). Scoped to the current user; the crew feed's own name
// resolution (getFeed, below) deliberately queries unfiltered instead, since
// it needs to resolve other members' exercise names too.
export async function getExercises(): Promise<Exercise[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("exercises")
    .select("*")
    .eq("user_id", user.id)
    .order("name", { ascending: true });
  return (data as Exercise[]) ?? [];
}

// Most-recently-used exercise ids for the current user, most recent first —
// looks at their last 20 logged workouts rather than embedding a join order,
// to keep the query simple and predictable.
export async function getRecentExerciseIds(): Promise<string[]> {
  const { supabase, user } = await requireUser();
  const { data: recentWorkouts } = await supabase
    .from("workouts")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const workoutIds = (recentWorkouts ?? []).map((w) => w.id as string);
  if (workoutIds.length === 0) return [];

  const { data: sets } = await supabase
    .from("workout_sets")
    .select("workout_id, exercise_id")
    .in("workout_id", workoutIds);

  const orderIndex = new Map(workoutIds.map((id, i) => [id, i]));
  const seen = new Set<string>();
  const ordered: string[] = [];
  const sorted = [...(sets ?? [])].sort(
    (a, b) => (orderIndex.get(a.workout_id) ?? 0) - (orderIndex.get(b.workout_id) ?? 0)
  );
  for (const s of sorted) {
    if (!seen.has(s.exercise_id)) {
      seen.add(s.exercise_id);
      ordered.push(s.exercise_id);
    }
  }
  return ordered;
}

export async function addExercise(input: {
  name: string;
  muscleGroup: MuscleGroup;
  equipment?: EquipmentType;
}): Promise<{ exercise: Exercise | null; error?: string }> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("exercises")
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      muscle_group: input.muscleGroup,
      equipment: input.equipment ?? "other",
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return { exercise: null, error: "That exercise already exists." };
    return { exercise: null, error: error.message };
  }

  revalidatePath("/workout/new");
  return { exercise: data as Exercise };
}

export async function updateExercise(input: {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  equipment: EquipmentType;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("exercises")
    .update({ name: input.name.trim(), muscle_group: input.muscleGroup, equipment: input.equipment })
    .eq("id", input.id)
    .eq("user_id", user.id);

  if (error) {
    if (error.code === "23505") return { error: "That exercise already exists." };
    return { error: error.message };
  }

  revalidatePath("/settings/workout");
  revalidatePath("/workout/new");
  return {};
}

// Blocked (not silently ignored) if the exercise has already been used in a
// logged workout or PR — exercises.id is referenced by workout_sets/prs with
// no cascade, so Postgres raises a foreign-key violation rather than letting
// history quietly disappear (SPEC.md's "never lose data" rule). A dangling
// reference from a saved template is fine and already handled by the UI
// (template-editor.tsx falls back to "Unknown exercise").
export async function deleteExercise(input: { id: string }): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("exercises").delete().eq("id", input.id).eq("user_id", user.id);

  if (error) {
    if (error.code === "23503") {
      return { error: "Can't delete — you've already logged workouts with this exercise." };
    }
    return { error: error.message };
  }

  revalidatePath("/settings/workout");
  revalidatePath("/workout/new");
  return {};
}

// Sets from this user's last few sessions that included this exercise (most
// recent first) — looked up within their last 60 workouts, a practical
// lookback bound rather than a full history scan. Used both for the "last
// session" progressive-overload suggestion (entry 0) and the on-screen
// history so the owner can see a trend, not just one data point.
export async function getExerciseHistory(
  exerciseId: string,
  sessionLimit = 4
): Promise<ExerciseHistoryEntry[]> {
  const { supabase, user } = await requireUser();
  const { data: myWorkouts } = await supabase
    .from("workouts")
    .select("id, workout_date")
    .eq("user_id", user.id)
    .order("workout_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);

  const workoutRows = myWorkouts ?? [];
  const workoutIds = workoutRows.map((w) => w.id as string);
  if (workoutIds.length === 0) return [];

  const { data: sets } = await supabase
    .from("workout_sets")
    .select("*")
    .eq("exercise_id", exerciseId)
    .in("workout_id", workoutIds);

  if (!sets || sets.length === 0) return [];

  const dateByWorkout = new Map(workoutRows.map((w) => [w.id as string, w.workout_date as string]));
  const orderIndex = new Map(workoutIds.map((id, i) => [id, i]));

  const byWorkout = new Map<string, WorkoutSet[]>();
  for (const s of sets as WorkoutSet[]) {
    const list = byWorkout.get(s.workout_id) ?? [];
    list.push(s);
    byWorkout.set(s.workout_id, list);
  }

  const orderedWorkoutIds = [...byWorkout.keys()].sort(
    (a, b) => (orderIndex.get(a) ?? 999) - (orderIndex.get(b) ?? 999)
  );

  return orderedWorkoutIds.slice(0, sessionLimit).map((workoutId) => ({
    workoutDate: dateByWorkout.get(workoutId) ?? "",
    sets: (byWorkout.get(workoutId) ?? []).sort((a, b) => a.set_number - b.set_number),
  }));
}

// ---------- Logging ----------

async function priorBestsFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  exerciseId: string
): Promise<Partial<Record<PrKind, number>>> {
  const { data } = await supabase
    .from("prs")
    .select("kind, value")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId);

  const bests: Partial<Record<PrKind, number>> = {};
  for (const row of data ?? []) {
    const kind = row.kind as PrKind;
    const value = row.value as number;
    if (bests[kind] === undefined || value > (bests[kind] as number)) bests[kind] = value;
  }
  return bests;
}

export interface LoggedPr extends NewPr {
  exerciseId: string;
  exerciseName: string;
}

export async function logWorkout(input: {
  workoutDate: string;
  notes: string | null;
  exercises: {
    exerciseId: string;
    exerciseName: string;
    sets: { reps: number; weightKg: number }[];
  }[];
}): Promise<{ workoutId: string; prs: LoggedPr[] }> {
  const { supabase, user } = await requireUser();

  const { data: workout, error } = await supabase
    .from("workouts")
    .insert({
      user_id: user.id,
      workout_date: input.workoutDate,
      type: "resistance",
      notes: input.notes,
    })
    .select("id")
    .single();

  if (error || !workout) throw new Error(error?.message ?? "Could not save workout");
  const workoutId = workout.id as string;

  const setRows = input.exercises.flatMap((ex) =>
    ex.sets.map((s, i) => ({
      workout_id: workoutId,
      exercise_id: ex.exerciseId,
      set_number: i + 1,
      reps: s.reps,
      weight_kg: s.weightKg,
    }))
  );

  if (setRows.length > 0) {
    await supabase.from("workout_sets").insert(setRows);
  }

  const allNewPrs: LoggedPr[] = [];

  for (const ex of input.exercises) {
    if (ex.sets.length === 0) continue;
    const priorBests = await priorBestsFor(supabase, user.id, ex.exerciseId);
    const session = sessionBests(ex.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg })));
    const newPrs = detectNewPrs(session, priorBests);

    if (newPrs.length > 0) {
      await supabase.from("prs").insert(
        newPrs.map((pr) => ({
          user_id: user.id,
          exercise_id: ex.exerciseId,
          kind: pr.kind,
          value: pr.value,
          workout_id: workoutId,
        }))
      );
      for (const pr of newPrs) {
        allNewPrs.push({ ...pr, exerciseId: ex.exerciseId, exerciseName: ex.exerciseName });
      }
    }
  }

  revalidatePath("/workout");
  revalidatePath("/today");

  return { workoutId, prs: allNewPrs };
}

export async function logRun(input: {
  workoutDate: string;
  distanceKm: number;
  durationSeconds: number;
  avgHr: number | null;
  notes: string | null;
}): Promise<{ workoutId: string }> {
  const { supabase, user } = await requireUser();

  const { data: workout, error } = await supabase
    .from("workouts")
    .insert({ user_id: user.id, workout_date: input.workoutDate, type: "running", notes: input.notes })
    .select("id")
    .single();

  if (error || !workout) throw new Error(error?.message ?? "Could not save run");
  const workoutId = workout.id as string;

  await supabase.from("runs").insert({
    workout_id: workoutId,
    distance_km: input.distanceKm,
    duration_seconds: input.durationSeconds,
    avg_hr: input.avgHr,
    source: "manual",
  });

  revalidatePath("/workout");
  revalidatePath("/today");

  return { workoutId };
}

// Deletes a logged workout (resistance or run). workout_sets/runs/prs/
// reactions all cascade-delete via their workout_id foreign key (migration
// 0005), so this is the only query needed.
export async function deleteWorkout(input: { id: string }) {
  const { supabase, user } = await requireUser();
  await supabase.from("workouts").delete().eq("id", input.id).eq("user_id", user.id);
  revalidatePath("/workout");
  revalidatePath("/today");
}

// ---------- Templates ----------

export async function getTemplates(): Promise<WorkoutTemplate[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("workout_templates")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (data as WorkoutTemplate[]) ?? [];
}

export async function saveTemplate(input: { name: string; exerciseIds: string[] }) {
  const { supabase, user } = await requireUser();
  await supabase.from("workout_templates").insert({
    user_id: user.id,
    name: input.name.trim(),
    exercise_ids: input.exerciseIds,
  });
  revalidatePath("/workout/new");
  revalidatePath("/settings/workout");
}

export async function updateTemplate(input: { id: string; name: string; exerciseIds: string[] }) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("workout_templates")
    .update({ name: input.name.trim(), exercise_ids: input.exerciseIds })
    .eq("id", input.id)
    .eq("user_id", user.id);
  revalidatePath("/workout/new");
  revalidatePath("/settings/workout");
}

export async function deleteTemplate(input: { id: string }) {
  const { supabase, user } = await requireUser();
  await supabase.from("workout_templates").delete().eq("id", input.id).eq("user_id", user.id);
  revalidatePath("/settings/workout");
}

// ---------- Feed & reactions ----------

export async function getCrewProfiles(): Promise<CrewProfile[]> {
  const { supabase } = await requireUser();
  const { data } = await supabase.rpc("crew_profiles");
  return (data as CrewProfile[]) ?? [];
}

export async function getFeed(limit = 30): Promise<FeedWorkout[]> {
  const { supabase } = await requireUser();

  const [{ data: workouts }, { data: profiles }] = await Promise.all([
    supabase.from("workouts").select("*").order("created_at", { ascending: false }).limit(limit),
    supabase.rpc("crew_profiles"),
  ]);

  const workoutRows = (workouts as Workout[]) ?? [];
  if (workoutRows.length === 0) return [];

  const workoutIds = workoutRows.map((w) => w.id);
  const profileMap = new Map(((profiles as CrewProfile[]) ?? []).map((p) => [p.id, p]));

  const [{ data: sets }, { data: runs }, { data: prs }, { data: reactions }, { data: exercises }] =
    await Promise.all([
      supabase.from("workout_sets").select("*").in("workout_id", workoutIds),
      supabase.from("runs").select("*").in("workout_id", workoutIds),
      supabase.from("prs").select("*").in("workout_id", workoutIds),
      supabase.from("reactions").select("*").in("workout_id", workoutIds),
      // Deliberately unfiltered by user_id, unlike getExercises() — the feed
      // shows everyone's workouts, so it needs to resolve exercise names
      // that belong to other crew members' own exercise lists too. Crew-wide
      // select RLS on exercises (0005) allows this.
      supabase.from("exercises").select("id, name"),
    ]);

  const exerciseNameById = new Map(
    ((exercises as { id: string; name: string }[]) ?? []).map((e) => [e.id, e.name])
  );

  return workoutRows.map((workout) => {
    const workoutSets = ((sets as WorkoutSet[]) ?? [])
      .filter((s) => s.workout_id === workout.id)
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => ({ ...s, exercise_name: exerciseNameById.get(s.exercise_id) ?? "Exercise" }));

    const run = ((runs as Run[]) ?? []).find((r) => r.workout_id === workout.id) ?? null;

    const workoutPrs = ((prs as Pr[]) ?? [])
      .filter((p) => p.workout_id === workout.id)
      .map((p) => ({ ...p, exercise_name: exerciseNameById.get(p.exercise_id) ?? "Exercise" }));

    const workoutReactions = ((reactions as Reaction[]) ?? []).filter((r) => r.workout_id === workout.id);

    return {
      workout,
      author: profileMap.get(workout.user_id) ?? null,
      sets: workoutSets,
      run,
      prs: workoutPrs,
      reactions: workoutReactions,
    };
  });
}

export async function toggleReaction(input: { workoutId: string; emoji: string }): Promise<{ active: boolean }> {
  const { supabase, user } = await requireUser();
  const { data: existing } = await supabase
    .from("reactions")
    .select("id")
    .eq("workout_id", input.workoutId)
    .eq("user_id", user.id)
    .eq("emoji", input.emoji)
    .maybeSingle();

  if (existing) {
    await supabase.from("reactions").delete().eq("id", existing.id);
    revalidatePath("/workout");
    return { active: false };
  }

  await supabase.from("reactions").insert({ workout_id: input.workoutId, user_id: user.id, emoji: input.emoji });
  revalidatePath("/workout");
  return { active: true };
}

// ---------- Streaks & leaderboard ----------

export interface LeaderboardEntry {
  profile: CrewProfile;
  currentStreak: number;
  longestStreak: number;
  workoutsThisWeek: number;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const { supabase } = await requireUser();
  const [{ data: workouts }, { data: profiles }] = await Promise.all([
    supabase.from("workouts").select("user_id, workout_date"),
    supabase.rpc("crew_profiles"),
  ]);

  const today = todayInAppTimezone();
  const weekStart = startOfWeek(today);

  const byUser = new Map<string, Set<string>>();
  for (const w of workouts ?? []) {
    const userId = w.user_id as string;
    const date = w.workout_date as string;
    if (!byUser.has(userId)) byUser.set(userId, new Set());
    byUser.get(userId)!.add(date);
  }

  return ((profiles as CrewProfile[]) ?? [])
    .map((profile) => {
      const dates = [...(byUser.get(profile.id) ?? [])];
      const { current, longest } = computeStreak(dates, today);
      const workoutsThisWeek = dates.filter((d) => d >= weekStart && d <= today).length;
      return { profile, currentStreak: current, longestStreak: longest, workoutsThisWeek };
    })
    .sort((a, b) => b.currentStreak - a.currentStreak);
}

export async function getWorkoutDashboardSummary(): Promise<{
  currentStreak: number;
  loggedToday: boolean;
}> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("workouts").select("workout_date").eq("user_id", user.id);
  const dates = [...new Set((data ?? []).map((w) => w.workout_date as string))];
  const today = todayInAppTimezone();
  const { current } = computeStreak(dates, today);
  return { currentStreak: current, loggedToday: dates.includes(today) };
}

// ---------- Preferences ----------

export async function getWeightUnit(): Promise<WeightUnit> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("weight_unit").eq("id", user.id).single();
  return (data?.weight_unit as WeightUnit) ?? "lbs";
}

export async function setWeightUnit(unit: WeightUnit) {
  const { supabase, user } = await requireUser();
  await supabase.from("profiles").update({ weight_unit: unit }).eq("id", user.id);
  revalidatePath("/settings/workout");
  revalidatePath("/workout");
  revalidatePath("/workout/new");
}
