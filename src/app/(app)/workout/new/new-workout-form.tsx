"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  List,
  Plus,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Panel } from "@/components/ui/panel";
import { PageHeader, HeaderFact } from "@/components/ui/page-header";
import { DateField } from "@/components/ui/date-field";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { MECHANICAL } from "@/lib/motion";
import { celebratePr } from "@/lib/workout/celebrate";
import { formatPace } from "@/lib/workout/format";
import { barWeightKg, formatWeight } from "@/lib/workout/units";
import { suggestNextWeight } from "@/lib/workout/progression";
import { PR_KIND_LABELS } from "@/lib/workout/pr";
import {
  WORKOUT_TYPE_LABELS,
  type DraftExercise,
  type DraftSet,
  type EquipmentType,
  type Exercise,
  type ExerciseHistoryEntry,
  type MuscleGroup,
  type WeightUnit,
  type WorkoutType,
} from "@/lib/workout/types";
import { getExerciseHistory, logRun, logWorkout, saveTemplate, setWeightUnit } from "../actions";
import { saveDraft, type WorkoutDraft } from "../personal-actions";
import { ExercisePanel } from "./exercise-panel";
import { ExercisePicker } from "./exercise-picker";

function suggestionFor(
  history: ExerciseHistoryEntry[],
  unit: WeightUnit,
  weightIncrement: number | null,
  equipment: EquipmentType
): DraftSet {
  const lastSets = history[0]?.sets ?? [];
  const suggestion = suggestNextWeight(
    lastSets.map((s) => ({ reps: s.reps, weightKg: s.weight_kg })),
    unit,
    weightIncrement
  );
  if (suggestion) return { reps: suggestion.reps, weightKg: suggestion.weightKg };
  // No history to go on. For a barbell lift, zero would mean "an invisible
  // bar" — the set-row shows max(0, total − bar) as "Bar + X", and a set left
  // untouched saves whatever sits here. Start at the empty bar instead.
  return { reps: 8, weightKg: equipment === "barbell" ? barWeightKg(unit) : 0 };
}

/** How long to wait after the last change before writing the draft. */
const AUTOSAVE_DELAY_MS = 1500;

