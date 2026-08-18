"use client";

import Link from "next/link";
import { CalendarDays, Check, ExternalLink, Repeat } from "lucide-react";

import { Panel, PanelHead, PanelEmpty } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { formatDayRelative } from "@/lib/calendar";
import { shortNudge } from "@/lib/tasks/nudge";
import type { PlanItem } from "./actions";

/**
 * Everything coming up, in order, grouped by day.
 *
 * Replaces the old Agenda tab, which merged Google events, reminder rows and
 * tasks. Reminder rows are gone from it deliberately: under the nudge model a
 * reminder fires *before* its task is due, so including both put one
 * commitment on the agenda twice at two different times. The nudge now rides
 * along on the item as a small bell instead.
 */
export function AgendaView({
  items,
  todayIso,
  gcalConnected,
}: {
  items: PlanItem[];
  todayIso: string;
  gcalConnected: boolean;
}) {
  const upcoming = items.filter((i) => !i.done || i.dateIso === todayIso);

  const byDay = new Map<string, PlanItem[]>();
  for (const item of upcoming) {
    const list = byDay.get(item.dateIso) ?? [];
    list.push(item);
    byDay.set(item.dateIso, list);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));

  if (days.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Panel>
          <PanelEmpty>Nothing scheduled in the next two weeks.</PanelEmpty>
        </Panel>
        {!gcalConnected && <GoogleHint />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {days.map(([date, dayItems]) => (
        <Panel key={date}>
          <PanelHead title={formatDayRelative(date, todayIso)} count={dayItems.length} />
          <ul>
            {dayItems.map((item, i) => (
              <AgendaRow key={item.id} item={item} first={i === 0} />
            ))}
          </ul>
        </Panel>
      ))}
      {!gcalConnected && <GoogleHint />}
    </div>
  );
}

function GoogleHint() {
  return (
    <p className="flex items-start gap-2 border-2 border-rule bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
      <CalendarDays className="mt-0.5 size-3.5 shrink-0" />
      Your tasks and routines always show here. Connect Google Calendar in Settings for
      your events too.
    </p>
  );
}

function AgendaRow({ item, first }: { item: PlanItem; first: boolean }) {
  const time = item.allDay
    ? "All day"
    : new Date(item.at).toLocaleTimeString("en-CA", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Winnipeg",
      });

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
        {nudge && <span className="micro-sm mt-0.5 block text-muted-foreground">🔔 {nudge}</span>}
      </span>

      {item.kind === "event" && <Tag tone="accent">Event</Tag>}
    </>
  );

  const rowClass = cn(
    "flex w-full items-center gap-3 px-3 py-2.5 text-left",
    !first && "border-t border-hairline",
    item.done && "bg-muted/30"
  );

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
            className="tap-press shrink-0 text-muted-foreground/60 hover:text-foreground"
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
