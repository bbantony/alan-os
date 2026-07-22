export type MuscleGroup = "chest" | "back" | "shoulders" | "arms" | "legs" | "core" | "other";
export type EquipmentType = "barbell" | "dumbbell" | "kettlebell" | "other";
// Collapsed from push/pull/legs/run/other (owner feedback: nobody thinks in
// day-split labels day to day, just "did I lift or did I run").
export type WorkoutType = "resistance" | "running";
export type PrKind = "weight" | "est_1rm" | "volume";
export type WeightUnit = "lbs" | "kg";

export const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> = {
  resistance: "Resistance training",
  running: "Running",
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

// Short tags shown next to an exercise's name — barbell entry mode ("Bar +
// plate weight") only kicks in for "barbell"; dumbbell/kettlebell are purely
// informational tags with normal total-weight entry.
export const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  kettlebell: "Kettlebell",
  other: "Other",
};

export const EQUIPMENT_TAGS: Partial<Record<EquipmentType, string>> = {
  barbell: "BB",
  dumbbell: "DB",
  kettlebell: "KB",
};

// Exercises are private per user (each person keeps their own list, same as
// templates always have) — see migration 0008.
export interface Exercise {
  id: string;
  user_id: string;
  name: string;
  muscle_group: MuscleGroup;
  equipment: EquipmentType;
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

// Templates only ever apply to resistance training — running has no
// templates, so there's no `type` field here (removed in migration 0007).
export interface WorkoutTemplate {
  id: string;
  user_id: string;
  name: string;
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
  equipment: EquipmentType;
  sets: DraftSet[];
}
