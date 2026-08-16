"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ExternalLink, ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/empty-state";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { listItemVariants, LIST_ITEM_TRANSITION } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatInAppTimezone } from "@/lib/time";
import { getAgenda, type AgendaItem } from "./actions";
import { NewEventForm } from "./new-event-form";

// Which module an agenda row came from. These are the same three sources the
// Today dashboard merges, and they're tagged the same way in both places so
// "Event" always looks like "Event" wherever you meet it.
const SOURCE_TONES: Record<AgendaItem["source"], "accent" | "primary" | "default"> = {
  gcal: "accent",
  reminder: "primary",
  task: "default",
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Segmented
          className="flex-1"
          options={[
            { value: "today", label: "Today" },
            { value: "week", label: "Week" },
          ]}
          value={range}
          onChange={handleRangeChange}
        />
        {gcalConnected && (
          <Button type="button" variant="outline" onClick={() => setShowNewEvent(true)}>
            <Plus className="size-4" strokeWidth={3} />
            Event
          </Button>
        )}
      </div>

      {isPending ? (
        <p className="micro-sm py-8 text-center text-muted-foreground">Loading…</p>
      ) : agenda.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          description={
            gcalConnected
              ? "No events, reminders, or due tasks in this range."
              : "Connect Google Calendar in Settings to see your events here too."
          }
          icon={<CalendarDays className="size-8" />}
        />
      ) : (
        <Panel>
          <PanelHead
            title={range === "today" ? "Today" : "Next 7 days"}
            count={agenda.length}
          />
          <ul>
            <AnimatePresence initial={false}>
              {agenda.map((item, i) => {
                const time = item.allDay
                  ? "All day"
                  : formatInAppTimezone(item.time, { hour: "numeric", minute: "2-digit" });

                const inner = (
                  <>
                    {/* Same fixed-width tabular time gutter as the dashboard's
                        day flow, so the two views of the same day line up
                        visually rather than each inventing a layout. */}
                    <span className="micro-sm w-14 shrink-0 tabular text-muted-foreground">
                      {time}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                    <Tag tone={SOURCE_TONES[item.source]}>{SOURCE_LABELS[item.source]}</Tag>
                  </>
                );

                // Tapping a reminder or task jumps straight to where you'd act
                // on it, instead of the agenda being read-only display.
                const href =
                  item.source === "reminder"
                    ? "/calendar?tab=reminders"
                    : item.source === "task"
                      ? "/tasks"
                      : null;

                return (
                  <motion.li
                    key={item.id}
                    layout
                    variants={listItemVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={LIST_ITEM_TRANSITION}
                    className={cn(i > 0 && "border-t border-hairline")}
                  >
                    {href ? (
                      <Link
                        href={href}
                        className="tap-press flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        {inner}
                        {item.htmlLink && (
                          <a
                            href={item.htmlLink}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open ${item.title} in Google Calendar`}
                            className="tap-press shrink-0 text-muted-foreground/60 transition-colors hover:text-foreground"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </div>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </Panel>
      )}

      {!gcalConnected && (
        <p className="flex items-start gap-2 border-2 border-rule bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          <ListTodo className="mt-0.5 size-3.5 shrink-0" />
          Tasks with a due date and your reminders always show here. Connect Google Calendar in
          Settings for your events too.
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
