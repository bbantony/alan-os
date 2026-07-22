export type MuscleGroup = "chest" | "back" | "shoulders" | "arms" | "legs" | "core" | "other";
export type WorkoutType = "push" | "pull" | "legs" | "run" | "other";
export type PrKind = "weight" | "est_1rm" | "volume";
export type WeightUnit = "lbs" | "kg";

export const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> = {
  push: "Push",
  pull: "Pull",
  legs: "Legs",
  run: "Run",
  other: "Other",
};

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  arms: "Arms",
  legs: "Legs",
  core: "Core",
  other: "Other",
};

export const REACTION_EMOJIS = ["💪", "🔥", "👏", "😮"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface Exercise {
  id: string;
  created_by: string | null;
  name: string;
  muscle_group: MuscleGroup;
  is_barbell: boolean;
  created_at: string;
}

export interface Workout {
  id: string;
  user_id: string;
  workout_date: string;
  type: WorkoutType;
  notes: string | null;
  created_at: string;
}

export interface WorkoutSet {
  id: string;
  workout_id: string;
  exercise_id: string;
  set_number: number;
  reps: number;
  weight_kg: number;
}

export interface Run {
  id: string;
  workout_id: string;
  distance_km: number;
  duration_seconds: number;
  avg_hr: number | null;
  source: string;
}

export interface Pr {
  id: string;
  user_id: string;
  exercise_id: string;
  kind: PrKind;
  value: number;
  workout_id: string;
  achieved_at: string;
}

export interface Reaction {
  id: string;
  workout_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface WorkoutTemplate {
  id: string;
  user_id: string;
  name: string;
  type: WorkoutType;
  exercise_ids: string[];
  created_at: string;
}

export interface CrewProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: "owner" | "workout_member" | "full_user";
}

// A set annotated with its exercise's name/muscle group, for display without a
// second lookup on every render.
export interface WorkoutSetWithExercise extends WorkoutSet {
  exercise_name: string;
}

// One past session's sets for a given exercise, used by the "history" panel
// while logging a new session.
export interface ExerciseHistoryEntry {
  workoutDate: string;
  sets: WorkoutSet[];
}

// Everything the crew feed needs for one card, assembled server-side.
export interface FeedWorkout {
  workout: Workout;
  author: CrewProfile | null;
  sets: WorkoutSetWithExercise[];
  run: Run | null;
  prs: (Pr & { exercise_name: string })[];
  reactions: Reaction[];
}

// Draft state used while building a new lift session client-side, before submit.
export interface DraftSet {
  reps: number;
  weightKg: number;
}

export interface DraftExercise {
  exerciseId: string;
  exerciseName: string;
  isBarbell: boolean;
  sets: DraftSet[];
}
