import { getTemplates, getWeightUnit } from "@/app/(app)/workout/actions";
import { WorkoutSettings } from "./workout-settings";

export default async function WorkoutSettingsPage() {
  const [weightUnit, templates] = await Promise.all([getWeightUnit(), getTemplates()]);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 font-heading text-2xl font-semibold">Workout settings</h1>
      <WorkoutSettings initialWeightUnit={weightUnit} initialTemplates={templates} />
    </div>
  );
}
