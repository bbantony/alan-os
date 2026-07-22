"use client";

import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteTemplate, updateTemplate } from "@/app/(app)/workout/actions";
import { ExercisePicker } from "@/app/(app)/workout/new/exercise-picker";
import { WORKOUT_TYPE_LABELS, type Exercise, type WorkoutTemplate, type WorkoutType } from "@/lib/workout/types";

const TEMPLATE_TYPES = (Object.keys(WORKOUT_TYPE_LABELS) as WorkoutType[]).filter((t) => t !== "run");

export function TemplateEditor({
  template,
  exercises,
  onExerciseCreated,
  onSaved,
  onDeleted,
}: {
  template: WorkoutTemplate;
  exercises: Exercise[];
  onExerciseCreated: (exercise: Exercise) => void;
  onSaved: (template: WorkoutTemplate) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const [type, setType] = useState<WorkoutType>(template.type);
  const [exerciseIds, setExerciseIds] = useState<string[]>(template.exercise_ids);

  const exerciseById = new Map(exercises.map((e) => [e.id, e]));

  function cancel() {
    setEditing(false);
    setName(template.name);
    setType(template.type);
    setExerciseIds(template.exercise_ids);
  }

  async function handleSave() {
    const finalName = name.trim() || template.name;
    await updateTemplate({ id: template.id, name: finalName, type, exerciseIds });
    onSaved({ ...template, name: finalName, type, exercise_ids: exerciseIds });
    setEditing(false);
  }

  async function handleDelete() {
    await deleteTemplate({ id: template.id });
    onDeleted();
  }

  if (!editing) {
    return (
      <li className="flex items-center justify-between px-4 py-3 text-sm">
        <div>
          <p className="font-medium">{template.name}</p>
          <p className="text-xs text-muted-foreground">
            {WORKOUT_TYPE_LABELS[template.type]} · {template.exercise_ids.length} exercises
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(true)} className="text-muted-foreground/50 hover:text-foreground" aria-label="Edit template">
            <Pencil className="size-4" />
          </button>
          <button onClick={handleDelete} className="text-muted-foreground/40 hover:text-destructive" aria-label="Delete template">
            <Trash2 className="size-4" />
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="space-y-2 px-4 py-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" autoFocus />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as WorkoutType)}
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
      >
        {TEMPLATE_TYPES.map((t) => (
          <option key={t} value={t}>
            {WORKOUT_TYPE_LABELS[t]}
          </option>
        ))}
      </select>

      {exerciseIds.length > 0 && (
        <ul className="space-y-1">
          {exerciseIds.map((id) => (
            <li
              key={id}
              className="flex items-center justify-between rounded-lg border border-border px-2 py-1.5 text-sm"
            >
              {exerciseById.get(id)?.name ?? "Unknown exercise"}
              <button
                onClick={() => setExerciseIds((prev) => prev.filter((eid) => eid !== id))}
                className="text-muted-foreground/40 hover:text-destructive"
                aria-label="Remove exercise"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ExercisePicker
        exercises={exercises}
        recentExerciseIds={[]}
        excludeIds={exerciseIds}
        onSelect={(exercise) => setExerciseIds((prev) => [...prev, exercise.id])}
        onExerciseCreated={onExerciseCreated}
      />

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={cancel}>
          Cancel
        </Button>
        <Button type="button" className="flex-1 gap-1.5" onClick={handleSave}>
          <Check className="size-4" />
          Save
        </Button>
      </div>
    </li>
  );
}
