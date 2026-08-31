"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Panel, PanelHead, PanelEmpty } from "@/components/ui/panel";
import { CalendarGrid, type DayMark } from "@/components/ui/calendar-grid";
import { cn } from "@/lib/utils";
import { addMonths, formatDayLong, parseDateString, toDateString } from "@/lib/calendar";
import { PlanRow } from "./plan-row";
import { getPlanRange, type PlanItem } from "./actions";

/**
 * The month view.
 *
 * Marks on a day say what kind of thing is on it, not how many — three dots
 * is plenty of signal at this size, and a count would be unreadable. Tapping a
 * day fills the panel underneath with that day's items, which is where the
 * actual detail lives.
 */
export function CalendarView({
  todayIso,
  initialItems,
  initialMonth,
  timeZone,
}: {
  todayIso: string;
  initialItems: PlanItem[];
  /** `YYYY-MM` the server preloaded. */
  initialMonth: string;
  /** The profile's timezone — every time on this screen renders in it. */
  timeZone?: string;
}) {
  const [selected, setSelected] = useState(todayIso);
  const [items, setItems] = useState(initialItems);
  const [loadedMonth, setLoadedMonth] = useState(initialMonth);
  const [isPending, startTransition] = useTransition();

  const byDate = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    for (const item of items) {
      const list = map.get(item.dateIso) ?? [];
      list.push(item);
      map.set(item.dateIso, list);
    }
    return map;
  }, [items]);

  const marks = useMemo(() => {
    const out: Record<string, DayMark[]> = {};
    for (const [date, dayItems] of byDate) {
      // One mark per kind present, in a fixed order, so the same combination
      // always looks the same from day to day.
      const kinds: PlanItem["kind"][] = ["task", "routine", "event"];
      out[date] = kinds
        .filter((k) => dayItems.some((i) => i.kind === k && !i.done))
        .map((k) => ({
          color: k === "task" ? "ink" : k === "routine" ? "primary" : "accent",
        }));
      // A day where everything is already done still deserves a mark, just a
      // quiet one — otherwise a productive day looks like an empty one.
      if (out[date].length === 0 && dayItems.length > 0) out[date] = [{ color: "muted" }];
    }
    return out;
  }, [byDate]);

  /** Pulls a month's items when the grid moves outside what's loaded. */
  function ensureMonthLoaded(dateIso: string) {
    const month = dateIso.slice(0, 7);
    if (month === loadedMonth) return;
    const d = parseDateString(`${month}-01`);
    if (!d) return;
    const prev = addMonths(d.getFullYear(), d.getMonth(), -1);
    const next = addMonths(d.getFullYear(), d.getMonth(), 1);
    const start = toDateString(new Date(prev.year, prev.month, 1));
    const end = toDateString(new Date(next.year, next.month + 1, 0));
    startTransition(async () => {
      setItems(await getPlanRange(start, end));
      setLoadedMonth(month);
    });
  }

  const dayItems = byDate.get(selected) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <CalendarGrid
        selected={selected}
        todayIso={todayIso}
        marks={marks}
        onSelect={(iso) => {
          setSelected(iso);
          ensureMonthLoaded(iso);
        }}
      />

      <Panel>
        <PanelHead
          title={selected === todayIso ? "Today" : formatDayLong(selected)}
          count={dayItems.length > 0 ? dayItems.length : undefined}
        />

        {isPending ? (
          <p className="micro-sm px-3 py-6 text-center text-muted-foreground">Loading…</p>
        ) : dayItems.length === 0 ? (
          <PanelEmpty
            action={
              <Link
                href="/plan?new=1"
                className="micro-sm tap-press border-2 border-rule bg-surface px-2.5 py-1.5 transition-colors hover:bg-foreground hover:text-background"
              >
                <Plus className="mr-1 inline size-3" strokeWidth={3} />
                Add something
              </Link>
            }
          >
            Nothing on this day.
          </PanelEmpty>
        ) : (
          <ul>
            {dayItems.map((item, i) => (
              <PlanRow key={item.id} item={item} first={i === 0} timeZone={timeZone} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

