"use client";

import { useMemo, useState } from "react";
import { Check, Pencil, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { deleteExercise, updateExercise } from "@/app/(app)/workout/actions";
import {
  EQUIPMENT_LABELS,
  EQUIPMENT_TAGS,
  MUSCLE_GROUP_LABELS,
  type EquipmentType,
  type Exercise,
  type MuscleGroup,
} from "@/lib/workout/types";

const EQUIPMENT_TYPES = Object.keys(EQUIPMENT_LABELS) as EquipmentType[];

export function ExerciseManager({
  exercises,
  onUpdated,
  onDeleted,
}: {
  exercises: Exercise[];
  onUpdated: (exercise: Exercise) => void;
  onDeleted: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>("chest");
  const [equipment, setEquipment] = useState<EquipmentType>("other");
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);

  const sorted = useMemo(() => {
    const key = query.trim().toLowerCase();
    const list = key ? exercises.filter((e) => e.name.toLowerCase().includes(key)) : exercises;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, query]);

  function startEdit(exercise: Exercise) {
    setEditingId(exercise.id);
    setName(exercise.name);
    setMuscleGroup(exercise.muscle_group);
    setEquipment(exercise.equipment);
    setError(null);
  }

  async function handleSave(exercise: Exercise) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const result = await updateExercise({ id: exercise.id, name: trimmed, muscleGroup, equipment });
    if (result.error) {
      setError(result.error);
      return;
    }
    onUpdated({ ...exercise, name: trimmed, muscle_group: muscleGroup, equipment });
    setEditingId(null);
    toast.success("Exercise updated");
  }

  async function handleDelete(exercise: Exercise) {
    if (!window.confirm(`Delete "${exercise.name}"? This can't be undone.`)) return;
    setDeleteError(null);
    const result = await deleteExercise({ id: exercise.id });
    if (result.error) {
      setDeleteError({ id: exercise.id, message: result.error });
      return;
    }
    onDeleted(exercise.id);
    toast.success("Exercise deleted");
  }

  return (
    <div>
      <div className="relative mb-2">
        <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises…"
          className="pl-8"
        />
      </div>

      <ul className="max-h-96 divide-y divide-hairline overflow-y-auto border-2 border-rule bg-surface">
        {sorted.map((exercise) => (
          <li key={exercise.id} className="px-4 py-3 text-sm">
            {editingId === exercise.id ? (
              <div className="space-y-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                <Select
                  value={muscleGroup}
                  onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
                  className="h-8"
                >
                  {(Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]).map((mg) => (
                    <option key={mg} value={mg}>
                      {MUSCLE_GROUP_LABELS[mg]}
                    </option>
                  ))}
                </Select>
                <Select
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value as EquipmentType)}
                  className="h-8"
                >
                  {EQUIPMENT_TYPES.map((eq) => (
                    <option key={eq} value={eq}>
                      {EQUIPMENT_LABELS[eq]}
                    </option>
                  ))}
                </Select>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" className="flex-1 gap-1.5" onClick={() => handleSave(exercise)}>
                    <Check className="size-3.5" />
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {exercise.name}
                      {EQUIPMENT_TAGS[exercise.equipment] && (
                        <span className="ml-1.5 micro-sm border border-hairline px-1.5 py-0.5 text-muted-foreground">
                          {EQUIPMENT_TAGS[exercise.equipment]}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{MUSCLE_GROUP_LABELS[exercise.muscle_group]}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      onClick={() => startEdit(exercise)}
                      className="tap-press text-muted-foreground/50 hover:text-foreground"
                      aria-label="Edit exercise"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(exercise)}
                      className="tap-press text-muted-foreground/40 hover:text-destructive"
                      aria-label="Delete exercise"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                {deleteError?.id === exercise.id && (
                  <p className="mt-1 text-xs text-destructive">{deleteError.message}</p>
                )}
              </div>
            )}
          </li>
        ))}
        {sorted.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">No matches.</li>
        )}
      </ul>
    </div>
  );
}
