import { getExercises, getTemplates, getWeightUnit } from "@/app/(app)/workout/actions";
import { SettingsPageShell } from "../settings-page-shell";
import { WorkoutSettings } from "./workout-settings";

export default async function WorkoutSettingsPage() {
  const [weightUnit, templates, exercises] = await Promise.all([
    getWeightUnit(),
    getTemplates(),
    getExercises(),
  ]);

  return (
    <SettingsPageShell title="Workout">
      <WorkoutSettings
        initialWeightUnit={weightUnit}
        initialTemplates={templates}
        initialExercises={exercises}
      />
    </SettingsPageShell>
  );
}
