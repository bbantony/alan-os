"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WORKOUT_TYPE_LABELS, type WeightUnit, type WorkoutTemplate } from "@/lib/workout/types";
import { deleteTemplate, setWeightUnit } from "@/app/(app)/workout/actions";

export function WorkoutSettings({
  initialWeightUnit,
  initialTemplates,
}: {
  initialWeightUnit: WeightUnit;
  initialTemplates: WorkoutTemplate[];
}) {
  const [unit, setUnit] = useState(initialWeightUnit);
  const [templates, setTemplates] = useState(initialTemplates);

  async function handleUnitChange(next: WeightUnit) {
    setUnit(next);
    await setWeightUnit(next);
  }

  async function handleDelete(id: string) {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    await deleteTemplate({ id });
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
              <li key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{WORKOUT_TYPE_LABELS[t.type]}</p>
                </div>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="text-muted-foreground/40 hover:text-destructive"
                  aria-label="Delete template"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
