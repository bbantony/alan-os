"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { celebratePr } from "@/lib/workout/celebrate";
import { suggestNextWeight } from "@/lib/workout/progression";
import {
  WORKOUT_TYPE_LABELS,
  type DraftExercise,
  type DraftSet,
  type Exercise,
  type ExerciseHistoryEntry,
  type WeightUnit,
  type WorkoutTemplate,
  type WorkoutType,
} from "@/lib/workout/types";
import { getExerciseHistory, logRun, logWorkout, saveTemplate } from "../actions";
import { ExercisePanel } from "./exercise-panel";
import { ExercisePicker } from "./exercise-picker";
import { TemplatePicker } from "./template-picker";

function suggestionFor(history: ExerciseHistoryEntry[], unit: WeightUnit): DraftSet {
  const lastSets = history[0]?.sets ?? [];
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
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [historyByExercise, setHistoryByExercise] = useState<Record<string, ExerciseHistoryEntry[]>>({});
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
    setActiveExerciseId(exercise.id);

    const history = await getExerciseHistory(exercise.id, 4);
    setHistoryByExercise((prev) => ({ ...prev, [exercise.id]: history }));
    const initialSet = suggestionFor(history, weightUnit);
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
    if (template.exercise_ids.length > 0) setActiveExerciseId(template.exercise_ids[0]);
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
        const last = ex.sets[ex.sets.length - 1] ?? suggestionFor(historyByExercise[exerciseId] ?? [], weightUnit);
        return { ...ex, sets: [...ex.sets, { ...last }] };
      })
    );
  }

  function removeExercise(exerciseId: string) {
    setDraftExercises((prev) => {
      const next = prev.filter((ex) => ex.exerciseId !== exerciseId);
      if (activeExerciseId === exerciseId) {
        setActiveExerciseId(next[0]?.exerciseId ?? null);
      }
      return next;
    });
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
  const activeExercise = draftExercises.find((ex) => ex.exerciseId === activeExerciseId) ?? null;

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

          {draftExercises.length === 0 ? (
            <ExercisePicker
              exercises={knownExercises}
              recentExerciseIds={recentExerciseIds}
              excludeIds={[]}
              onSelect={addExerciseToDraft}
              onExerciseCreated={(exercise) => setKnownExercises((prev) => [...prev, exercise])}
            />
          ) : (
            <>
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {draftExercises.map((ex) => (
                  <button
                    key={ex.exerciseId}
                    onClick={() => setActiveExerciseId(ex.exerciseId)}
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium",
                      ex.exerciseId === activeExerciseId
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-surface hover:bg-muted"
                    )}
                  >
                    {ex.exerciseName}
                    {ex.sets.length > 0 && " ✓"}
                  </button>
                ))}
                <ExercisePicker
                  exercises={knownExercises}
                  recentExerciseIds={recentExerciseIds}
                  excludeIds={draftExercises.map((e) => e.exerciseId)}
                  onSelect={addExerciseToDraft}
                  onExerciseCreated={(exercise) => setKnownExercises((prev) => [...prev, exercise])}
                  compact
                />
              </div>

              {activeExercise && (
                <ExercisePanel
                  exercise={activeExercise}
                  history={historyByExercise[activeExercise.exerciseId] ?? []}
                  unit={weightUnit}
                  onChangeSet={(i, set) => updateSet(activeExercise.exerciseId, i, set)}
                  onRemoveSet={(i) => removeSet(activeExercise.exerciseId, i)}
                  onDuplicateLastSet={() => duplicateLastSet(activeExercise.exerciseId)}
                  onRemoveExercise={() => removeExercise(activeExercise.exerciseId)}
                />
              )}
            </>
          )}

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
