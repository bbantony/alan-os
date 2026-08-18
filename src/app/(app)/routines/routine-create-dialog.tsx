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
import { RecurrencePicker } from "@/components/recurrence-picker";
import { TimeField } from "@/components/ui/date-field";
import { parseRecurrenceFromRRule } from "@/lib/reminders/rrule";
import type { RecurrencePreset } from "@/lib/reminders/types";
import { TASK_CATEGORY_LABELS, type TaskCategory } from "@/lib/tasks/types";
import { getRoutineIcon, AVAILABLE_ROUTINE_ICON_NAMES } from "@/lib/routines/icon-registry";
import type { RoutineWithProgress } from "@/lib/routines/types";
import { archiveRoutine, createRoutine, updateRoutine } from "./actions";

const PRESETS: RecurrencePreset[] = ["daily", "weekdays", "weekly", "every_n_days", "monthly"];

export function RoutineFormDialog({
  open,
  existing,
  onClose,
  onCreated,
  onUpdated,
  onArchived,
  initialTitle,
}: {
  open: boolean;
  existing?: RoutineWithProgress | null;
  onClose: () => void;
  onCreated?: () => void;
  onUpdated?: () => void;
  onArchived?: (id: string) => void;
  initialTitle?: string;
}) {
  const parsedRRule = parseRecurrenceFromRRule(existing?.rrule ?? null, "daily");

  const [title, setTitle] = useState(existing?.title ?? initialTitle ?? "");
  const [icon, setIcon] = useState(existing?.icon ?? AVAILABLE_ROUTINE_ICON_NAMES[0]);
  const [category, setCategory] = useState<TaskCategory>(existing?.category ?? "personal");
  const [preset, setPreset] = useState<RecurrencePreset>(parsedRRule.preset);
  const [weekday, setWeekday] = useState(parsedRRule.weekday);
  const [intervalDays, setIntervalDays] = useState(parsedRRule.intervalDays);
  const [monthDay, setMonthDay] = useState(parsedRRule.monthDay);
  const [timeOfDay, setTimeOfDay] = useState(existing?.time_of_day ?? "");
  const [remindMe, setRemindMe] = useState(existing?.hasReminder ?? false);
  const [isChecklist, setIsChecklist] = useState((existing?.steps.length ?? 0) > 1);
  const [steps, setSteps] = useState<string[]>(
    (existing?.steps.length ?? 0) > 1 ? (existing?.steps.map((s) => s.title) ?? []) : []
  );
  const [stepDraft, setStepDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  function addStep() {
    const trimmed = stepDraft.trim();
    if (!trimmed) return;
    setSteps((prev) => [...prev, trimmed]);
    setStepDraft("");
  }

  function buildRecurrence() {
    return preset === "weekly"
      ? { preset, weekday }
      : preset === "every_n_days"
        ? { preset, intervalDays: Number(intervalDays) || 2 }
        : preset === "monthly"
          ? { preset, monthDay: Number(monthDay) || 1 }
          : { preset };
  }

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);

    const recurrence = buildRecurrence();
    const result = existing
      ? await updateRoutine({
          id: existing.id,
          title: trimmed,
          icon,
          category,
          recurrence,
          timeOfDay: timeOfDay || null,
          steps: isChecklist ? steps : [],
          remindMe,
        })
      : await createRoutine({
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
    toast.success(existing ? "Routine updated" : "Routine created");
    if (existing) onUpdated?.();
    else onCreated?.();
  }

  async function handleArchive() {
    if (!existing) return;
    setArchiving(true);
    await archiveRoutine({ id: existing.id });
    setArchiving(false);
    toast.success("Routine archived");
    onArchived?.(existing.id);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit routine" : "New routine"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Water plants" autoFocus />

          {/* One gapless grid of ruled cells, not a scatter of bordered
              squares — the icon set is a single control with twelve states. */}
          <div>
            <label className="micro-sm mb-1.5 block text-muted-foreground">Icon</label>
            <div className="grid grid-cols-6 gap-px border-2 border-rule bg-hairline">
              {AVAILABLE_ROUTINE_ICON_NAMES.map((name) => {
                const Icon = getRoutineIcon(name);
                const active = icon === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setIcon(name)}
                    aria-pressed={active}
                    className={cn(
                      "tap-press flex h-10 items-center justify-center transition-colors",
                      active
                        ? "bg-foreground text-background"
                        : "bg-surface text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    aria-label={name}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="micro-sm mb-1.5 block text-muted-foreground">Category</label>
              <Select value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)}>
                {Object.entries(TASK_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="micro-sm mb-1.5 block text-muted-foreground">Around what time?</label>
              <TimeField value={timeOfDay} onChange={setTimeOfDay} placeholder="Any time" aria-label="Time of day" />
            </div>
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

          <label className="flex items-center justify-between gap-2 border-2 border-rule px-3 py-2">
            <span className="text-sm">
              Checklist
              <span className="block text-xs text-muted-foreground">Multiple steps instead of one habit</span>
            </span>
            <Switch checked={isChecklist} onCheckedChange={setIsChecklist} />
          </label>

          {isChecklist && (
            <div className="space-y-1.5 border-2 border-dashed border-hairline p-2.5">
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

          <label className="flex items-center justify-between gap-2 border-2 border-rule px-3 py-2">
            <span className="text-sm">
              Remind me
              {!timeOfDay && <span className="block text-xs text-muted-foreground">Set a time first</span>}
            </span>
            <Switch checked={remindMe} onCheckedChange={setRemindMe} disabled={!timeOfDay} />
          </label>

          <div className="flex gap-2 pt-1">
            {existing && (
              <Button type="button" variant="outline" className="flex-1 text-destructive" onClick={handleArchive} disabled={archiving || saving}>
                <Trash2 className="size-4" />
                Archive
              </Button>
            )}
            <Button
              type="button"
              className="flex-1"
              onClick={handleSave}
              disabled={saving || archiving || !title.trim() || (isChecklist && steps.length === 0)}
            >
              {saving ? "Saving…" : existing ? "Save" : "Create routine"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
