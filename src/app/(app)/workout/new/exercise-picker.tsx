"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { findPossibleDuplicate } from "@/lib/workout/exercise-match";
import {
  EQUIPMENT_LABELS,
  EQUIPMENT_TAGS,
  MUSCLE_GROUP_LABELS,
  type EquipmentType,
  type Exercise,
  type MuscleGroup,
} from "@/lib/workout/types";
import { addExercise } from "../actions";

const MUSCLE_GROUPS = Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[];
const EQUIPMENT_TYPES = Object.keys(EQUIPMENT_LABELS) as EquipmentType[];

/**
 * Full-screen, multi-select exercise picker.
 *
 * Replaces a small modal that added exactly one exercise per open, reached
 * from a 36px dashed square at the end of a horizontally-scrolling chip row.
 * Building a five-exercise session meant five round trips through a scroll,
 * a tap, a search and a dialog — which is what Alan described as "very
 * inefficient", and he was right.
 *
 * Three things fix it: it fills the screen, it's grouped by body part so you
 * can find things without typing, and you tick as many as you want and add
 * them all at once. Recently used floats to the top because the honest truth
 * is that most sessions reuse the same handful of lifts.
 */
export function ExercisePicker({
  exercises,
  recentExerciseIds,
  excludeIds,
  priorityGroup = null,
  onSelect,
  onExerciseCreated,
  open,
  onOpenChange,
}: {
  exercises: Exercise[];
  recentExerciseIds: string[];
  /** Already in the session — shown as locked-in rather than hidden. */
  excludeIds: string[];
  /**
   * Float one body part to the top of the list.
   *
   * Set when you arrive from the "next up" suggestion on the Workout screen —
   * if the app just told you legs have gone nine days, the leg exercises should
   * be the first thing under your thumb rather than four scrolls down.
   */
  priorityGroup?: MuscleGroup | null;
  /** Called once with everything ticked, in the order they were ticked. */
  onSelect: (exercises: Exercise[]) => void;
  onExerciseCreated: (exercise: Exercise) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMuscleGroup, setNewMuscleGroup] = useState<MuscleGroup>("chest");
  const [newEquipment, setNewEquipment] = useState<EquipmentType>("other");
  const [error, setError] = useState<string | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState<Exercise | null>(null);

  const inSession = useMemo(() => new Set(excludeIds), [excludeIds]);
  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  const key = query.trim().toLowerCase();
  const matches = (e: Exercise) => !key || e.name.toLowerCase().includes(key);

  // Recently used, minus anything already in the session — the shortcut only
  // helps if it isn't full of things you've already got.
  const recent = useMemo(
    () =>
      recentExerciseIds
        .map((id) => byId.get(id))
        .filter((e): e is Exercise => !!e && !inSession.has(e.id) && matches(e))
        .slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recentExerciseIds, byId, inSession, key]
  );

  const recentIds = useMemo(() => new Set(recent.map((e) => e.id)), [recent]);

  const groups = useMemo(
    () =>
      MUSCLE_GROUPS.map((group) => ({
        group,
        items: exercises
          .filter((e) => e.muscle_group === group && matches(e) && !recentIds.has(e.id))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
        .filter((g) => g.items.length > 0)
        .sort((a, b) => {
          if (a.group === priorityGroup) return -1;
          if (b.group === priorityGroup) return 1;
          return 0;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exercises, key, recentIds, priorityGroup]
  );

  const totalMatches = recent.length + groups.reduce((n, g) => n + g.items.length, 0);

  function reset() {
    setQuery("");
    setPicked([]);
    setAddingNew(false);
    setNewName("");
    setNewEquipment("other");
    setError(null);
    setConfirmDuplicate(null);
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function confirm() {
    const chosen = picked.map((id) => byId.get(id)).filter((e): e is Exercise => !!e);
    if (chosen.length > 0) onSelect(chosen);
    close();
  }

  async function handleCreate(force = false) {
    setError(null);
    const trimmed = newName.trim();
    if (!trimmed) return;

    if (!force) {
      const dup = findPossibleDuplicate(trimmed, exercises);
      if (dup) {
        setConfirmDuplicate(dup);
        return;
      }
    }

    const result = await addExercise({
      name: trimmed,
      muscleGroup: newMuscleGroup,
      equipment: newEquipment,
    });
    if (result.error || !result.exercise) {
      setError(result.error ?? "Couldn't add that exercise.");
      return;
    }
    onExerciseCreated(result.exercise);
    // A brand-new exercise is almost certainly wanted in this session, so it
    // arrives already ticked rather than making you find it again.
    setPicked((prev) => [...prev, result.exercise!.id]);
    setAddingNew(false);
    setNewName("");
    setConfirmDuplicate(null);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add exercises"
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {/* ---------------- Header ---------------- */}
      <div className="shrink-0 border-b-2 border-rule bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 pt-4 pb-3">
          <div className="min-w-0">
            <p className="micro-sm text-muted-foreground">Build your session</p>
            <h2 className="display mt-1">Add exercises</h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="tap-press flex size-9 shrink-0 items-center justify-center border-2 border-rule bg-surface transition-colors hover:bg-muted"
          >
            <X className="size-4" strokeWidth={2.5} />
          </button>
        </div>

        <div className="mx-auto max-w-2xl px-4 pb-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={2.5}
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exercises…"
              aria-label="Search exercises"
              className="h-11 pl-10"
              autoFocus
            />
          </div>
        </div>
      </div>

      {/* ---------------- Scrolling list ---------------- */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-4">
          {addingNew ? (
            <div className="border-2 border-rule bg-surface">
              <p className="micro border-b-2 border-rule px-3 py-2">New exercise</p>
              <div className="flex flex-col gap-3 p-3">
                <div>
                  <label className="micro-sm mb-1.5 block text-muted-foreground">Name</label>
                  <Input
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      setConfirmDuplicate(null);
                    }}
                    placeholder="e.g. Incline Dumbbell Press"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="micro-sm mb-1.5 block text-muted-foreground">
                      Body part
                    </label>
                    <Select
                      value={newMuscleGroup}
                      onChange={(e) => setNewMuscleGroup(e.target.value as MuscleGroup)}
                    >
                      {MUSCLE_GROUPS.map((mg) => (
                        <option key={mg} value={mg}>
                          {MUSCLE_GROUP_LABELS[mg]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="micro-sm mb-1.5 block text-muted-foreground">
                      Equipment
                    </label>
                    <Select
                      value={newEquipment}
                      onChange={(e) => setNewEquipment(e.target.value as EquipmentType)}
                    >
                      {EQUIPMENT_TYPES.map((eq) => (
                        <option key={eq} value={eq}>
                          {EQUIPMENT_LABELS[eq]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {newEquipment === "barbell" && (
                  <p className="micro-sm text-muted-foreground">
                    Barbell lets you enter plate weight instead of the total.
                  </p>
                )}

                {confirmDuplicate && (
                  <div className="border-2 border-accent p-3">
                    <p className="text-sm">
                      Did you mean &ldquo;{confirmDuplicate.name}&rdquo;?
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          toggle(confirmDuplicate.id);
                          setAddingNew(false);
                          setNewName("");
                          setConfirmDuplicate(null);
                        }}
                      >
                        Use that
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleCreate(true)}
                      >
                        Add as new
                      </Button>
                    </div>
                  </div>
                )}

                {error && (
                  <p className="border-2 border-destructive px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setAddingNew(false);
                      setConfirmDuplicate(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    disabled={!newName.trim()}
                    onClick={() => handleCreate()}
                  >
                    Create
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {recent.length > 0 && (
                <ExerciseGroup
                  label="Recent"
                  items={recent}
                  picked={picked}
                  onToggle={toggle}
                />
              )}

              {groups.map(({ group, items }) => (
                <ExerciseGroup
                  key={group}
                  label={MUSCLE_GROUP_LABELS[group]}
                  items={items}
                  picked={picked}
                  onToggle={toggle}
                />
              ))}

              {totalMatches === 0 && (
                <div className="hatch border-2 border-rule px-4 py-8 text-center">
                  <p className="micro-sm text-muted-foreground">
                    {key ? `Nothing matching “${query}”` : "No exercises yet"}
                  </p>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                block
                onClick={() => {
                  setNewName(query);
                  setAddingNew(true);
                }}
              >
                <Plus className="size-4" strokeWidth={3} />
                {key ? `Create “${query}”` : "Create a new exercise"}
              </Button>

              {inSession.size > 0 && (
                <p className="micro-sm text-center text-muted-foreground">
                  {inSession.size} already in this session
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- Confirm bar ---------------- */}
      {!addingNew && (
        <div
          className="shrink-0 border-t-2 border-rule bg-surface"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto max-w-2xl p-3">
            <Button
              type="button"
              block
              size="lg"
              variant="invert"
              disabled={picked.length === 0}
              onClick={confirm}
            >
              {picked.length === 0
                ? "Pick some exercises"
                : `Add ${picked.length} exercise${picked.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExerciseGroup({
  label,
  items,
  picked,
  onToggle,
}: {
  label: string;
  items: Exercise[];
  picked: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <section className="border-2 border-rule bg-surface">
      <p className="micro border-b-2 border-rule px-3 py-2">{label}</p>
      <ul>
        {items.map((exercise, i) => {
          const isPicked = picked.includes(exercise.id);
          const order = picked.indexOf(exercise.id) + 1;
          return (
            <li key={exercise.id} className={cn(i > 0 && "border-t border-hairline")}>
              <button
                type="button"
                onClick={() => onToggle(exercise.id)}
                aria-pressed={isPicked}
                className={cn(
                  "tap-press flex w-full items-center gap-3 px-3 py-3 text-left transition-colors",
                  isPicked ? "bg-foreground text-background" : "hover:bg-muted"
                )}
              >
                {/* The tick carries a number, so when you've picked five you
                    can see the order they'll be added in. */}
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center border-2",
                    isPicked
                      ? "border-background bg-background text-foreground"
                      : "border-rule"
                  )}
                >
                  {isPicked ? (
                    <span className="micro-sm tabular">{order}</span>
                  ) : (
                    <Check className="size-3 opacity-0" strokeWidth={3} />
                  )}
                </span>

                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {exercise.name}
                </span>

                {EQUIPMENT_TAGS[exercise.equipment] && (
                  <Tag
                    className={cn(
                      "shrink-0",
                      isPicked && "border-background/50 text-background/80"
                    )}
                  >
                    {EQUIPMENT_TAGS[exercise.equipment]}
                  </Tag>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
