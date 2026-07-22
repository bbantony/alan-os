"use client";

import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { barWeightKg, displayWeight, smallestIncrementKg, toStoredKg } from "@/lib/workout/units";
import type { DraftSet, WeightUnit } from "@/lib/workout/types";

export function SetRow({
  index,
  set,
  unit,
  isBarbell,
  onChange,
  onRemove,
}: {
  index: number;
  set: DraftSet;
  unit: WeightUnit;
  isBarbell: boolean;
  onChange: (set: DraftSet) => void;
  onRemove: () => void;
}) {
  const increment = smallestIncrementKg(unit);
  const bar = barWeightKg(unit);

  // Barbell exercises: the number the lifter actually types is what's loaded
  // on the bar (plates only), not the total — the bar's own weight is added
  // underneath automatically. Everywhere else in the app (PRs, history,
  // last-session display) still works off the true total stored in weightKg.
  const shownWeight = isBarbell
    ? Math.max(0, displayWeight(set.weightKg, unit) - displayWeight(bar, unit))
    : displayWeight(set.weightKg, unit);

  function setShownWeight(nextShown: number) {
    const clamped = Math.max(0, nextShown);
    const totalKg = isBarbell ? toStoredKg(clamped, unit) + bar : toStoredKg(clamped, unit);
    onChange({ ...set, weightKg: totalKg });
  }

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
        {isBarbell && (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            Bar ({displayWeight(bar, unit)}) +
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={() => setShownWeight(shownWeight - increment)}
          aria-label="Less weight"
        >
          <Minus className="size-3" />
        </Button>
        <Input
          type="number"
          inputMode="decimal"
          value={shownWeight}
          onChange={(e) => setShownWeight(Number(e.target.value) || 0)}
          className="h-7 w-16 text-center"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={() => setShownWeight(shownWeight + increment)}
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
