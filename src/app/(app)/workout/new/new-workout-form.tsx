"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { celebratePr } from "@/lib/workout/celebrate";
import { formatWeight } from "@/lib/workout/units";
import { suggestNextWeight } from "@/lib/workout/progression";
import {
  WORKOUT_TYPE_LABELS,
  type DraftExercise,
  type DraftSet,
  type Exercise,
  type WeightUnit,
  type WorkoutSet,
  type WorkoutTemplate,
  type WorkoutType,
} from "@/lib/workout/types";
import { getLastSessionSets, logRun, logWorkout, saveTemplate } from "../actions";
import { ExercisePicker } from "./exercise-picker";
import { SetRow } from "./set-row";
import { TemplatePicker } from "./template-picker";

function suggestionFor(lastSets: WorkoutSet[], unit: WeightUnit): DraftSet {
  const suggestion = suggestNextWeight(
    lastSets.map((s) => ({ reps: s.reps, weightKg: s.weight_kg })),
    unit
  );
  return suggestion ? { reps: suggestion.reps, weightKg: suggestion.weightKg } : { reps: 8, weightKg: 0 };
}

export function NewWorkoutForm({
  exercises,
  recentExerciseIds,
  templates,
  weightUnit,
  todayDate,
}: {
  exercises: Exercise[];
  recentExerciseIds: string[];
  templates: WorkoutTemplate[];
  weightUnit: WeightUnit;
  todayDate: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<WorkoutType>("push");
  const [workoutDate, setWorkoutDate] = useState(todayDate);
  const [notes, setNotes] = useState("");
  const [knownExercises, setKnownExercises] = useState(exercises);
  const [draftExercises, setDraftExercises] = useState<DraftExercise[]>([]);
  const [lastSessionByExercise, setLastSessionByExercise] = useState<Record<string, WorkoutSet[]>>({});
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [distanceKm, setDistanceKm] = useState("");
  const [durationH, setDurationH] = useState("0");
  const [durationM, setDurationM] = useState("");
  const [durationS, setDurationS] = useState("");
  const [avgHr, setAvgHr] = useState("");

  async function addExerciseToDraft(exercise: Exercise) {
    setDraftExercises((prev) => [
      ...prev,
      { exerciseId: exercise.id, exerciseName: exercise.name, isBarbell: exercise.is_barbell, sets: [] },
    ]);
    const last = await getLastSessionSets(exercise.id);
    setLastSessionByExercise((prev) => ({ ...prev, [exercise.id]: last }));
    const initialSet = suggestionFor(last, weightUnit);
    setDraftExercises((prev) =>
      prev.map((ex) => (ex.exerciseId === exercise.id ? { ...ex, sets: [initialSet] } : ex))
    );
  }

  async function loadTemplate(template: WorkoutTemplate) {
    const existingIds = new Set(draftExercises.map((e) => e.exerciseId));
    for (const id of template.exercise_ids) {
      if (existingIds.has(id)) continue;
      const exercise = knownExercises.find((e) => e.id === id);
      if (exercise) await addExerciseToDraft(exercise);
    }
  }

  function updateSet(exerciseId: string, index: number, set: DraftSet) {
    setDraftExercises((prev) =>
      prev.map((ex) =>
        ex.exerciseId === exerciseId
          ? { ...ex, sets: ex.sets.map((s, i) => (i === index ? set : s)) }
          : ex
      )
    );
  }

  function removeSet(exerciseId: string, index: number) {
    setDraftExercises((prev) =>
      prev.map((ex) =>
        ex.exerciseId === exerciseId ? { ...ex, sets: ex.sets.filter((_, i) => i !== index) } : ex
      )
    );
  }

  function duplicateLastSet(exerciseId: string) {
    setDraftExercises((prev) =>
      prev.map((ex) => {
        if (ex.exerciseId !== exerciseId) return ex;
        const last = ex.sets[ex.sets.length - 1] ?? suggestionFor(lastSessionByExercise[exerciseId] ?? [], weightUnit);
        return { ...ex, sets: [...ex.sets, { ...last }] };
      })
    );
  }

  function removeExercise(exerciseId: string) {
    setDraftExercises((prev) => prev.filter((ex) => ex.exerciseId !== exerciseId));
  }

  async function handleSaveTemplate() {
    const name = templateName.trim();
    if (!name || draftExercises.length === 0) return;
    await saveTemplate({ name, type, exerciseIds: draftExercises.map((e) => e.exerciseId) });
    setShowSaveTemplate(false);
    setTemplateName("");
  }

  async function handleSubmitLift() {
    if (draftExercises.length === 0 || submitting) return;
    setSubmitting(true);
    const result = await logWorkout({
      workoutDate,
      type: type as Exclude<WorkoutType, "run">,
      notes: notes.trim() || null,
      exercises: draftExercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        sets: ex.sets,
      })),
    });
    if (result.prs.length > 0) celebratePr();
    router.push("/workout");
  }

  async function handleSubmitRun() {
    const km = Number(distanceKm);
    const totalSeconds = (Number(durationH) || 0) * 3600 + (Number(durationM) || 0) * 60 + (Number(durationS) || 0);
    if (!km || totalSeconds <= 0 || submitting) return;
    setSubmitting(true);
    await logRun({
      workoutDate,
      distanceKm: km,
      durationSeconds: totalSeconds,
      avgHr: avgHr ? Number(avgHr) : null,
      notes: notes.trim() || null,
    });
    router.push("/workout");
  }

  const isRun = type === "run";

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-24">
      <h1 className="mb-4 font-heading text-2xl font-semibold">New workout</h1>

      <div className="mb-4 grid grid-cols-5 gap-1.5">
        {(["push", "pull", "legs", "run", "other"] as WorkoutType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn(
              "rounded-lg border px-2 py-2 text-xs font-medium",
              type === t ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
            )}
          >
            {WORKOUT_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <Input type="date" value={workoutDate} onChange={(e) => setWorkoutDate(e.target.value)} className="w-40" />
      </div>

      {isRun ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Distance (km)</label>
            <Input
              type="number"
              inputMode="decimal"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              placeholder="5.0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Duration</label>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                inputMode="numeric"
                value={durationH}
                onChange={(e) => setDurationH(e.target.value)}
                className="w-14 text-center"
              />
              <span className="text-xs text-muted-foreground">h</span>
              <Input
                type="number"
                inputMode="numeric"
                value={durationM}
                onChange={(e) => setDurationM(e.target.value)}
                className="w-14 text-center"
              />
              <span className="text-xs text-muted-foreground">m</span>
              <Input
                type="number"
                inputMode="numeric"
                value={durationS}
                onChange={(e) => setDurationS(e.target.value)}
                className="w-14 text-center"
              />
              <span className="text-xs text-muted-foreground">s</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Avg heart rate (optional)</label>
            <Input
              type="number"
              inputMode="numeric"
              value={avgHr}
              onChange={(e) => setAvgHr(e.target.value)}
              placeholder="bpm"
              className="w-24"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <TemplatePicker templates={templates} type={type} onLoad={loadTemplate} />

          {draftExercises.map((ex) => {
            const lastSets = lastSessionByExercise[ex.exerciseId];
            return (
              <div key={ex.exerciseId} className="rounded-xl border border-border bg-surface p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-heading text-sm font-semibold">{ex.exerciseName}</p>
                  <button
                    onClick={() => removeExercise(ex.exerciseId)}
                    className="text-muted-foreground/40 hover:text-destructive"
                    aria-label="Remove exercise"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {lastSets && lastSets.length > 0 && (
                  <p className="mb-2 text-xs text-muted-foreground">
                    Last: {lastSets.map((s) => `${formatWeight(s.weight_kg, weightUnit)}×${s.reps}`).join(" · ")}
                  </p>
                )}

                <div className="space-y-1.5">
                  {ex.sets.map((set, i) => (
                    <SetRow
                      key={i}
                      index={i}
                      set={set}
                      unit={weightUnit}
                      isBarbell={ex.isBarbell}
                      onChange={(next) => updateSet(ex.exerciseId, i, next)}
                      onRemove={() => removeSet(ex.exerciseId, i)}
                    />
                  ))}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 gap-1.5"
                  onClick={() => duplicateLastSet(ex.exerciseId)}
                >
                  <Copy className="size-3.5" />
                  Duplicate last set
                </Button>
              </div>
            );
          })}

          <ExercisePicker
            exercises={knownExercises}
            recentExerciseIds={recentExerciseIds}
            excludeIds={draftExercises.map((e) => e.exerciseId)}
            onSelect={addExerciseToDraft}
            onExerciseCreated={(exercise) => setKnownExercises((prev) => [...prev, exercise])}
          />

          {draftExercises.length > 0 && (
            <div>
              {showSaveTemplate ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Template name"
                    className="flex-1"
                    autoFocus
                  />
                  <Button type="button" size="sm" onClick={handleSaveTemplate}>
                    Save
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowSaveTemplate(true)}
                >
                  <Save className="size-3.5" />
                  Save as template
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
          placeholder="How'd it go?"
        />
      </div>

      <Button
        className="mt-6 w-full"
        disabled={submitting || (isRun ? false : draftExercises.length === 0)}
        onClick={isRun ? handleSubmitRun : handleSubmitLift}
      >
        {submitting ? "Saving…" : "Save workout"}
      </Button>
    </div>
  );
}
