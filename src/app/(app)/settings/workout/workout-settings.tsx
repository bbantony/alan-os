"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Exercise, WeightUnit, WorkoutTemplate } from "@/lib/workout/types";
import { DEFAULT_INCREMENT } from "@/lib/workout/units";
import { setWeightUnit } from "@/app/(app)/workout/actions";
import { updatePreferences } from "@/app/(app)/settings/preferences-actions";
import { toast } from "@/components/ui/toast";
import { ExerciseManager } from "./exercise-manager";
import { TemplateEditor } from "./template-editor";

// The jumps that correspond to a real pair of plates, per unit. Anything else
// is available through Custom — these are just the ones worth one tap.
const INCREMENT_PRESETS: Record<WeightUnit, number[]> = {
  lbs: [1, 2.5, 5, 10],
  kg: [0.5, 1, 1.25, 2.5, 5],
};

export function WorkoutSettings({
  initialWeightUnit,
  initialWeightIncrement,
  initialTemplates,
  initialExercises,
}: {
  initialWeightUnit: WeightUnit;
  initialWeightIncrement: number | null;
  initialTemplates: WorkoutTemplate[];
  initialExercises: Exercise[];
}) {
  const [unit, setUnit] = useState(initialWeightUnit);
  const [increment, setIncrement] = useState(initialWeightIncrement);
  const [customOpen, setCustomOpen] = useState(
    initialWeightIncrement !== null &&
      !INCREMENT_PRESETS[initialWeightUnit].includes(initialWeightIncrement)
  );
  const [customText, setCustomText] = useState(
    initialWeightIncrement === null ? "" : String(initialWeightIncrement)
  );

  const [templates, setTemplates] = useState(initialTemplates);
  const [exercises, setExercises] = useState(initialExercises);

  const effectiveIncrement = increment ?? DEFAULT_INCREMENT[unit];

  async function handleUnitChange(next: WeightUnit) {
    if (next === unit) return;
    setUnit(next);
    await setWeightUnit(next);

    // The step is stored in the DISPLAY unit, so a saved 5 would silently
    // become 5 kg (about 11 lb) the moment the unit changed. Reset to the new
    // unit's default rather than reinterpreting a number Alan chose while
    // looking at different plates. He can set it again in one tap.
    if (increment !== null) {
      setIncrement(null);
      setCustomOpen(false);
      setCustomText("");
      await updatePreferences({ weightIncrement: null });
      toast.success(`Weight steps reset to ${DEFAULT_INCREMENT[next]} ${next}`);
    }
  }

  async function saveIncrement(next: number | null) {
    const previous = increment;
    setIncrement(next);
    const result = await updatePreferences({ weightIncrement: next });
    if (result.error) {
      setIncrement(previous);
      toast.error("Couldn't save that — try again.");
      return;
    }
    // Echo what the buttons will now do, since the change isn't visible from
    // this screen.
    const applied = result.preferences.weightIncrement ?? DEFAULT_INCREMENT[unit];
    setIncrement(result.preferences.weightIncrement);
    toast.success(`+/− now moves ${applied} ${unit}`);
  }

  function commitCustom() {
    const parsed = Number(customText.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter a number bigger than zero.");
      setCustomText(increment === null ? "" : String(increment));
      return;
    }
    void saveIncrement(Math.min(50, Math.max(0.1, Math.round(parsed * 100) / 100)));
  }

  function upsertExercise(exercise: Exercise) {
    setExercises((prev) =>
      prev.some((e) => e.id === exercise.id) ? prev.map((e) => (e.id === exercise.id ? exercise : e)) : [...prev, exercise]
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-2 micro text-muted-foreground">
          Weight unit
        </h2>
        <div className="flex items-stretch border-2 border-rule bg-surface">
          {(["lbs", "kg"] as WeightUnit[]).map((u, i) => (
            <button
              key={u}
              type="button"
              onClick={() => handleUnitChange(u)}
              aria-pressed={unit === u}
              className={cn(
                "micro tap-press flex-1 py-2.5 transition-colors",
                i > 0 && "border-l border-hairline",
                unit === u
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 micro text-muted-foreground">Weight steps</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          How much the + and − buttons move the weight while you&apos;re logging a set.
          Set it to the smallest pair of plates you actually have.
        </p>

        <div className="flex flex-wrap items-stretch border-2 border-rule bg-surface">
          {INCREMENT_PRESETS[unit].map((value, i) => {
            const active = !customOpen && effectiveIncrement === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setCustomOpen(false);
                  void saveIncrement(value === DEFAULT_INCREMENT[unit] ? null : value);
                }}
                aria-pressed={active}
                className={cn(
                  "micro tap-press min-w-0 flex-1 px-2 py-2.5 transition-colors",
                  i > 0 && "border-l border-hairline",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {value} {unit}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCustomOpen(true)}
            aria-pressed={customOpen}
            className={cn(
              "micro tap-press min-w-0 flex-1 border-l border-hairline px-2 py-2.5 transition-colors",
              customOpen
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            Custom
          </button>
        </div>

        {customOpen && (
          <div className="mt-2 flex items-stretch gap-2">
            <label htmlFor="weight-increment" className="sr-only">
              Custom weight step in {unit}
            </label>
            <input
              id="weight-increment"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.1"
              max="50"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onBlur={commitCustom}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitCustom();
                }
              }}
              placeholder={String(DEFAULT_INCREMENT[unit])}
              className="tabular min-w-0 flex-1 border-2 border-rule bg-surface px-3 py-2.5 text-sm focus-visible:border-primary focus-visible:outline-none"
            />
            <span className="micro flex items-center px-1 text-muted-foreground">{unit}</span>
          </div>
        )}

        <p className="mt-2 text-xs text-muted-foreground">
          Now moving in steps of{" "}
          <strong className="text-foreground">
            {effectiveIncrement} {unit}
          </strong>
          .
        </p>
      </div>

      <div>
        <h2 className="mb-2 micro text-muted-foreground">
          Saved templates
        </h2>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Save a routine while logging a workout to see it here.
          </p>
        ) : (
          <ul className="divide-y divide-hairline border-2 border-rule bg-surface">
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
        <h2 className="mb-2 micro text-muted-foreground">
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
