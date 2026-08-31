import { getExercises, getTemplates, getWeightUnit } from "@/app/(app)/workout/actions";
import { getPreferences } from "@/app/(app)/settings/preferences-actions";
import { SettingsPageShell } from "../settings-page-shell";
import { WorkoutSettings } from "./workout-settings";

export default async function WorkoutSettingsPage() {
  const [weightUnit, templates, exercises, prefs] = await Promise.all([
    getWeightUnit(),
    getTemplates(),
    getExercises(),
    getPreferences(),
  ]);

  return (
    <SettingsPageShell title="Workout">
      <WorkoutSettings
        initialWeightUnit={weightUnit}
        initialWeightIncrement={prefs.weightIncrement}
        initialTemplates={templates}
        initialExercises={exercises}
      />
    </SettingsPageShell>
  );
}
