"use client";

import { Minus, Plus, X } from "lucide-react";
import { barWeightKg, displayWeight, smallestIncrementKg, toStoredKg } from "@/lib/workout/units";
import type { DraftSet, EquipmentType, WeightUnit } from "@/lib/workout/types";

/**
 * A minus / value / plus cluster drawn as one framed control instead of three
 * separate buttons with gaps. Mid-set, one-handed, sweaty — the tap targets
 * being edge-to-edge with no dead space between them matters more here than
 * on any other screen in the app.
 */
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
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <span className="micro-sm text-muted-foreground">{label}</span>
      <div className="flex w-full items-stretch border-2 border-rule bg-surface">
        <button
          type="button"
          onClick={onDecrement}
          aria-label={`Decrease ${label}`}
          className="press flex w-9 shrink-0 items-center justify-center border-r border-hairline transition-colors hover:bg-muted active:bg-foreground active:text-background"
        >
          <Minus className="size-4" strokeWidth={3} />
        </button>
        <input
          type="number"
          inputMode={step === "reps" ? "numeric" : "decimal"}
          pattern={step === "reps" ? "[0-9]*" : undefined}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          aria-label={label}
          className="h-10 min-w-0 flex-1 bg-transparent text-center font-heading text-lg font-bold tabular outline-none focus-visible:bg-muted"
        />
        <button
          type="button"
          onClick={onIncrement}
          aria-label={`Increase ${label}`}
          className="press flex w-9 shrink-0 items-center justify-center border-l border-hairline transition-colors hover:bg-muted active:bg-foreground active:text-background"
        >
          <Plus className="size-4" strokeWidth={3} />
        </button>
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
    <div className="flex items-end gap-2 border-b border-hairline px-2 py-2.5 last:border-b-0">
      <span className="micro-sm w-4 shrink-0 pb-2.5 tabular text-muted-foreground">
        {index + 1}
      </span>

      <Stepper
        label="Reps"
        value={set.reps}
        step="reps"
        onDecrement={() => onChange({ ...set, reps: Math.max(0, set.reps - 1) })}
        onIncrement={() => onChange({ ...set, reps: set.reps + 1 })}
        onChange={(next) => onChange({ ...set, reps: next })}
      />

      <span className="pb-2.5 text-sm text-muted-foreground/60">×</span>

      <Stepper
        label={isBarbell ? `Bar + ${unit}` : unit}
        value={shownWeight}
        step="weight"
        onDecrement={() => setShownWeight(shownWeight - increment)}
        onIncrement={() => setShownWeight(shownWeight + increment)}
        onChange={setShownWeight}
      />

      <button
        type="button"
        onClick={onRemove}
        className="tap-press shrink-0 pb-2.5 text-muted-foreground/50 transition-colors hover:text-destructive"
        aria-label={`Remove set ${index + 1}`}
      >
        <X className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