export function NewWorkoutForm({
  exercises,
  recentExerciseIds,
  weightUnit: initialWeightUnit,
  weightIncrement,
  todayDate,
  initialDraft,
  startExerciseIds,
  startMuscle,
}: {
  exercises: Exercise[];
  recentExerciseIds: string[];
  weightUnit: WeightUnit;
  /** Settings → Workout, in the display unit. Null = 2.5 lb / 1 kg. */
  weightIncrement: number | null;
  todayDate: string;
  /** An unfinished session to pick back up, if there is one. */
  initialDraft: WorkoutDraft | null;
  /** Pre-loaded exercises, from "repeat last session" or a template. */
  startExerciseIds: string[];
  /** From the "next up" suggestion — floats that body part up the picker. */
  startMuscle: MuscleGroup | null;
}) {
  const router = useRouter();

  // Everything below is seeded from the draft when one exists, rather than
  // being restored by an effect after the first render — an effect would flash
  // an empty session and then fill it in, which mid-workout reads as "it lost
  // my sets" for a beat.
  const draftPayload = initialDraft?.payload;
  const restored = (draftPayload?.exercises ?? []).map((ex) => ({
    exerciseId: ex.exerciseId,
    exerciseName: ex.exerciseName,
    equipment: ex.equipment,
    sets: ex.sets,
  })) as DraftExercise[];

  // Exercises chosen before arriving (repeat last session, or a template) are
  // resolved at render too, not in an effect — everything needed is already in
  // props, and seeding state is what stops the screen rendering empty and then
  // filling in.
  const seeded = (
    restored.length > 0
      ? restored
      : startExerciseIds
          .map((id) => exercises.find((e) => e.id === id))
          .filter((e): e is Exercise => !!e)
          .map((e) => ({
            exerciseId: e.id,
            exerciseName: e.name,
            equipment: e.equipment,
            sets: [] as DraftSet[],
          }))
  ) as DraftExercise[];

  const [type, setType] = useState<WorkoutType>(draftPayload?.type ?? "resistance");
  const [workoutDate, setWorkoutDate] = useState(draftPayload?.workoutDate ?? todayDate);
  const [notes, setNotes] = useState(draftPayload?.notes ?? "");
  const [unit, setUnit] = useState<WeightUnit>(initialWeightUnit);
  const [knownExercises, setKnownExercises] = useState(exercises);
  const [draftExercises, setDraftExercises] = useState<DraftExercise[]>(seeded);
  const [activeIndex, setActiveIndex] = useState(0);
  const [historyByExercise, setHistoryByExercise] = useState<
    Record<string, ExerciseHistoryEntry[]>
  >({});
  // Nothing to log and nothing pre-chosen means the only sensible next step
  // is picking exercises, so the picker opens itself rather than showing an
  // empty screen with a button on it.
  const [pickerOpen, setPickerOpen] = useState(seeded.length === 0);
  const [showOverview, setShowOverview] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [distanceKm, setDistanceKm] = useState("");
  const [durationH, setDurationH] = useState("0");
  const [durationM, setDurationM] = useState("");
  const [durationS, setDurationS] = useState("");
  const [avgHr, setAvgHr] = useState("");

  const isRunning = type === "running";
  const activeExercise = draftExercises[activeIndex] ?? null;
  const isLast = activeIndex >= draftExercises.length - 1;

  const loggedSetCount = useMemo(
    () => draftExercises.reduce((n, ex) => n + ex.sets.length, 0),
    [draftExercises]
  );

  // ---------------------------------------------------------------------
  // Starting the session
  // ---------------------------------------------------------------------

  const startedRef = useRef(false);

  useEffect(() => {
    // Runs once, and only talks to the network — every piece of state this
    // screen opens with was already seeded at render. Its job is to pull each
    // exercise's history so "last time" has something to show, and to put an
    // opening set on anything that arrived empty.
    if (startedRef.current) return;
    startedRef.current = true;
    if (seeded.length === 0) return;

    if (restored.length > 0) toast.success("Picked up where you left off");

    for (const ex of seeded) {
      getExerciseHistory(ex.exerciseId, 4).then((history) => {
        setHistoryByExercise((prev) => ({ ...prev, [ex.exerciseId]: history }));
        setDraftExercises((prev) =>
          prev.map((d) =>
            d.exerciseId === ex.exerciseId && d.sets.length === 0
              ? { ...d, sets: [suggestionFor(history, unit, weightIncrement, ex.equipment)] }
              : d
          )
        );
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------
  // Autosave
  // ---------------------------------------------------------------------

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // THE POINT OF ALL OF THIS: before, `draftExercises` lived only in React
    // state, so a locked phone or a browser evicting the tab took every set
    // logged so far with it — silently, mid-gym. Debounced rather than saved on
    // every keystroke, because a stepper tapped ten times in a row should cost
    // one write, not ten.
    if (isRunning || draftExercises.length === 0) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft({
        type,
        workoutDate,
        notes,
        exercises: draftExercises.map((ex) => ({
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          equipment: ex.equipment,
          sets: ex.sets,
        })),
      });
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draftExercises, type, workoutDate, notes, isRunning]);

  async function handleUnitChange(next: WeightUnit) {
    setUnit(next);
    await setWeightUnit(next);
  }

  /** Adds a batch from the picker and lands you on the first one added. */
  async function addExercisesToDraft(chosen: Exercise[]) {
    if (chosen.length === 0) return;
    const firstNewIndex = draftExercises.length;

    setDraftExercises((prev) => [
      ...prev,
      ...chosen.map((exercise) => ({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        equipment: exercise.equipment,
        sets: [] as DraftSet[],
      })),
    ]);
    setActiveIndex(firstNewIndex);

    // History drives the opening set suggestion, so it's fetched per exercise
    // and applied as each one lands rather than blocking the whole batch.
    for (const exercise of chosen) {
      const history = await getExerciseHistory(exercise.id, 4);
      setHistoryByExercise((prev) => ({ ...prev, [exercise.id]: history }));
      setDraftExercises((prev) =>
        prev.map((ex) =>
          ex.exerciseId === exercise.id && ex.sets.length === 0
            ? { ...ex, sets: [suggestionFor(history, unit, weightIncrement, exercise.equipment)] }
            : ex
        )
      );
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
        ex.exerciseId === exerciseId
          ? { ...ex, sets: ex.sets.filter((_, i) => i !== index) }
          : ex
      )
    );
  }

  function duplicateLastSet(exerciseId: string) {
    setDraftExercises((prev) =>
      prev.map((ex) => {
        if (ex.exerciseId !== exerciseId) return ex;
        const last =
          ex.sets[ex.sets.length - 1] ??
          suggestionFor(historyByExercise[exerciseId] ?? [], unit, weightIncrement, ex.equipment);
        return { ...ex, sets: [...ex.sets, { ...last }] };
      })
    );
  }

  function removeExercise(exerciseId: string) {
    setDraftExercises((prev) => {
      const next = prev.filter((ex) => ex.exerciseId !== exerciseId);
      setActiveIndex((i) => Math.max(0, Math.min(i, next.length - 1)));
      return next;
    });
  }

  async function handleSaveTemplate() {
    const name = templateName.trim();
    if (!name || draftExercises.length === 0) return;
    await saveTemplate({ name, exerciseIds: draftExercises.map((e) => e.exerciseId) });
    setShowSaveTemplate(false);
    setTemplateName("");
    toast.success(`"${name}" saved as a template`);
  }

  async function handleSubmitLift() {
    if (draftExercises.length === 0 || submitting) return;
    setSubmitting(true);
    // Stop any pending autosave from resurrecting the draft after the server
    // has just deleted it as part of logging the workout.
    if (saveTimer.current) clearTimeout(saveTimer.current);

    const result = await logWorkout({
      workoutDate,
      notes: notes.trim() || null,
      exercises: draftExercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        sets: ex.sets,
      })),
    });

    // The celebration now says what was actually beaten and by how much,
    // instead of just announcing that something happened.
    if (result.prs.length > 0) {
      celebratePr();
      const top = result.prs[0];
      const gain =
        top.previousValue !== null
          ? ` — up from ${formatWeight(top.previousValue, unit)}`
          : "";
      toast.success(
        `${top.exerciseName}: ${PR_KIND_LABELS[top.kind].toLowerCase()}${gain}`
      );
    }
    router.push("/workout");
  }

  const totalRunSeconds =
    (Number(durationH) || 0) * 3600 + (Number(durationM) || 0) * 60 + (Number(durationS) || 0);
  const runKm = Number(distanceKm) || 0;
  const livePace = runKm > 0 && totalRunSeconds > 0 ? formatPace(runKm, totalRunSeconds) : null;

  async function handleSubmitRun() {
    if (!runKm || totalRunSeconds <= 0 || submitting) return;
    setSubmitting(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await logRun({
      workoutDate,
      distanceKm: runKm,
      durationSeconds: totalRunSeconds,
      avgHr: avgHr ? Number(avgHr) : null,
      notes: notes.trim() || null,
    });
    router.push("/workout");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Workout"
        title={initialDraft ? "Session in progress" : "New session"}
        backHref="/workout"
        meta={
          <>
            <HeaderFact>{WORKOUT_TYPE_LABELS[type]}</HeaderFact>
            {!isRunning && draftExercises.length > 0 && (
              <HeaderFact>
                {draftExercises.length} exercises · {loggedSetCount} sets
              </HeaderFact>
            )}
            {!isRunning && draftExercises.length > 0 && (
              <HeaderFact>Saved as you go</HeaderFact>
            )}
          </>
        }
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
          <DateField
            value={workoutDate}
            onChange={setWorkoutDate}
            clearable={false}
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

        {/* ================= RUNNING ================= */}
        {isRunning ? (
          <div className="flex flex-col gap-3">
            <div>
              <label className="micro-sm mb-1.5 block text-muted-foreground">
                Distance (km)
              </label>
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
                  aria-label="Hours"
                  className="w-16 text-center"
                />
                <span className="micro-sm text-muted-foreground">h</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={durationM}
                  onChange={(e) => setDurationM(e.target.value)}
                  aria-label="Minutes"
                  className="w-16 text-center"
                />
                <span className="micro-sm text-muted-foreground">m</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={durationS}
                  onChange={(e) => setDurationS(e.target.value)}
                  aria-label="Seconds"
                  className="w-16 text-center"
                />
                <span className="micro-sm text-muted-foreground">s</span>
              </div>
            </div>

            {livePace && (
              <div className="border-2 border-rule bg-foreground px-3 py-2.5 text-background">
                <p className="micro-sm text-background/60">Pace</p>
                <p className="stat mt-1 text-2xl">{livePace}</p>
              </div>
            )}

            <div>
              <label className="micro-sm mb-1.5 block text-muted-foreground">
                Average heart rate (optional)
              </label>
              <Input
                type="number"
                inputMode="numeric"
                value={avgHr}
                onChange={(e) => setAvgHr(e.target.value)}
                placeholder="bpm"
                className="w-28"
              />
            </div>
          </div>
        ) : draftExercises.length === 0 ? (
          /* ================= NOTHING PICKED YET ================= */
          <div className="hatch border-2 border-rule px-4 py-10 text-center">
            <p className="micro-sm text-muted-foreground">No exercises yet</p>
            <div className="mt-3 flex justify-center">
              <Button type="button" onClick={() => setPickerOpen(true)}>
                <Plus className="size-4" strokeWidth={3} />
                Add exercises
              </Button>
            </div>
          </div>
        ) : (
          /* ================= ONE EXERCISE AT A TIME ================= */
          <div className="flex flex-col gap-4">
            {/* Position in the session. Tapping it opens the full running
                order, so "one at a time" never means "lost". */}
            <Panel>
              <button
                type="button"
                onClick={() => setShowOverview((v) => !v)}
                aria-expanded={showOverview}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted"
              >
                <span className="micro">
                  Exercise {activeIndex + 1} of {draftExercises.length}
                </span>
                <span className="micro-sm flex items-center gap-1.5 text-muted-foreground">
                  <List className="size-3.5" />
                  {showOverview ? "Hide" : "All"}
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform duration-150",
                      showOverview && "rotate-180"
                    )}
                  />
                </span>
              </button>

              <div className="flex h-2 border-t-2 border-rule">
                {draftExercises.map((ex, i) => (
                  <span
                    key={ex.exerciseId}
                    className={cn(
                      "flex-1",
                      i > 0 && "border-l border-hairline",
                      ex.sets.length > 0
                        ? "bg-primary"
                        : i === activeIndex
                          ? "bg-muted-foreground/40"
                          : "bg-muted"
                    )}
                  />
                ))}
              </div>

              {showOverview && (
                <ul className="border-t-2 border-rule">
                  {draftExercises.map((ex, i) => (
                    <li key={ex.exerciseId} className={cn(i > 0 && "border-t border-hairline")}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveIndex(i);
                          setShowOverview(false);
                        }}
                        className={cn(
                          "tap-press flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                          i === activeIndex
                            ? "bg-foreground text-background"
                            : "hover:bg-muted"
                        )}
                      >
                        <span className="micro-sm w-4 shrink-0 tabular">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {ex.exerciseName}
                        </span>
                        {ex.sets.length > 0 ? (
                          <span
                            className={cn(
                              "micro-sm flex items-center gap-1",
                              i === activeIndex ? "text-background/70" : "text-ok"
                            )}
                          >
                            <Check className="size-3" strokeWidth={3} />
                            {ex.sets.length}
                          </span>
                        ) : (
                          <Tag
                            className={cn(i === activeIndex && "border-background/50 text-background/70")}
                          >
                            To do
                          </Tag>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <AnimatePresence mode="wait">
              {activeExercise && (
                <motion.div
                  key={activeExercise.exerciseId}
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={MECHANICAL}
                >
                  <ExercisePanel
                    exercise={activeExercise}
                    history={historyByExercise[activeExercise.exerciseId] ?? []}
                    unit={unit}
                    weightIncrement={weightIncrement}
                    onChangeSet={(i, set) => updateSet(activeExercise.exerciseId, i, set)}
                    onRemoveSet={(i) => removeSet(activeExercise.exerciseId, i)}
                    onDuplicateLastSet={() => duplicateLastSet(activeExercise.exerciseId)}
                    onRemoveExercise={() => removeExercise(activeExercise.exerciseId)}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Prev / Next as one ruled control, sized for a hand mid-set. */}
            <div className="flex items-stretch border-2 border-rule bg-surface">
              <button
                type="button"
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                disabled={activeIndex === 0}
                className="micro tap-press flex flex-1 items-center justify-center gap-2 py-4 transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="size-4" strokeWidth={3} />
                Prev
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveIndex((i) => Math.min(draftExercises.length - 1, i + 1))
                }
                disabled={isLast}
                className={cn(
                  "micro tap-press flex flex-1 items-center justify-center gap-2 border-l-2 border-rule py-4 transition-colors",
                  isLast
                    ? "opacity-30"
                    : "bg-foreground text-background hover:opacity-90"
                )}
              >
                Next
                <ChevronRight className="size-4" strokeWidth={3} />
              </button>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setPickerOpen(true)}
              >
                <Plus className="size-4" strokeWidth={3} />
                Add exercises
              </Button>
              {showSaveTemplate ? null : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowSaveTemplate(true)}
                >
                  <Save className="size-4" />
                  Template
                </Button>
              )}
            </div>

            {showSaveTemplate && (
              <div className="flex gap-2">
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Template name (e.g. Push day)"
                  autoFocus
                />
                <Button type="button" onClick={handleSaveTemplate}>
                  Save
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ================= NOTES + SAVE ================= */}
        <div>
          <label className="micro-sm mb-1.5 block text-muted-foreground">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border-2 border-rule bg-surface px-3 py-2 text-sm outline-none focus-visible:border-primary"
            placeholder="How'd it go?"
          />
        </div>

        <Button
          block
          size="lg"
          variant="invert"
          disabled={submitting || (isRunning ? false : loggedSetCount === 0)}
          onClick={isRunning ? handleSubmitRun : handleSubmitLift}
        >
          {submitting
            ? "Saving…"
            : isRunning
              ? "Save run"
              : `Finish session · ${loggedSetCount} set${loggedSetCount === 1 ? "" : "s"}`}
        </Button>
      </div>

      <ExercisePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        exercises={knownExercises}
        recentExerciseIds={recentExerciseIds}
        excludeIds={draftExercises.map((e) => e.exerciseId)}
        priorityGroup={startMuscle}
        onSelect={addExercisesToDraft}
        onExerciseCreated={(exercise) => setKnownExercises((prev) => [...prev, exercise])}
      />
    </div>
  );
}
