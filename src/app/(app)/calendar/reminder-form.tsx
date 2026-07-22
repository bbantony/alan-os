"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { todayInAppTimezone } from "@/lib/time";
import { RECURRENCE_PRESET_LABELS, type Reminder } from "@/lib/reminders/types";
import type { RecurrencePreset } from "@/lib/reminders/types";
import { createReminder, updateReminder } from "./actions";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRESETS: RecurrencePreset[] = ["none", "daily", "weekdays", "weekly", "every_n_days", "monthly", "custom"];

function isoToDateAndTime(iso: string | undefined) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { date, time };
}

export function ReminderForm({
  existing,
  gcalConnected,
  onClose,
  onSaved,
}: {
  existing: Reminder | null;
  gcalConnected: boolean;
  onClose: () => void;
  onSaved: (reminder: Reminder) => void;
}) {
  const initial = isoToDateAndTime(existing?.remind_at);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [date, setDate] = useState(existing ? initial.date : todayInAppTimezone());
  const [time, setTime] = useState(initial.time);
  const [preset, setPreset] = useState<RecurrencePreset>("none");
  const [weekday, setWeekday] = useState(0);
  const [intervalDays, setIntervalDays] = useState("2");
  const [monthDay, setMonthDay] = useState("1");
  const [mirrorToGcal, setMirrorToGcal] = useState(existing?.mirror_to_gcal ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    const remindAt = new Date(`${date}T${time}:00`).toISOString();

    const recurrence =
      preset === "weekly"
        ? { preset, weekday }
        : preset === "every_n_days"
          ? { preset, intervalDays: Number(intervalDays) || 2 }
          : preset === "monthly"
            ? { preset, monthDay: Number(monthDay) || 1 }
            : { preset };

    const result = existing
      ? await updateReminder({
          id: existing.id,
          title: title.trim(),
          notes: notes.trim() || null,
          remindAt,
          recurrence,
          mirrorToGcal,
        })
      : await createReminder({
          title: title.trim(),
          notes: notes.trim() || null,
          remindAt,
          recurrence,
          mirrorToGcal,
        });

    setSaving(false);
    if (result.error || !result.reminder) {
      setError(result.error ?? "Couldn't save that reminder.");
      return;
    }
    onSaved(result.reminder);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit reminder" : "New reminder"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" autoFocus />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1" />
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Repeat</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  className={cn(
                    "tap-press rounded-lg border px-2 py-1.5 text-xs font-medium",
                    preset === p ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
                  )}
                >
                  {RECURRENCE_PRESET_LABELS[p]}
                </button>
              ))}
            </div>
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
              <Input
                type="number"
                inputMode="numeric"
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
                className="w-16 text-center"
              />
              days
            </div>
          )}

          {preset === "monthly" && (
            <div className="flex items-center gap-2 text-sm">
              On day
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={monthDay}
                onChange={(e) => setMonthDay(e.target.value)}
                className="w-16 text-center"
              />
              of the month
            </div>
          )}

          <label className={cn("flex items-center gap-2 text-sm", !gcalConnected && "opacity-50")}>
            <input
              type="checkbox"
              checked={mirrorToGcal}
              disabled={!gcalConnected}
              onChange={(e) => setMirrorToGcal(e.target.checked)}
              className="size-4 rounded border-input"
            />
            Also add to Google Calendar
            {!gcalConnected && <span className="text-xs text-muted-foreground">(connect it in Settings first)</span>}
          </label>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="button" className="w-full" onClick={handleSubmit} disabled={saving || !title.trim()}>
            {saving ? "Saving…" : "Save reminder"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
