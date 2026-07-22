"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

export function ExercisePicker({
  exercises,
  recentExerciseIds,
  excludeIds,
  onSelect,
  onExerciseCreated,
  compact,
}: {
  exercises: Exercise[];
  recentExerciseIds: string[];
  excludeIds: string[];
  onSelect: (exercise: Exercise) => void;
  onExerciseCreated: (exercise: Exercise) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMuscleGroup, setNewMuscleGroup] = useState<MuscleGroup>("chest");
  const [newEquipment, setNewEquipment] = useState<EquipmentType>("other");
  const [error, setError] = useState<string | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState<Exercise | null>(null);

  const available = useMemo(
    () => exercises.filter((e) => !excludeIds.includes(e.id)),
    [exercises, excludeIds]
  );

  const filtered = useMemo(() => {
    const key = query.trim().toLowerCase();
    const list = key ? available.filter((e) => e.name.toLowerCase().includes(key)) : available;
    const recentIndex = new Map(recentExerciseIds.map((id, i) => [id, i]));
    return [...list].sort((a, b) => {
      const ra = recentIndex.get(a.id) ?? Infinity;
      const rb = recentIndex.get(b.id) ?? Infinity;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  }, [available, query, recentExerciseIds]);

  function reset() {
    setQuery("");
    setAddingNew(false);
    setNewName("");
    setNewEquipment("other");
    setError(null);
    setConfirmDuplicate(null);
  }

  function pick(exercise: Exercise) {
    onSelect(exercise);
    setOpen(false);
    reset();
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

    const result = await addExercise({ name: trimmed, muscleGroup: newMuscleGroup, equipment: newEquipment });
    if (result.error || !result.exercise) {
      setError(result.error ?? "Couldn't add that exercise.");
      return;
    }
    onExerciseCreated(result.exercise);
    pick(result.exercise);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      {compact ? (
        <DialogTrigger
          render={
            <button
              type="button"
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:bg-muted"
              aria-label="Add exercise"
            />
          }
        >
          <Plus className="size-4" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button type="button" variant="outline" className="w-full gap-1.5" />}>
          <Plus className="size-4" />
          Add exercise
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[70vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add exercise</DialogTitle>
        </DialogHeader>

        {!addingNew ? (
          <>
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search exercises…"
                className="pl-8"
                autoFocus
              />
            </div>

            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {filtered.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => pick(exercise)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span>
                      {exercise.name}
                      {EQUIPMENT_TAGS[exercise.equipment] && (
                        <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {EQUIPMENT_TAGS[exercise.equipment]}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {MUSCLE_GROUP_LABELS[exercise.muscle_group]}
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">No matches.</p>
              )}
            </ul>

            <Button
              type="button"
              variant="ghost"
              className="gap-1.5"
              onClick={() => {
                setNewName(query);
                setAddingNew(true);
              }}
            >
              <Plus className="size-4" />
              Add a new exercise
            </Button>
          </>
        ) : (
          <div className="space-y-3">
            <Input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setConfirmDuplicate(null);
              }}
              placeholder="Exercise name"
              autoFocus
            />
            <select
              value={newMuscleGroup}
              onChange={(e) => setNewMuscleGroup(e.target.value as MuscleGroup)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
            >
              {MUSCLE_GROUPS.map((mg) => (
                <option key={mg} value={mg}>
                  {MUSCLE_GROUP_LABELS[mg]}
                </option>
              ))}
            </select>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Equipment</label>
              <select
                value={newEquipment}
                onChange={(e) => setNewEquipment(e.target.value as EquipmentType)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                {EQUIPMENT_TYPES.map((eq) => (
                  <option key={eq} value={eq}>
                    {EQUIPMENT_LABELS[eq]}
                  </option>
                ))}
              </select>
              {newEquipment === "barbell" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Barbell exercises let you enter plate weight instead of the total.
                </p>
              )}
            </div>

            {confirmDuplicate && (
              <div className="rounded-lg border border-accent/40 bg-accent/10 p-2 text-xs">
                <p className="mb-2">Did you mean &ldquo;{confirmDuplicate.name}&rdquo;?</p>
                <div className="flex gap-2">
                  <Button type="button" size="xs" onClick={() => pick(confirmDuplicate)}>
                    Use that
                  </Button>
                  <Button type="button" size="xs" variant="outline" onClick={() => handleCreate(true)}>
                    Add as new
                  </Button>
                </div>
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setAddingNew(false)}>
                Back
              </Button>
              <Button type="button" className="flex-1" onClick={() => handleCreate()}>
                Add
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
