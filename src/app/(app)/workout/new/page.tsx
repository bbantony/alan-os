import { todayInAppTimezone } from "@/lib/time";
import { getExercises, getRecentExerciseIds, getTemplates, getWeightUnit } from "../actions";
import { NewWorkoutForm } from "./new-workout-form";

export default async function NewWorkoutPage() {
  const [exercises, recentExerciseIds, templates, weightUnit] = await Promise.all([
    getExercises(),
    getRecentExerciseIds(),
    getTemplates(),
    getWeightUnit(),
  ]);

  return (
    <NewWorkoutForm
      exercises={exercises}
      recentExerciseIds={recentExerciseIds}
      templates={templates}
      weightUnit={weightUnit}
      todayDate={todayInAppTimezone()}
    />
  );
}
