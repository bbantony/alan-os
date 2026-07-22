"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlarmClock, Pause, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { toast } from "@/components/ui/toast";
import { listItemVariants, LIST_ITEM_TRANSITION } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatInAppTimezone } from "@/lib/time";
import { describeRRule } from "@/lib/reminders/rrule";
import type { Reminder } from "@/lib/reminders/types";
import { deleteReminder, pauseReminder, resumeReminder, snoozeReminder } from "./actions";
import { ReminderForm } from "./reminder-form";

export function RemindersView({
  initialReminders,
  gcalConnected,
  groupBoundaries,
}: {
  initialReminders: Reminder[];
  gcalConnected: boolean;
  groupBoundaries: { todayEnd: string; weekEnd: string };
}) {
  const [reminders, setReminders] = useState(initialReminders);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [snoozeMenuFor, setSnoozeMenuFor] = useState<string | null>(null);

  const groups = useMemo(() => {
    const sorted = [...reminders].sort((a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime());
    return {
      today: sorted.filter((r) => r.remind_at <= groupBoundaries.todayEnd),
      thisWeek: sorted.filter((r) => r.remind_at > groupBoundaries.todayEnd && r.remind_at <= groupBoundaries.weekEnd),
      later: sorted.filter((r) => r.remind_at > groupBoundaries.weekEnd),
    };
  }, [reminders, groupBoundaries]);

  async function handlePauseToggle(r: Reminder) {
    const nextStatus = r.status === "paused" ? "active" : "paused";
    setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: nextStatus } : x)));
    await (nextStatus === "paused" ? pauseReminder({ id: r.id }) : resumeReminder({ id: r.id }));
  }

  async function handleDelete(r: Reminder) {
    setReminders((prev) => prev.filter((x) => x.id !== r.id));
    await deleteReminder({ id: r.id });
    toast.success("Reminder deleted");
  }

  async function handleSnooze(r: Reminder, minutes: number) {
    setSnoozeMenuFor(null);
    const remindAt = new Date(new Date().getTime() + minutes * 60000).toISOString();
    setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, remind_at: remindAt, status: "active" } : x)));
    await snoozeReminder({ id: r.id, minutes });
  }

  function minutesUntilTomorrow9am(): number {
    const now = new Date();
    const target = new Date(now);
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
    return Math.round((target.getTime() - now.getTime()) / 60000);
  }

  const groupList: { label: string; items: Reminder[] }[] = [
    { label: "Today", items: groups.today },
    { label: "This week", items: groups.thisWeek },
    { label: "Later", items: groups.later },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <Button type="button" className="w-full gap-1.5" onClick={() => setShowForm(true)}>
        <Plus className="size-4" />
        New reminder
      </Button>

      {groupList.length === 0 ? (
        <EmptyState
          title="No reminders yet"
          description="Add one and it'll push to every device you've enabled notifications on."
          icon={<AlarmClock className="size-8" />}
        />
      ) : (
        groupList.map((group) => (
          <div key={group.label}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </h2>
            <ul className="space-y-1.5">
              <AnimatePresence initial={false}>
                {group.items.map((r) => (
                  <motion.li
                    key={r.id}
                    layout
                    variants={listItemVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={LIST_ITEM_TRANSITION}
                    className="rounded-lg border border-border bg-surface px-3 py-2.5"
                  >
                  <div className="flex items-center gap-3">
                    <button onClick={() => setEditing(r)} className="min-w-0 flex-1 text-left">
                      <p className={cn("truncate text-sm", r.status === "paused" && "text-muted-foreground line-through")}>
                        {r.title}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        {formatInAppTimezone(r.remind_at, { dateStyle: "medium", timeStyle: "short" })}
                        {r.rrule && (
                          <span className="flex items-center gap-0.5">
                            <Repeat className="size-3" />
                            {describeRRule(r.rrule)}
                          </span>
                        )}
                      </p>
                    </button>
                    <button
                      onClick={() => handlePauseToggle(r)}
                      className="tap-press shrink-0 text-muted-foreground/50 hover:text-foreground"
                      aria-label={r.status === "paused" ? "Resume" : "Pause"}
                    >
                      {r.status === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
                    </button>
                    <button
                      onClick={() => setSnoozeMenuFor(snoozeMenuFor === r.id ? null : r.id)}
                      className="tap-press shrink-0 text-muted-foreground/50 hover:text-foreground"
                      aria-label="Snooze"
                    >
                      <AlarmClock className="size-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      className="tap-press shrink-0 text-muted-foreground/40 hover:text-destructive"
                      aria-label="Delete reminder"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {snoozeMenuFor === r.id && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
                      {[
                        { label: "15m", minutes: 15 },
                        { label: "1h", minutes: 60 },
                        { label: "3h", minutes: 180 },
                        { label: "Tomorrow 9am", minutes: null },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          onClick={() => handleSnooze(r, opt.minutes ?? minutesUntilTomorrow9am())}
                          className="tap-press rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        ))
      )}

      {(showForm || editing) && (
        <ReminderForm
          existing={editing}
          gcalConnected={gcalConnected}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={(reminder) => {
            setReminders((prev) =>
              editing ? prev.map((r) => (r.id === reminder.id ? reminder : r)) : [...prev, reminder]
            );
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
