"use client";

import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelHead } from "@/components/ui/panel";
import { formatShortDate } from "@/lib/workout/format";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { formatWeight } from "@/lib/workout/units";
import {
  EQUIPMENT_TAGS,
  type DraftExercise,
  type DraftSet,
  type ExerciseHistoryEntry,
  type WeightUnit,
} from "@/lib/workout/types";
import { SetRow } from "./set-row";

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
    <Panel>
      <div className="flex items-center justify-between gap-3 border-b-2 border-rule px-3 py-2.5">
        <p className="flex min-w-0 items-center gap-2">
          <span className="display-sm truncate">{exercise.exerciseName}</span>
          {EQUIPMENT_TAGS[exercise.equipment] && (
            <Tag>{EQUIPMENT_TAGS[exercise.equipment]}</Tag>
          )}
        </p>
        <button
          type="button"
          onClick={onRemoveExercise}
          className="tap-press shrink-0 text-muted-foreground/50 transition-colors hover:text-destructive"
          aria-label={`Remove ${exercise.exerciseName}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {/* Last time's numbers, right above where you type this time's — the
          whole point of progressive overload is seeing both at once. */}
      {history.length > 0 && (
        <div className="border-b-2 border-rule bg-muted/40">
          <p className="micro-sm border-b border-hairline px-3 py-1.5 text-muted-foreground">
            Last time
          </p>
          <ul>
            {history.map((entry, i) => (
              <li
                key={i}
                className={cn(
                  "flex gap-3 px-3 py-1.5 text-xs",
                  i > 0 && "border-t border-hairline"
                )}
              >
                <span className="micro-sm w-11 shrink-0 text-muted-foreground">
                  {formatShortDate(entry.workoutDate)}
                </span>
                <span className="min-w-0 tabular">
                  {entry.sets
                    .map((s) => `${formatWeight(s.weight_kg, unit)}×${s.reps}`)
                    .join("  ·  ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PanelHead title="Sets" count={exercise.sets.length} />

      <div>
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

      <div className="border-t-2 border-rule p-2">
        <Button type="button" variant="secondary" block onClick={onDuplicateLastSet}>
          <Copy className="size-4" />
          Duplicate last set
        </Button>
      </div>
    </Panel>
  );
}
