"use client";

import { CalendarDays } from "lucide-react";

import { Panel, PanelHead, PanelEmpty } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { formatDayRelative } from "@/lib/calendar";
import { PlanRow } from "./plan-row";
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
  timeZone,
}: {
  items: PlanItem[];
  todayIso: string;
  gcalConnected: boolean;
  timeZone?: string;
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
              <PlanRow key={item.id} item={item} first={i === 0} timeZone={timeZone} />
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

