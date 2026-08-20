import { todayInAppTimezone } from "@/lib/time";
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from "@/lib/workout/types";
import {
  getExercises,
  getLastResistanceSession,
  getRecentExerciseIds,
  getTemplates,
  getWeightUnit,
} from "../actions";
import { getDraft } from "../personal-actions";
import { NewWorkoutForm } from "./new-workout-form";

/**
 * Arriving here always means a decision has already been made on the Workout
 * screen — resume what's in progress, repeat last session, run a template, or
 * start from a suggested body part. The chooser that used to live inside this
 * page moved out to the "Next up" panel, so it isn't offered twice.
 */
export default async function NewWorkoutPage({
  searchParams,
}: {
  searchParams: Promise<{ repeat?: string; template?: string; muscle?: string }>;
}) {
  const [params, exercises, recentExerciseIds, templates, weightUnit, lastSession, draft] =
    await Promise.all([
      searchParams,
      getExercises(),
      getRecentExerciseIds(),
      getTemplates(),
      getWeightUnit(),
      getLastResistanceSession(),
      getDraft(),
    ]);

  // An unfinished session always wins: someone who left mid-workout and came
  // back wants those sets, whatever link they happened to tap to get here.
  let startExerciseIds: string[] = [];
  if (!draft) {
    if (params.repeat === "1" && lastSession) {
      startExerciseIds = lastSession.exerciseIds;
    } else if (params.template) {
      startExerciseIds = templates.find((t) => t.id === params.template)?.exercise_ids ?? [];
    }
  }

  const startMuscle =
    params.muscle && params.muscle in MUSCLE_GROUP_LABELS
      ? (params.muscle as MuscleGroup)
      : null;

  return (
    <NewWorkoutForm
      exercises={exercises}
      recentExerciseIds={recentExerciseIds}
      weightUnit={weightUnit}
      todayDate={todayInAppTimezone()}
      initialDraft={draft}
      startExerciseIds={startExerciseIds}
      startMuscle={startMuscle}
    />
  );
}
