"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { todayInAppTimezone } from "@/lib/time";
import { createCalendarEvent } from "./actions";

export function NewEventForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayInAppTimezone());
  const [time, setTime] = useState("09:00");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + (Number(durationMinutes) || 30) * 60000);

    const result = await createCalendarEvent({
      title: title.trim(),
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onCreated();
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" autoFocus />
          <div className="flex gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="flex-1" />
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-28" />
          </div>
          <div>
            <label className="micro-sm mb-1.5 block text-muted-foreground">Duration (minutes)</label>
            <Input
              type="number"
              inputMode="numeric"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="w-24"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="button" className="w-full" onClick={handleSubmit} disabled={saving || !title.trim()}>
            {saving ? "Saving…" : "Add to Google Calendar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
