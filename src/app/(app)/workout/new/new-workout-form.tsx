"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Panel, PanelHead } from "@/components/ui/panel";
import { PageHeader, HeaderFact } from "@/components/ui/page-header";
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
    <div>
      <PageHeader
        eyebrow="Workout"
        title="New session"
        backHref="/workout"
        meta={<HeaderFact>{WORKOUT_TYPE_LABELS[type]}</HeaderFact>}
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
      <Segmented
        options={(Object.keys(WORKOUT_TYPE_LABELS) as WorkoutType[]).map((t) => ({
          value: t,
          label: WORKOUT_TYPE_LABELS[t],
        }))}
        value={type}
        onChange={setType}
      />

      <div className="flex items-stretch gap-2">
        <Input
          type="date"
          value={workoutDate}
          onChange={(e) => setWorkoutDate(e.target.value)}
          aria-label="Workout date"
          className="flex-1"
        />
        {!isRunning && (
          <div className="flex shrink-0 items-stretch border-2 border-rule bg-surface">
            {(["lbs", "kg"] as WeightUnit[]).map((u, i) => (
              <button
                key={u}
                type="button"
                onClick={() => handleUnitChange(u)}
                aria-pressed={unit === u}
                className={cn(
                  "micro-sm tap-press w-11 transition-colors",
                  i > 0 && "border-l border-hairline",
                  unit === u
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
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
            <label className="micro-sm mb-1.5 block text-muted-foreground">Distance (km)</label>
            <Input
              type="number"
              inputMode="decimal"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              placeholder="5.0"
            />
          </div>
          <div>
            <label className="micro-sm mb-1.5 block text-muted-foreground">Duration</label>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                inputMode="numeric"
                value={durationH}
                onChange={(e) => setDurationH(e.target.value)}
                className="w-14 text-center"
              />
              <span className="micro-sm text-muted-foreground">h</span>
              <Input
                type="number"
                inputMode="numeric"
                value={durationM}
                onChange={(e) => setDurationM(e.target.value)}
                className="w-14 text-center"
              />
              <span className="micro-sm text-muted-foreground">m</span>
              <Input
                type="number"
                inputMode="numeric"
                value={durationS}
                onChange={(e) => setDurationS(e.target.value)}
                className="w-14 text-center"
              />
              <span className="micro-sm text-muted-foreground">s</span>
            </div>
          </div>
          {/* Pace updates as you type distance and time. It's the number a
              runner actually cares about, so it gets the emphasised block
              rather than a caption underneath the inputs. */}
          {livePace && (
            <div className="border-2 border-rule bg-foreground px-3 py-2.5 text-background">
              <p className="micro-sm text-background/60">Pace</p>
              <p className="stat mt-1 text-2xl">{livePace}</p>
            </div>
          )}
          <div>
            <label className="micro-sm mb-1.5 block text-muted-foreground">Avg heart rate (optional)</label>
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
        <div className="flex flex-col gap-4">
          {templates.length > 0 && (
            <Panel>
              <PanelHead title="Your templates" count={templates.length} />
              <ul>
                {templates.map((t, i) => (
                  <li key={t.id} className={cn(i > 0 && "border-t border-hairline")}>
                    <button
                      type="button"
                      onClick={() => startFromTemplate(t)}
                      className="tap-press flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{t.name}</span>
                        <span className="micro-sm mt-0.5 block text-muted-foreground">
                          {t.exercise_ids.length} exercises
                        </span>
                      </span>
                      <ChevronRight
                        className="size-4 shrink-0 text-muted-foreground"
                        strokeWidth={2.5}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Button type="button" variant="outline" block onClick={() => setResistanceStarted(true)}>
            <Plus className="size-4" strokeWidth={3} />
            Start blank
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* The exercise switcher. A logged count on each chip is more useful
              mid-session than a tick — it tells you how far through you are
              without opening the panel. */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {draftExercises.map((ex) => (
              <button
                key={ex.exerciseId}
                type="button"
                onClick={() => setActiveExerciseId(ex.exerciseId)}
                aria-pressed={ex.exerciseId === activeExerciseId}
                className={cn(
                  "micro-sm tap-press shrink-0 border-2 border-rule px-2.5 py-1.5 whitespace-nowrap transition-colors",
                  ex.exerciseId === activeExerciseId
                    ? "bg-foreground text-background"
                    : "bg-surface hover:bg-muted"
                )}
              >
                {ex.exerciseName}
                {ex.sets.length > 0 && ` · ${ex.sets.length}`}
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
                <Button type="button" onClick={handleSaveTemplate}>
                  Save
                </Button>
              </div>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setShowSaveTemplate(true)}>
                <Save className="size-4" />
                Save as template
              </Button>
            )}
          </div>
        </div>
      )}

      <div>
        <label className="micro-sm mb-1.5 block text-muted-foreground">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full border-2 border-rule bg-surface px-3 py-2 text-sm outline-none focus-visible:border-primary"
          placeholder="How'd it go?"
        />
      </div>

      {(isRunning || resistanceStarted) && (
        <Button
          block
          size="lg"
          variant="invert"
          disabled={submitting || (isRunning ? false : draftExercises.length === 0)}
          onClick={isRunning ? handleSubmitRun : handleSubmitLift}
        >
          {submitting ? "Saving…" : "Save workout"}
        </Button>
      )}
      </div>
    </div>
  );
}
