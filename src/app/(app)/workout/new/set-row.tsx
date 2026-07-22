"use client";

import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { barWeightKg, displayWeight, smallestIncrementKg, toStoredKg } from "@/lib/workout/units";
import type { DraftSet, EquipmentType, WeightUnit } from "@/lib/workout/types";

function Stepper({
  label,
  value,
  onDecrement,
  onIncrement,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  onChange: (next: number) => void;
  step: "reps" | "weight";
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" onClick={onDecrement} aria-label={`Decrease ${label}`}>
          <Minus className="size-3.5" />
        </Button>
        <input
          type="number"
          inputMode={step === "reps" ? "numeric" : "decimal"}
          pattern={step === "reps" ? "[0-9]*" : undefined}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="tabular h-9 w-14 rounded-lg border border-input bg-transparent text-center text-base font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="button" variant="outline" size="icon" onClick={onIncrement} aria-label={`Increase ${label}`}>
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function SetRow({
  index,
  set,
  unit,
  equipment,
  onChange,
  onRemove,
}: {
  index: number;
  set: DraftSet;
  unit: WeightUnit;
  equipment: EquipmentType;
  onChange: (set: DraftSet) => void;
  onRemove: () => void;
}) {
  const isBarbell = equipment === "barbell";
  const increment = smallestIncrementKg(unit);
  const bar = barWeightKg(unit);

  // Barbell exercises: the number the lifter actually types is what's loaded
  // on the bar (plates only), not the total — the bar's own weight is added
  // underneath automatically. Everywhere else in the app (PRs, history,
  // last-session display) still works off the true total stored in weightKg.
  // Dumbbell/kettlebell are informational tags only — normal total-weight entry.
  const shownWeight = isBarbell
    ? Math.max(0, displayWeight(set.weightKg, unit) - displayWeight(bar, unit))
    : displayWeight(set.weightKg, unit);

  function setShownWeight(nextShown: number) {
    const clamped = Math.max(0, nextShown);
    const totalKg = isBarbell ? toStoredKg(clamped, unit) + bar : toStoredKg(clamped, unit);
    onChange({ ...set, weightKg: totalKg });
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 py-2 pr-1.5 pl-2.5">
      <span className="tabular w-4 shrink-0 text-xs font-medium text-muted-foreground">{index + 1}</span>

      <div className="flex flex-1 items-center justify-center gap-3">
        <Stepper
          label="Reps"
          value={set.reps}
          step="reps"
          onDecrement={() => onChange({ ...set, reps: Math.max(0, set.reps - 1) })}
          onIncrement={() => onChange({ ...set, reps: set.reps + 1 })}
          onChange={(next) => onChange({ ...set, reps: next })}
        />
        <span className="mt-4 text-sm text-muted-foreground/60">×</span>
        <Stepper
          label={isBarbell ? `Bar+ (${unit})` : `Weight (${unit})`}
          value={shownWeight}
          step="weight"
          onDecrement={() => setShownWeight(shownWeight - increment)}
          onIncrement={() => setShownWeight(shownWeight + increment)}
          onChange={setShownWeight}
        />
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="tap-press shrink-0 rounded-full p-2 text-muted-foreground/40 hover:text-destructive"
        aria-label="Remove set"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
