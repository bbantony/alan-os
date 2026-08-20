"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayInAppTimezone } from "@/lib/time";
import { headlinePr, sessionBests } from "@/lib/workout/pr";
import { startOfWeek } from "@/lib/workout/streaks";
import type {
  EquipmentType,
  Exercise,
  MuscleGroup,
  PrKind,
  WorkoutType,
} from "@/lib/workout/types";

// Your own training — the data behind the "You" tab.
//
// Kept apart from actions.ts on purpose. That file is the crew feed, the
// leaderboard and the logging path: everything there is deliberately crew-wide
// (getFeed and getLeaderboard read other people's rows through the crew RLS
// policies). Everything here is scoped to the signed-in user and nothing else.
// Mixing the two in one 600-line file is how a query ends up crew-scoped by
// accident.

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// ---------------------------------------------------------------------------
// Recent sessions
// ---------------------------------------------------------------------------

export interface SessionSummary {
  id: string;
  workout_date: string;
  type: WorkoutType;
  notes: string | null;
  exerciseCount: number;
  setCount: number;
  run: { distance_km: number; duration_seconds: number } | null;
}

export async function getMySessions(limit = 8): Promise<SessionSummary[]> {
  const { supabase, user } = await requireUser();

  const { data } = await supabase
    .from("workouts")
    .select(
      "id, workout_date, type, notes, workout_sets(exercise_id), runs(distance_km, duration_seconds)"
    )
    .eq("user_id", user.id)
    .order("workout_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (
    (data as unknown as {
      id: string;
      workout_date: string;
      type: WorkoutType;
      notes: string | null;
      workout_sets: { exercise_id: string }[] | null;
      runs: { distance_km: number; duration_seconds: number }[] | null;
    }[]) ?? []
  ).map((w) => {
    const sets = w.workout_sets ?? [];
    return {
      id: w.id,
      workout_date: w.workout_date,
      type: w.type,
      notes: w.notes,
      exerciseCount: new Set(sets.map((s) => s.exercise_id)).size,
      setCount: sets.length,
      run: w.runs?.[0] ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// This week
// ---------------------------------------------------------------------------

export interface WeekDay {
  date: string;
  /** Mon..Sun single letter for the strip's label row. */
  letter: string;
  trained: boolean;
  hasRun: boolean;
  isToday: boolean;
  isFuture: boolean;
}

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * This week, Monday to Sunday, as seven cells.
 *
 * Descriptive, not a target. No weekly goal has ever been set and inventing one
 * ("2 of 4 done") would be the app dictating — which is precisely what "rough
 * plan, flexible" ruled out. It shows what happened; the reading of it is
 * yours.
 */
export async function getThisWeek(): Promise<WeekDay[]> {
  const { supabase, user } = await requireUser();
  const today = todayInAppTimezone();
  const weekStart = startOfWeek(today);

  const { data } = await supabase
    .from("workouts")
    .select("workout_date, type")
    .eq("user_id", user.id)
    .gte("workout_date", weekStart);

  const byDate = new Map<string, Set<WorkoutType>>();
  for (const w of (data as { workout_date: string; type: WorkoutType }[]) ?? []) {
    const set = byDate.get(w.workout_date) ?? new Set<WorkoutType>();
    set.add(w.type);
    byDate.set(w.workout_date, set);
  }

  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${weekStart}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    const types = byDate.get(date);
    days.push({
      date,
      letter: DAY_LETTERS[i],
      trained: Boolean(types && types.size > 0),
      hasRun: Boolean(types?.has("running")),
      isToday: date === today,
      isFuture: date > today,
    });
  }
  return days;
}

// ---------------------------------------------------------------------------
// What to train next
// ---------------------------------------------------------------------------

/**
 * The last date each muscle group was trained.
 *
 * Only your own sessions count — the crew's training says nothing about what
 * *you* have neglected. Sixty sessions back is far more than any suggestion
 * needs and keeps the query bounded.
 */
export async function getMuscleGroupRecency(): Promise<{
  lastTrainedByGroup: Partial<Record<MuscleGroup, string>>;
  today: string;
}> {
  const { supabase, user } = await requireUser();
  const today = todayInAppTimezone();

  const { data } = await supabase
    .from("workouts")
    .select("workout_date, workout_sets(exercises(muscle_group))")
    .eq("user_id", user.id)
    .order("workout_date", { ascending: false })
    .limit(60);

  const lastTrainedByGroup: Partial<Record<MuscleGroup, string>> = {};
  for (const w of (data as unknown as {
    workout_date: string;
    workout_sets: { exercises: { muscle_group: MuscleGroup } | null }[] | null;
  }[]) ?? []) {
    for (const set of w.workout_sets ?? []) {
      const group = set.exercises?.muscle_group;
      if (!group) continue;
      const existing = lastTrainedByGroup[group];
      if (!existing || w.workout_date > existing) lastTrainedByGroup[group] = w.workout_date;
    }
  }

  return { lastTrainedByGroup, today };
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface RecordEntry {
  exerciseId: string;
  exerciseName: string;
  kind: PrKind;
  value: number;
  achievedAt: string;
}

/**
 * Your best ever on each exercise.
 *
 * The `prs` table has recorded these since Phase 2 and has never been visible
 * anywhere except the instant one was set, in a feed card that scrolls away.
 * One row per exercise, and `headlinePr` picks which kind leads — the same
 * function the feed card uses, so the two can never disagree about what your
 * record on a lift is.
 */
export async function getRecords(limit = 8): Promise<RecordEntry[]> {
  const { supabase, user } = await requireUser();

  const { data } = await supabase
    .from("prs")
    .select("exercise_id, kind, value, achieved_at, exercises(name)")
    .eq("user_id", user.id)
    .order("achieved_at", { ascending: false });

  const rows =
    (data as unknown as {
      exercise_id: string;
      kind: PrKind;
      value: number;
      achieved_at: string;
      exercises: { name: string } | null;
    }[]) ?? [];

  const byExercise = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byExercise.get(row.exercise_id) ?? [];
    list.push(row);
    byExercise.set(row.exercise_id, list);
  }

  return [...byExercise.values()]
    .map((list) => {
      const headline = headlinePr(list);
      if (!headline) return null;
      return {
        exerciseId: headline.exercise_id,
        exerciseName: headline.exercises?.name ?? "Exercise",
        kind: headline.kind,
        value: headline.value,
        achievedAt: headline.achieved_at,
      };
    })
    .filter((r): r is RecordEntry => r !== null)
    .sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// One exercise's whole story
// ---------------------------------------------------------------------------

export interface ExerciseSessionPoint {
  workoutId: string;
  date: string;
  sets: { reps: number; weight_kg: number }[];
  topWeightKg: number;
  best1rmKg: number;
  volumeKg: number;
}

export interface ExerciseDetail {
  exercise: Exercise;
  /** Oldest first — the order a chart wants to draw them in. */
  sessions: ExerciseSessionPoint[];
  bestWeightKg: number;
  best1rmKg: number;
  timesPerformed: number;
  lastDone: string | null;
  prWorkoutIds: string[];
}

/**
 * Every session this exercise appears in.
 *
 * The view the module never had: while logging you saw the last four sessions
 * and nothing else, so there was no way to tell whether a lift had actually
 * gone anywhere over months. `!inner` on the workouts join is what scopes this
 * to your own sets — `workout_sets` has no user_id of its own.
 */
export async function getExerciseDetail(exerciseId: string): Promise<ExerciseDetail | null> {
  const { supabase, user } = await requireUser();

  const { data: exercise } = await supabase
    .from("exercises")
    .select("*")
    .eq("id", exerciseId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!exercise) return null;

  const [{ data: sets }, { data: prs }] = await Promise.all([
    supabase
      .from("workout_sets")
      .select("reps, weight_kg, workout_id, workouts!inner(workout_date, user_id)")
      .eq("exercise_id", exerciseId)
      .eq("workouts.user_id", user.id),
    supabase.from("prs").select("workout_id").eq("exercise_id", exerciseId).eq("user_id", user.id),
  ]);

  const rows =
    (sets as unknown as {
      reps: number;
      weight_kg: number;
      workout_id: string;
      workouts: { workout_date: string } | null;
    }[]) ?? [];

  const byWorkout = new Map<string, { date: string; sets: { reps: number; weight_kg: number }[] }>();
  for (const row of rows) {
    if (!row.workouts) continue;
    const entry = byWorkout.get(row.workout_id) ?? { date: row.workouts.workout_date, sets: [] };
    entry.sets.push({ reps: row.reps, weight_kg: row.weight_kg });
    byWorkout.set(row.workout_id, entry);
  }

  const sessions: ExerciseSessionPoint[] = [...byWorkout.entries()]
    .map(([workoutId, entry]) => {
      const bests = sessionBests(entry.sets.map((s) => ({ reps: s.reps, weightKg: s.weight_kg })));
      return {
        workoutId,
        date: entry.date,
        sets: entry.sets,
        topWeightKg: bests.weight,
        best1rmKg: bests.est_1rm,
        volumeKg: bests.volume,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    exercise: exercise as Exercise,
    sessions,
    bestWeightKg: sessions.reduce((max, s) => Math.max(max, s.topWeightKg), 0),
    best1rmKg: sessions.reduce((max, s) => Math.max(max, s.best1rmKg), 0),
    timesPerformed: sessions.length,
    lastDone: sessions.length > 0 ? sessions[sessions.length - 1].date : null,
    prWorkoutIds: ((prs as { workout_id: string }[]) ?? []).map((p) => p.workout_id),
  };
}

// ---------------------------------------------------------------------------
// The in-progress session
// ---------------------------------------------------------------------------
//
// See supabase/migrations/0027_workout_drafts.sql for why this is its own table
// rather than a `workouts` row carrying a status. Nothing server-side reads
// inside the payload except to count exercises for the banner — it is the
// logging form's own state, on its way to becoming real rows.

export interface DraftPayload {
  type?: WorkoutType;
  workoutDate?: string;
  notes?: string;
  exercises?: {
    exerciseId: string;
    exerciseName: string;
    equipment: EquipmentType;
    sets: { reps: number; weightKg: number }[];
  }[];
}

export interface WorkoutDraft {
  payload: DraftPayload;
  startedAt: string;
  updatedAt: string;
}

export async function getDraft(): Promise<WorkoutDraft | null> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("workout_drafts")
    .select("payload, started_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    payload: data.payload as DraftPayload,
    startedAt: data.started_at as string,
    updatedAt: data.updated_at as string,
  };
}

/**
 * Upsert, because a person has at most one session on the go and the table's
 * primary key says so — there is nothing to reconcile and no way to end up
 * with two. `started_at` is deliberately not touched on update, so the banner
 * can say how long you've been at it rather than how long since you last
 * tapped something.
 */
export async function saveDraft(payload: DraftPayload): Promise<void> {
  const { supabase, user } = await requireUser();
  await supabase
    .from("workout_drafts")
    .upsert({ user_id: user.id, payload, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
}

export async function clearDraft(): Promise<void> {
  const { supabase, user } = await requireUser();
  await supabase.from("workout_drafts").delete().eq("user_id", user.id);
  revalidatePath("/workout");
}
