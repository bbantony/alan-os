"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { RecurrencePicker } from "@/components/recurrence-picker";
import { todayInAppTimezone } from "@/lib/time";
import type { Reminder, RecurrencePreset } from "@/lib/reminders/types";
import { createReminder, updateReminder } from "./actions";

const PRESETS: RecurrencePreset[] = [
  "none", "daily", "weekdays", "weekly", "every_n_days", "monthly", "custom",
];

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
        })
      : await createReminder({
          title: title.trim(),
          notes: notes.trim() || null,
          remindAt,
          recurrence,
        });

    setSaving(false);
    if (result.error || !result.reminder) {
      setError(result.error ?? "Couldn't save that reminder.");
      return;
    }
    toast.success(existing ? "Reminder updated" : "Reminder created");
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
            className="w-full border-2 border-rule bg-transparent px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1" />
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />
          </div>

          {/* This was the fourth hand-rolled copy of the repeat picker — the
              other three were consolidated into RecurrencePicker in an earlier
              pass but this one was missed, which is why its weekday buttons
              were still round pills after everything else went square. */}
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

          {gcalConnected && (
            <p className="micro-sm text-muted-foreground">
              Also syncs to your Google Calendar automatically.
            </p>
          )}

          {error && (
            <p className="border-2 border-destructive px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="button" block onClick={handleSubmit} disabled={saving || !title.trim()}>
            {saving ? "Saving…" : "Save reminder"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
