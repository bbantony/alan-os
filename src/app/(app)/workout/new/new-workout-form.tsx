"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { celebratePr } from "@/lib/workout/celebrate";
import { formatPace } from "@/lib/workout/format";
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
import { getExerciseHistory, logRun, logWorkout, saveTemplate, setWeightUnit } from "../actions";
import { ExercisePanel } from "./exercise-panel";
import { ExercisePicker } from "./exercise-picker";

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
  weightUnit: initialWeightUnit,
  todayDate,
}: {
  exercises: Exercise[];
  recentExerciseIds: string[];
  templates: WorkoutTemplate[];
  weightUnit: WeightUnit;
  todayDate: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<WorkoutType>("resistance");
  const [workoutDate, setWorkoutDate] = useState(todayDate);
  const [notes, setNotes] = useState("");
  const [unit, setUnit] = useState<WeightUnit>(initialWeightUnit);
  const [knownExercises, setKnownExercises] = useState(exercises);
  const [resistanceStarted, setResistanceStarted] = useState(false);
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

  async function handleUnitChange(next: WeightUnit) {
    setUnit(next);
    await setWeightUnit(next);
  }

  async function addExerciseToDraft(exercise: Exercise) {
    setDraftExercises((prev) => [
      ...prev,
      { exerciseId: exercise.id, exerciseName: exercise.name, equipment: exercise.equipment, sets: [] },
    ]);
    setActiveExerciseId(exercise.id);

    const history = await getExerciseHistory(exercise.id, 4);
    setHistoryByExercise((prev) => ({ ...prev, [exercise.id]: history }));
    const initialSet = suggestionFor(history, unit);
    setDraftExercises((prev) =>
      prev.map((ex) => (ex.exerciseId === exercise.id ? { ...ex, sets: [initialSet] } : ex))
    );
  }

  async function startFromTemplate(template: WorkoutTemplate) {
    setResistanceStarted(true);
    for (const id of template.exercise_ids) {
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
        const last = ex.sets[ex.sets.length - 1] ?? suggestionFor(historyByExercise[exerciseId] ?? [], unit);
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
    await saveTemplate({ name, exerciseIds: draftExercises.map((e) => e.exerciseId) });
    setShowSaveTemplate(false);
    setTemplateName("");
  }

  async function handleSubmitLift() {
    if (draftExercises.length === 0 || submitting) return;
    setSubmitting(true);
    const result = await logWorkout({
      workoutDate,
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

  const totalRunSeconds =
    (Number(durationH) || 0) * 3600 + (Number(durationM) || 0) * 60 + (Number(durationS) || 0);
  const runKm = Number(distanceKm) || 0;
  const livePace = runKm > 0 && totalRunSeconds > 0 ? formatPace(runKm, totalRunSeconds) : null;

  async function handleSubmitRun() {
    if (!runKm || totalRunSeconds <= 0 || submitting) return;
    setSubmitting(true);
    await logRun({
      workoutDate,
      distanceKm: runKm,
      durationSeconds: totalRunSeconds,
      avgHr: avgHr ? Number(avgHr) : null,
      notes: notes.trim() || null,
    });
    router.push("/workout");
  }

  const isRunning = type === "running";
  const activeExercise = draftExercises.find((ex) => ex.exerciseId === activeExerciseId) ?? null;

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-24">
      <h1 className="mb-4 font-heading text-2xl font-semibold">New workout</h1>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {(Object.keys(WORKOUT_TYPE_LABELS) as WorkoutType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn(
              "tap-press rounded-lg border px-3 py-2.5 text-sm font-medium",
              type === t ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
            )}
          >
            {WORKOUT_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="mb-5 flex items-center gap-3">
        <Input type="date" value={workoutDate} onChange={(e) => setWorkoutDate(e.target.value)} className="w-40" />
        {!isRunning && (
          <div className="flex gap-0.5 rounded-lg border border-border p-0.5">
            {(["lbs", "kg"] as WeightUnit[]).map((u) => (
              <button
                key={u}
                onClick={() => handleUnitChange(u)}
                className={cn(
                  "tap-press rounded-md px-2.5 py-1 text-xs font-semibold",
                  unit === u ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {u}
              </button>
            ))}
          </div>
        )}
      </div>

      {isRunning ? (
        <div className="space-y-4">
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
          {livePace && (
            <p className="text-xs text-muted-foreground">
              Pace: <span className="tabular font-semibold text-foreground">{livePace}</span>
            </p>
          )}
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
      ) : !resistanceStarted ? (
        <div className="space-y-3">
          {templates.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your templates
              </p>
              <div className="space-y-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => startFromTemplate(t)}
                    className="tap-press flex w-full items-center justify-between rounded-xl border border-border bg-surface p-3.5 text-left hover:border-primary/40"
                  >
                    <div>
                      <p className="font-heading text-sm font-semibold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.exercise_ids.length} exercises</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full gap-1.5"
            onClick={() => setResistanceStarted(true)}
          >
            <Plus className="size-4" />
            Start blank
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {draftExercises.map((ex) => (
              <button
                key={ex.exerciseId}
                onClick={() => setActiveExerciseId(ex.exerciseId)}
                className={cn(
                  "tap-press shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium",
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

          <AnimatePresence mode="wait">
            {activeExercise && (
              <motion.div
                key={activeExercise.exerciseId}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                <ExercisePanel
                  exercise={activeExercise}
                  history={historyByExercise[activeExercise.exerciseId] ?? []}
                  unit={unit}
                  onChangeSet={(i, set) => updateSet(activeExercise.exerciseId, i, set)}
                  onRemoveSet={(i) => removeSet(activeExercise.exerciseId, i)}
                  onDuplicateLastSet={() => duplicateLastSet(activeExercise.exerciseId)}
                  onRemoveExercise={() => removeExercise(activeExercise.exerciseId)}
                />
              </motion.div>
            )}
          </AnimatePresence>

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

      {(isRunning || resistanceStarted) && (
        <Button
          className="mt-6 w-full"
          disabled={submitting || (isRunning ? false : draftExercises.length === 0)}
          onClick={isRunning ? handleSubmitRun : handleSubmitLift}
        >
          {submitting ? "Saving…" : "Save workout"}
        </Button>
      )}
    </div>
  );
}
