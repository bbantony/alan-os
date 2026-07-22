"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Exercise, WeightUnit, WorkoutTemplate } from "@/lib/workout/types";
import { setWeightUnit } from "@/app/(app)/workout/actions";
import { ExerciseManager } from "./exercise-manager";
import { TemplateEditor } from "./template-editor";

export function WorkoutSettings({
  initialWeightUnit,
  initialTemplates,
  initialExercises,
}: {
  initialWeightUnit: WeightUnit;
  initialTemplates: WorkoutTemplate[];
  initialExercises: Exercise[];
}) {
  const [unit, setUnit] = useState(initialWeightUnit);
  const [templates, setTemplates] = useState(initialTemplates);
  const [exercises, setExercises] = useState(initialExercises);

  async function handleUnitChange(next: WeightUnit) {
    setUnit(next);
    await setWeightUnit(next);
  }

  function upsertExercise(exercise: Exercise) {
    setExercises((prev) =>
      prev.some((e) => e.id === exercise.id) ? prev.map((e) => (e.id === exercise.id ? exercise : e)) : [...prev, exercise]
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Weight unit
        </h2>
        <div className="flex gap-2">
          {(["lbs", "kg"] as WeightUnit[]).map((u) => (
            <button
              key={u}
              onClick={() => handleUnitChange(u)}
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm font-medium",
                unit === u ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
              )}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Saved templates
        </h2>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Save a routine while logging a workout to see it here.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {templates.map((t) => (
              <TemplateEditor
                key={t.id}
                template={t}
                exercises={exercises}
                onExerciseCreated={upsertExercise}
                onSaved={(next) => setTemplates((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
                onDeleted={() => setTemplates((prev) => prev.filter((p) => p.id !== t.id))}
              />
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Exercises
        </h2>
        <p className="mb-2 text-xs text-muted-foreground">
          Your own list — rename one, change its equipment tag, or delete it. Exercises already
          used in a logged workout can&apos;t be deleted, only renamed.
        </p>
        <ExerciseManager
          exercises={exercises}
          onUpdated={upsertExercise}
          onDeleted={(id) => setExercises((prev) => prev.filter((e) => e.id !== id))}
        />
      </div>
    </div>
  );
}
