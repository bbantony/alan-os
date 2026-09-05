"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Micro } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import {
  TASK_HORIZONS,
  TASK_HORIZON_LABELS,
  type TaskHorizon,
} from "@/lib/tasks/types";
import { createTask } from "@/app/(app)/tasks/actions";

/**
 * The two-field task composer that lives inside the capture sheet.
 *
 * Deliberately NOT the Plan screen's add form. That one carries due dates,
 * reminders, repeats, categories, subtasks and roughly twenty pieces of local
 * state, all of which exist because the Plan screen is where you *organise*.
 * This is where you *catch* — a title and roughly when, before the thought is
 * gone. Everything else is a tap away on /plan afterwards, and a task caught
 * with a vague horizon beats a task never written down.
 *
 * Category is fixed to "personal", which is the same default the Plan screen's
 * quick-add opens with, so nothing lands in a category you didn't choose.
 */
export function CaptureTaskForm({ onSaved }: { onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [horizon, setHorizon] = useState<TaskHorizon>("today");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    // The field clears straight away — the same instant-feedback rule the
    // shopping list follows. If the save fails, the words come back so
    // nothing typed is ever lost to a bad connection.
    setTitle("");
    // A REJECTED action (the signal dropped mid-save) throws rather than
    // returning an error, and an unguarded await here skipped every line
    // below it: the button stuck on "Adding…" for good, no reason was given,
    // and the words this comment promises to give back were gone. Same
    // try/catch/finally the money logger uses.
    let result: Awaited<ReturnType<typeof createTask>>;
    try {
      result = await createTask({
        id: crypto.randomUUID(),
        title: trimmed,
        horizon,
        category: "personal",
      });
    } catch {
      setTitle(trimmed);
      toast.error("Couldn't add that — check your connection and try again.");
      return;
    } finally {
      setSaving(false);
    }

    if (result.error) {
      setTitle(trimmed);
      toast.error(result.error);
      return;
    }

    toast.success(`Added to ${TASK_HORIZON_LABELS[horizon]}`);
    titleRef.current?.focus();
    onSaved();
  }

  return (
    <form onSubmit={handleAdd} className="flex flex-col gap-3 p-3">
      <div>
        <label className="micro-sm mb-1.5 block text-muted-foreground" htmlFor="capture-task-title">
          What needs doing
        </label>
        <Input
          id="capture-task-title"
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Book the dentist"
          disabled={saving}
        />
      </div>

      <div>
        <label className="micro-sm mb-1.5 block text-muted-foreground" htmlFor="capture-task-horizon">
          When
        </label>
        <Select
          id="capture-task-horizon"
          value={horizon}
          onChange={(e) => setHorizon(e.target.value as TaskHorizon)}
          disabled={saving}
        >
          {TASK_HORIZONS.map((h) => (
            <option key={h} value={h}>
              {TASK_HORIZON_LABELS[h]}
            </option>
          ))}
        </Select>
      </div>

      <Button type="submit" block disabled={saving || !title.trim()}>
        {saving ? "Adding…" : "Add task"}
      </Button>

      <Micro className="block text-muted-foreground">
        Due dates, reminders and repeats live on the Plan screen.
      </Micro>
    </form>
  );
}
