"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ExternalLink, ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/empty-state";
import { toast } from "@/components/ui/toast";
import { listItemVariants, LIST_ITEM_TRANSITION } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatInAppTimezone } from "@/lib/time";
import { getAgenda, type AgendaItem } from "./actions";
import { NewEventForm } from "./new-event-form";

const SOURCE_STYLES: Record<AgendaItem["source"], string> = {
  gcal: "bg-accent/15 text-accent",
  reminder: "bg-primary/10 text-primary",
  task: "bg-muted text-muted-foreground",
};

const SOURCE_LABELS: Record<AgendaItem["source"], string> = {
  gcal: "Event",
  reminder: "Reminder",
  task: "Task",
};

export function AgendaView({
  initialAgenda,
  gcalConnected,
}: {
  initialAgenda: AgendaItem[];
  gcalConnected: boolean;
}) {
  const [range, setRange] = useState<"today" | "week">("today");
  const [agenda, setAgenda] = useState(initialAgenda);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleRangeChange(next: "today" | "week") {
    setRange(next);
    startTransition(async () => {
      setAgenda(await getAgenda(next));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Segmented
          className="w-32"
          options={[
            { value: "today", label: "Today" },
            { value: "week", label: "Week" },
          ]}
          value={range}
          onChange={handleRangeChange}
        />
        {gcalConnected && (
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setShowNewEvent(true)}>
            <Plus className="size-3.5" />
            Event
          </Button>
        )}
      </div>

      {isPending ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : agenda.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          description={gcalConnected ? "No events, reminders, or due tasks in this range." : "Connect Google Calendar in Settings to see your events here too."}
          icon={<CalendarDays className="size-8" />}
        />
      ) : (
        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {agenda.map((item) => (
              <motion.li
                key={item.id}
                layout
                variants={listItemVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={LIST_ITEM_TRANSITION}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
              >
                {(() => {
                  const content = (
                    <>
                      <div className="w-14 shrink-0 text-xs text-muted-foreground">
                        {item.allDay ? "All day" : formatInAppTimezone(item.time, { hour: "numeric", minute: "2-digit" })}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{item.title}</p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", SOURCE_STYLES[item.source])}>
                        {SOURCE_LABELS[item.source]}
                      </span>
                    </>
                  );
                  // Tapping a reminder or task jumps straight to where you'd
                  // act on it, instead of the agenda being read-only display.
                  if (item.source === "reminder") {
                    return (
                      <Link href="/calendar?tab=reminders" className="flex flex-1 items-center gap-3">
                        {content}
                      </Link>
                    );
                  }
                  if (item.source === "task") {
                    return (
                      <Link href="/tasks" className="flex flex-1 items-center gap-3">
                        {content}
                      </Link>
                    );
                  }
                  return (
                    <>
                      {content}
                      {item.htmlLink && (
                        <a href={item.htmlLink} target="_blank" rel="noreferrer" className="tap-press shrink-0 text-muted-foreground/50">
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </>
                  );
                })()}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {!gcalConnected && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ListTodo className="size-3.5" />
          Tasks with a due date and your reminders always show here — connect Google Calendar in Settings for your
          events too.
        </p>
      )}

      {showNewEvent && (
        <NewEventForm
          onClose={() => setShowNewEvent(false)}
          onCreated={async () => {
            setShowNewEvent(false);
            toast.success("Event added to Google Calendar");
            setAgenda(await getAgenda(range));
          }}
        />
      )}
    </div>
  );
}
