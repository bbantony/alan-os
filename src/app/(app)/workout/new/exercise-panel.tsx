"use client";

import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatWeight } from "@/lib/workout/units";
import { EQUIPMENT_TAGS, type DraftExercise, type DraftSet, type ExerciseHistoryEntry, type WeightUnit } from "@/lib/workout/types";
import { SetRow } from "./set-row";

function formatShortDate(dateStr: string): string {
  if (!dateStr) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${dateStr}T00:00:00Z`)
  );
}

// The single focused exercise being logged right now — history above, sets
// below. Only one of these is on screen at a time (new-workout-form.tsx
// switches which exercise is active via the chip row), instead of every
// exercise's full card stacked on one long scrolling page.
export function ExercisePanel({
  exercise,
  history,
  unit,
  onChangeSet,
  onRemoveSet,
  onDuplicateLastSet,
  onRemoveExercise,
}: {
  exercise: DraftExercise;
  history: ExerciseHistoryEntry[];
  unit: WeightUnit;
  onChangeSet: (index: number, set: DraftSet) => void;
  onRemoveSet: (index: number) => void;
  onDuplicateLastSet: () => void;
  onRemoveExercise: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 font-heading text-lg font-semibold">
          {exercise.exerciseName}
          {EQUIPMENT_TAGS[exercise.equipment] && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {EQUIPMENT_TAGS[exercise.equipment]}
            </span>
          )}
        </p>
        <button
          onClick={onRemoveExercise}
          className="tap-press rounded-full p-1.5 text-muted-foreground/40 hover:text-destructive"
          aria-label="Remove exercise"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {history.length > 0 && (
        <div className="mb-3 rounded-lg bg-muted/40 p-2.5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            History
          </p>
          <ul className="space-y-1">
            {history.map((entry, i) => (
              <li key={i} className="flex gap-2 text-xs">
                <span className="w-11 shrink-0 text-muted-foreground">{formatShortDate(entry.workoutDate)}</span>
                <span>{entry.sets.map((s) => `${formatWeight(s.weight_kg, unit)}×${s.reps}`).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1.5">
        {exercise.sets.map((set, i) => (
          <SetRow
            key={i}
            index={i}
            set={set}
            unit={unit}
            equipment={exercise.equipment}
            onChange={(next) => onChangeSet(i, next)}
            onRemove={() => onRemoveSet(i)}
          />
        ))}
      </div>

      <Button type="button" variant="ghost" size="sm" className="mt-2 gap-1.5" onClick={onDuplicateLastSet}>
        <Copy className="size-3.5" />
        Duplicate last set
      </Button>
    </div>
  );
}
