"use client";

import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { displayWeight, smallestIncrementKg, toStoredKg } from "@/lib/workout/units";
import type { DraftSet, WeightUnit } from "@/lib/workout/types";

export function SetRow({
  index,
  set,
  unit,
  onChange,
  onRemove,
}: {
  index: number;
  set: DraftSet;
  unit: WeightUnit;
  onChange: (set: DraftSet) => void;
  onRemove: () => void;
}) {
  const shownWeight = displayWeight(set.weightKg, unit);
  const increment = smallestIncrementKg(unit);

  return (
    <div className="flex items-center gap-2">
      <span className="w-4 text-xs text-muted-foreground">{index + 1}</span>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={() => onChange({ ...set, reps: Math.max(0, set.reps - 1) })}
          aria-label="Fewer reps"
        >
          <Minus className="size-3" />
        </Button>
        <Input
          type="number"
          inputMode="numeric"
          value={set.reps}
          onChange={(e) => onChange({ ...set, reps: Number(e.target.value) || 0 })}
          className="h-7 w-12 text-center"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={() => onChange({ ...set, reps: set.reps + 1 })}
          aria-label="More reps"
        >
          <Plus className="size-3" />
        </Button>
      </div>

      <span className="text-xs text-muted-foreground">×</span>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={() => onChange({ ...set, weightKg: Math.max(0, set.weightKg - increment) })}
          aria-label="Less weight"
        >
          <Minus className="size-3" />
        </Button>
        <Input
          type="number"
          inputMode="decimal"
          value={shownWeight}
          onChange={(e) => onChange({ ...set, weightKg: toStoredKg(Number(e.target.value) || 0, unit) })}
          className="h-7 w-16 text-center"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={() => onChange({ ...set, weightKg: set.weightKg + increment })}
          aria-label="More weight"
        >
          <Plus className="size-3" />
        </Button>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="ml-auto shrink-0 text-muted-foreground/40 hover:text-destructive"
        aria-label="Remove set"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
