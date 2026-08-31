"use client";

import Link from "next/link";
import { Bell, CalendarDays, Check, ExternalLink, Repeat } from "lucide-react";

import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { formatInAppTimezone } from "@/lib/time";
import { shortNudge } from "@/lib/tasks/nudge";
import type { PlanItem } from "./actions";

/**
 * One line in the Plan — a task, a routine or a calendar event.
 *
 * This existed TWICE, as `AgendaRow` in agenda-view.tsx and `DayRow` in
 * calendar-view.tsx, and the two were identical apart from where the lines
 * happened to wrap. Seventy-five lines of markup kept in step by hand across
 * two files, which is a thing that stays true right up until it doesn't.
 *
 * Two audit findings were fixed while merging rather than duplicated into the
 * merged copy:
 *
 *   - The timezone was the literal string "America/Winnipeg" in both copies,
 *     while `profiles.timezone` is documented as the thing every date renders
 *     in. It is a prop now, so a traveller sees their own hours.
 *   - The bell was the emoji 🔔, while every other bell in the app is the
 *     drawn `Bell` icon. An emoji renders in the platform font, ignores
 *     `currentColor`, and sits at the wrong weight in a line of mono metadata.
 */
export function PlanRow({
  item,
  first,
  timeZone,
}: {
  item: PlanItem;
  first: boolean;
  /** The profile's timezone. Falls back to the app default inside the helper. */
  timeZone?: string;
}) {
  const time = item.allDay
    ? "All day"
    : formatInAppTimezone(item.at, { hour: "numeric", minute: "2-digit" }, timeZone);

  const nudge = shortNudge(item.nudgeMinutes);

  const inner = (
    <>
      <span className="micro-sm w-16 shrink-0 tabular text-muted-foreground">{time}</span>

      {item.kind === "event" ? (
        <CalendarDays className="size-4 shrink-0 text-accent" strokeWidth={2.25} />
      ) : item.kind === "routine" ? (
        <Repeat className="size-4 shrink-0 text-primary" strokeWidth={2.25} />
      ) : (
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center border-2 border-rule",
            item.done && "bg-foreground text-background"
          )}
        >
          {item.done && <Check className="size-2.5" strokeWidth={3} />}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span
          className={cn("block truncate text-sm", item.done && "text-muted-foreground line-through")}
        >
          {item.title}
        </span>
        {nudge && (
          <span className="micro-sm mt-0.5 flex items-center gap-1 text-muted-foreground">
            <Bell className="size-3 shrink-0" strokeWidth={2.5} />
            {nudge}
          </span>
        )}
      </span>

      {item.kind === "event" && <Tag tone="accent">Event</Tag>}
    </>
  );

  const rowClass = cn(
    "flex w-full items-center gap-3 px-3 py-2.5 text-left",
    !first && "border-t border-hairline",
    item.done && "bg-muted/30"
  );

  // A Google event isn't ours to open in the app, so the row itself isn't a
  // link — only the "open in Google Calendar" affordance is.
  if (item.kind === "event") {
    return (
      <li className={rowClass}>
        {inner}
        {item.htmlLink && (
          <a
            href={item.htmlLink}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${item.title} in Google Calendar`}
            className="tap-press tap-target shrink-0 text-muted-foreground/60 hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </li>
    );
  }

  return (
    <li>
      <Link href="/plan" className={cn(rowClass, "tap-press transition-colors hover:bg-muted")}>
        {inner}
      </Link>
    </li>
  );
}
