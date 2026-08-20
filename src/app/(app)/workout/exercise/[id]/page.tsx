import { notFound } from "next/navigation";

import { PageHeader, HeaderFact } from "@/components/ui/page-header";
import { getWeightUnit } from "../../actions";
import { getExerciseDetail } from "../../personal-actions";
import { EQUIPMENT_LABELS, MUSCLE_GROUP_LABELS } from "@/lib/workout/types";
import { ExerciseDetailView } from "./exercise-detail";

export default async function ExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, weightUnit] = await Promise.all([getExerciseDetail(id), getWeightUnit()]);

  // getExerciseDetail scopes the lookup to the signed-in user, so someone
  // else's exercise id reads as "not found" rather than leaking that it exists.
  if (!detail) notFound();

  return (
    <div>
      <PageHeader
        eyebrow="Workout"
        title={detail.exercise.name}
        backHref="/workout"
        meta={
          <>
            <HeaderFact>{MUSCLE_GROUP_LABELS[detail.exercise.muscle_group]}</HeaderFact>
            <HeaderFact>{EQUIPMENT_LABELS[detail.exercise.equipment]}</HeaderFact>
          </>
        }
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        <ExerciseDetailView detail={detail} weightUnit={weightUnit} />
      </div>
    </div>
  );
}
