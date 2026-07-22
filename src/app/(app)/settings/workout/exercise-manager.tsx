"use client";

import { useMemo, useState } from "react";
import { Check, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateExercise } from "@/app/(app)/workout/actions";
import { MUSCLE_GROUP_LABELS, type Exercise, type MuscleGroup } from "@/lib/workout/types";

export function ExerciseManager({
  exercises,
  onUpdated,
}: {
  exercises: Exercise[];
  onUpdated: (exercise: Exercise) => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>("chest");
  const [isBarbell, setIsBarbell] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const key = query.trim().toLowerCase();
    const list = key ? exercises.filter((e) => e.name.toLowerCase().includes(key)) : exercises;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, query]);

  function startEdit(exercise: Exercise) {
    setEditingId(exercise.id);
    setName(exercise.name);
    setMuscleGroup(exercise.muscle_group);
    setIsBarbell(exercise.is_barbell);
    setError(null);
  }

  async function handleSave(exercise: Exercise) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const result = await updateExercise({ id: exercise.id, name: trimmed, muscleGroup, isBarbell });
    if (result.error) {
      setError(result.error);
      return;
    }
    onUpdated({ ...exercise, name: trimmed, muscle_group: muscleGroup, is_barbell: isBarbell });
    setEditingId(null);
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

      <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-surface">
        {sorted.map((exercise) => (
          <li key={exercise.id} className="px-4 py-3 text-sm">
            {editingId === exercise.id ? (
              <div className="space-y-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                <select
                  value={muscleGroup}
                  onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                >
                  {(Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]).map((mg) => (
                    <option key={mg} value={mg}>
                      {MUSCLE_GROUP_LABELS[mg]}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={isBarbell}
                    onChange={(e) => setIsBarbell(e.target.checked)}
                    className="size-4 rounded border-input"
                  />
                  Barbell exercise (enter plate weight, not total)
                </label>
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
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {exercise.name}
                    {exercise.is_barbell && (
                      <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        BB
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{MUSCLE_GROUP_LABELS[exercise.muscle_group]}</p>
                </div>
                <button
                  onClick={() => startEdit(exercise)}
                  className="shrink-0 text-muted-foreground/50 hover:text-foreground"
                  aria-label="Edit exercise"
                >
                  <Pencil className="size-4" />
                </button>
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
