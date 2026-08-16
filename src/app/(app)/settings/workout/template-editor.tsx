"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteTemplate, updateTemplate } from "@/app/(app)/workout/actions";
import { ExercisePicker } from "@/app/(app)/workout/new/exercise-picker";
import type { Exercise, WorkoutTemplate } from "@/lib/workout/types";

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
  const [exerciseIds, setExerciseIds] = useState<string[]>(template.exercise_ids);
  const [pickerOpen, setPickerOpen] = useState(false);

  const exerciseById = new Map(exercises.map((e) => [e.id, e]));

  function cancel() {
    setEditing(false);
    setName(template.name);
    setExerciseIds(template.exercise_ids);
  }

  async function handleSave() {
    const finalName = name.trim() || template.name;
    await updateTemplate({ id: template.id, name: finalName, exerciseIds });
    onSaved({ ...template, name: finalName, exercise_ids: exerciseIds });
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
          <p className="text-xs text-muted-foreground">{template.exercise_ids.length} exercises</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(true)} className="tap-press text-muted-foreground/50 hover:text-foreground" aria-label="Edit template">
            <Pencil className="size-4" />
          </button>
          <button onClick={handleDelete} className="tap-press text-muted-foreground/40 hover:text-destructive" aria-label="Delete template">
            <Trash2 className="size-4" />
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="space-y-2 px-4 py-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" autoFocus />

      {exerciseIds.length > 0 && (
        <ul className="space-y-1">
          {exerciseIds.map((id) => (
            <li
              key={id}
              className="flex items-center justify-between border-2 border-rule px-2 py-1.5 text-sm"
            >
              {exerciseById.get(id)?.name ?? "Unknown exercise"}
              <button
                onClick={() => setExerciseIds((prev) => prev.filter((eid) => eid !== id))}
                className="tap-press text-muted-foreground/40 hover:text-destructive"
                aria-label="Remove exercise"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* The picker became full-screen and multi-select for the logging flow;
          building a template is the same job, so it uses the same component
          rather than a second, lesser copy. */}
      <Button type="button" variant="outline" block onClick={() => setPickerOpen(true)}>
        <Plus className="size-4" strokeWidth={3} />
        Add exercises
      </Button>

      <ExercisePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        exercises={exercises}
        recentExerciseIds={[]}
        excludeIds={exerciseIds}
        onSelect={(chosen) =>
          setExerciseIds((prev) => [...prev, ...chosen.map((e) => e.id)])
        }
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
