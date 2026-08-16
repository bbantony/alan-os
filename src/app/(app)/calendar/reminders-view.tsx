"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlarmClock, Pause, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { listItemVariants, LIST_ITEM_TRANSITION } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatInAppTimezone } from "@/lib/time";
import { describeRRule } from "@/lib/reminders/rrule";
import type { Reminder } from "@/lib/reminders/types";
import { deleteReminder, pauseReminder, resumeReminder, snoozeReminder } from "./actions";
import { ReminderForm } from "./reminder-form";

const SNOOZE_OPTIONS = [
  { label: "15m", minutes: 15 as number | null },
  { label: "1h", minutes: 60 as number | null },
  { label: "3h", minutes: 180 as number | null },
  { label: "Tomorrow 9am", minutes: null as number | null },
];

export function RemindersView({
  initialReminders,
  gcalConnected,
  groupBoundaries,
  autoOpenNew = false,
}: {
  initialReminders: Reminder[];
  gcalConnected: boolean;
  groupBoundaries: { todayEnd: string; weekEnd: string };
  autoOpenNew?: boolean;
}) {
  const [reminders, setReminders] = useState(initialReminders);
  // Seeded from the prop rather than set in an effect — the value is known at
  // first render, so an effect would only cause a second one.
  const [showForm, setShowForm] = useState(autoOpenNew);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [snoozeMenuFor, setSnoozeMenuFor] = useState<string | null>(null);

  const groups = useMemo(() => {
    const sorted = [...reminders].sort(
      (a, b) => new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime()
    );
    return {
      today: sorted.filter((r) => r.remind_at <= groupBoundaries.todayEnd),
      thisWeek: sorted.filter(
        (r) => r.remind_at > groupBoundaries.todayEnd && r.remind_at <= groupBoundaries.weekEnd
      ),
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
    setReminders((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, remind_at: remindAt, status: "active" } : x))
    );
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
    <div className="flex flex-col gap-4">
      {groupList.length === 0 ? (
        <EmptyState
          title="No reminders yet"
          description="Add one and it'll push to every device you've enabled notifications on."
          icon={<AlarmClock className="size-8" />}
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus className="size-4" strokeWidth={3} />
              New reminder
            </Button>
          }
        />
      ) : (
        groupList.map((group, gi) => (
          <Panel key={group.label}>
            <PanelHead
              title={group.label}
              count={group.items.length}
              // The add button lives on the first group's header rather than
              // as a full-width button above everything — it keeps the list
              // itself the tallest thing on the screen.
              action={
                gi === 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    aria-label="New reminder"
                    className="tap-press flex size-7 items-center justify-center border-2 border-rule bg-surface transition-colors hover:bg-foreground hover:text-background"
                  >
                    <Plus className="size-4" strokeWidth={3} />
                  </button>
                ) : null
              }
            />
            <ul>
              <AnimatePresence initial={false}>
                {group.items.map((r, i) => {
                  const paused = r.status === "paused";
                  return (
                    <motion.li
                      key={r.id}
                      layout
                      variants={listItemVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      transition={LIST_ITEM_TRANSITION}
                      className={cn(
                        i > 0 && "border-t border-hairline",
                        paused && "bg-muted/40"
                      )}
                    >
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => setEditing(r)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="flex items-center gap-2">
                            <span
                              className={cn(
                                "min-w-0 truncate text-sm",
                                paused && "text-muted-foreground line-through"
                              )}
                            >
                              {r.title}
                            </span>
                            {paused && <Tag>Paused</Tag>}
                          </p>
                          <p className="micro-sm mt-0.5 flex flex-wrap items-center gap-x-2 text-muted-foreground">
                            <span className="tabular">
                              {formatInAppTimezone(r.remind_at, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </span>
                            {r.rrule && (
                              <span className="flex items-center gap-1">
                                <Repeat className="size-3" />
                                {describeRRule(r.rrule)}
                              </span>
                            )}
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => handlePauseToggle(r)}
                          className="tap-press shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
                          aria-label={paused ? `Resume ${r.title}` : `Pause ${r.title}`}
                        >
                          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSnoozeMenuFor(snoozeMenuFor === r.id ? null : r.id)}
                          aria-expanded={snoozeMenuFor === r.id}
                          className={cn(
                            "tap-press shrink-0 transition-colors",
                            snoozeMenuFor === r.id
                              ? "text-primary"
                              : "text-muted-foreground/60 hover:text-foreground"
                          )}
                          aria-label={`Snooze ${r.title}`}
                        >
                          <AlarmClock className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r)}
                          className="tap-press shrink-0 text-muted-foreground/50 transition-colors hover:text-destructive"
                          aria-label={`Delete ${r.title}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>

                      {/* Snooze options as one ruled strip of equal cells,
                          matching the weekday picker and the segmented
                          control — the app's one way of showing a short row
                          of mutually exclusive choices. */}
                      {snoozeMenuFor === r.id && (
                        <div className="grid grid-cols-4 border-t border-hairline">
                          {SNOOZE_OPTIONS.map((opt, oi) => (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() =>
                                handleSnooze(r, opt.minutes ?? minutesUntilTomorrow9am())
                              }
                              className={cn(
                                "micro-sm tap-press px-1 py-2 transition-colors hover:bg-foreground hover:text-background",
                                oi > 0 && "border-l border-hairline"
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </Panel>
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
