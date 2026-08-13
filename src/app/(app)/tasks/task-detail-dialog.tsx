"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { RecurrencePicker } from "@/components/recurrence-picker";
import { buildRRuleString, parseRecurrenceFromRRule } from "@/lib/reminders/rrule";
import type { RecurrencePreset } from "@/lib/reminders/types";
import {
  TASK_HORIZONS,
  TASK_HORIZON_LABELS,
  TASK_CATEGORY_LABELS,
  type Task,
  type TaskCategory,
  type TaskHorizon,
} from "@/lib/tasks/types";
import { deleteTask, updateTask } from "./actions";

const PRESETS: RecurrencePreset[] = ["none", "daily", "weekdays", "weekly", "every_n_days", "monthly"];

function isoToDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TaskDetailDialog({
  task,
  hasReminder,
  onClose,
  onSaved,
  onDeleted,
}: {
  task: Task;
  hasReminder: boolean;
  onClose: () => void;
  onSaved: (task: Task) => void;
  onDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? "");
  const [horizon, setHorizon] = useState<TaskHorizon>(task.horizon);
  const [category, setCategory] = useState<TaskCategory>(task.category);
  const [dueAt, setDueAt] = useState(isoToDateTimeLocal(task.due_at));
  const parsedRRule = parseRecurrenceFromRRule(task.rrule, "none");
  const [preset, setPreset] = useState<RecurrencePreset>(parsedRRule.preset);
  const [weekday, setWeekday] = useState(parsedRRule.weekday);
  const [intervalDays, setIntervalDays] = useState(parsedRRule.intervalDays);
  const [monthDay, setMonthDay] = useState(parsedRRule.monthDay);
  const [remindMe, setRemindMe] = useState(hasReminder);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);

    const dueAtIso = dueAt ? new Date(dueAt).toISOString() : null;
    const rrule =
      preset === "weekly"
        ? buildRRuleString({ preset, weekday })
        : preset === "every_n_days"
          ? buildRRuleString({ preset, intervalDays: Number(intervalDays) || 2 })
          : preset === "monthly"
            ? buildRRuleString({ preset, monthDay: Number(monthDay) || 1 })
            : buildRRuleString({ preset });

    const result = await updateTask({
      id: task.id,
      title: trimmed,
      notes: notes.trim() || null,
      horizon,
      category,
      dueAt: dueAtIso,
      rrule,
      remindMe: remindMe && !!dueAtIso,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success("Task updated");
    onSaved({ ...task, title: trimmed, notes: notes.trim() || null, horizon, category, due_at: dueAtIso, rrule });
  }

  async function handleDelete() {
    setSaving(true);
    await deleteTask({ id: task.id });
    setSaving(false);
    toast.success("Task deleted");
    onDeleted(task.id);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" autoFocus />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">When</label>
              <Select value={horizon} onChange={(e) => setHorizon(e.target.value as TaskHorizon)}>
                {TASK_HORIZONS.map((h) => (
                  <option key={h} value={h}>
                    {TASK_HORIZON_LABELS[h]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
              <Select value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
                {Object.entries(TASK_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Due date (optional)</label>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>

          <RecurrencePicker
            presets={PRESETS}
            preset={preset}
            onPresetChange={setPreset}
            weekday={weekday}
            onWeekdayChange={setWeekday}
            intervalDays={intervalDays}
            onIntervalDaysChange={setIntervalDays}
            monthDay={monthDay}
            onMonthDayChange={setMonthDay}
          />

          {preset !== "none" && !dueAt && (
            <p className="text-xs text-destructive">A repeating task needs a due date so it knows when to recur.</p>
          )}

          <label className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
            <span className="text-sm">
              Remind me
              {!dueAt && <span className="block text-xs text-muted-foreground">Set a due date first</span>}
            </span>
            <Switch checked={remindMe} onCheckedChange={setRemindMe} disabled={!dueAt} />
          </label>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1 text-destructive" onClick={handleDelete} disabled={saving}>
              <Trash2 className="size-4" />
              Delete
            </Button>
            <Button type="button" className="flex-1" onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
