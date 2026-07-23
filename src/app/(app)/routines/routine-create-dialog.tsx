"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { RECURRENCE_PRESET_LABELS, type RecurrencePreset } from "@/lib/reminders/types";
import { TASK_CATEGORY_LABELS, type TaskCategory } from "@/lib/tasks/types";
import { getRoutineIcon, AVAILABLE_ROUTINE_ICON_NAMES } from "@/lib/routines/icon-registry";
import { createRoutine } from "./actions";

const PRESETS: RecurrencePreset[] = ["daily", "weekdays", "weekly", "every_n_days", "monthly"];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function RoutineCreateDialog({
  open,
  onClose,
  onCreated,
  initialTitle,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  initialTitle?: string;
}) {
  const [title, setTitle] = useState(initialTitle ?? "");
  const [icon, setIcon] = useState(AVAILABLE_ROUTINE_ICON_NAMES[0]);
  const [category, setCategory] = useState<TaskCategory>("personal");
  const [preset, setPreset] = useState<RecurrencePreset>("daily");
  const [weekday, setWeekday] = useState(0);
  const [intervalDays, setIntervalDays] = useState("2");
  const [monthDay, setMonthDay] = useState("1");
  const [timeOfDay, setTimeOfDay] = useState("");
  const [remindMe, setRemindMe] = useState(false);
  const [isChecklist, setIsChecklist] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [stepDraft, setStepDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setTitle("");
    setIcon(AVAILABLE_ROUTINE_ICON_NAMES[0]);
    setCategory("personal");
    setPreset("daily");
    setTimeOfDay("");
    setRemindMe(false);
    setIsChecklist(false);
    setSteps([]);
    setStepDraft("");
  }

  function addStep() {
    const trimmed = stepDraft.trim();
    if (!trimmed) return;
    setSteps((prev) => [...prev, trimmed]);
    setStepDraft("");
  }

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);

    const recurrence =
      preset === "weekly"
        ? { preset, weekday }
        : preset === "every_n_days"
          ? { preset, intervalDays: Number(intervalDays) || 2 }
          : preset === "monthly"
            ? { preset, monthDay: Number(monthDay) || 1 }
            : { preset };

    const result = await createRoutine({
      id: crypto.randomUUID(),
      title: trimmed,
      icon,
      category,
      recurrence,
      timeOfDay: timeOfDay || null,
      steps: isChecklist ? steps : [],
      remindMe,
    });

    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Routine created");
    reset();
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New routine</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Water plants" autoFocus />

          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_ROUTINE_ICON_NAMES.map((name) => {
              const Icon = getRoutineIcon(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setIcon(name)}
                  className={cn(
                    "tap-press flex size-9 items-center justify-center rounded-lg border",
                    icon === name ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                  )}
                  aria-label={name}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
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
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Around what time?</label>
              <Input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Repeats</label>
            <Select value={preset} onChange={(e) => setPreset(e.target.value as RecurrencePreset)}>
              {PRESETS.map((p) => (
                <option key={p} value={p}>
                  {RECURRENCE_PRESET_LABELS[p]}
                </option>
              ))}
            </Select>
          </div>

          {preset === "weekly" && (
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setWeekday(i)}
                  className={cn(
                    "tap-press rounded-full border px-2.5 py-1 text-xs",
                    weekday === i ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {preset === "every_n_days" && (
            <div className="flex items-center gap-2 text-sm">
              Every
              <Input type="number" inputMode="numeric" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} className="w-16" />
              days
            </div>
          )}
          {preset === "monthly" && (
            <div className="flex items-center gap-2 text-sm">
              On day
              <Input type="number" inputMode="numeric" min={1} max={31} value={monthDay} onChange={(e) => setMonthDay(e.target.value)} className="w-16" />
              of the month
            </div>
          )}

          <label className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
            <span className="text-sm">
              Checklist
              <span className="block text-xs text-muted-foreground">Multiple steps instead of one habit</span>
            </span>
            <Switch checked={isChecklist} onCheckedChange={setIsChecklist} />
          </label>

          {isChecklist && (
            <div className="space-y-1.5 rounded-lg border border-dashed border-border p-2.5">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{s}</span>
                  <button
                    type="button"
                    onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                    className="tap-press text-muted-foreground/50 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <Input
                  value={stepDraft}
                  onChange={(e) => setStepDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addStep();
                    }
                  }}
                  placeholder="Add a step…"
                  className="h-8 flex-1 text-sm"
                />
                <Button type="button" size="icon-sm" onClick={addStep}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          <label className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
            <span className="text-sm">
              Remind me
              {!timeOfDay && <span className="block text-xs text-muted-foreground">Set a time first</span>}
            </span>
            <Switch checked={remindMe} onCheckedChange={setRemindMe} disabled={!timeOfDay} />
          </label>

          <Button
            type="button"
            className="w-full"
            onClick={handleSave}
            disabled={saving || !title.trim() || (isChecklist && steps.length === 0)}
          >
            {saving ? "Saving…" : "Create routine"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
