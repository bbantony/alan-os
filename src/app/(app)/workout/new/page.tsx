import { todayInAppTimezone } from "@/lib/time";
import {
  getExercises,
  getLastResistanceSession,
  getRecentExerciseIds,
  getTemplates,
  getWeightUnit,
} from "../actions";
import { NewWorkoutForm } from "./new-workout-form";

export default async function NewWorkoutPage() {
  const [exercises, recentExerciseIds, templates, weightUnit, lastSession] = await Promise.all([
    getExercises(),
    getRecentExerciseIds(),
    getTemplates(),
    getWeightUnit(),
    getLastResistanceSession(),
  ]);

  return (
    <NewWorkoutForm
      exercises={exercises}
      recentExerciseIds={recentExerciseIds}
      templates={templates}
      weightUnit={weightUnit}
      todayDate={todayInAppTimezone()}
      lastSession={lastSession}
    />
  );
}
