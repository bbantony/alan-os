"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  addMonths,
  buildMonthGrid,
  MONTH_NAMES,
  parseDateString,
  toDateString,
  WEEKDAY_INITIALS,
} from "@/lib/calendar";

export interface DayMark {
  /** Up to three shown; more than that and the day just reads as "busy". */
  color: "ink" | "primary" | "accent" | "muted";
}

/**
 * The month grid.
 *
 * One component, two jobs: it's the body of the date picker, and it's the
 * calendar view on the Plan page. Those were never going to be two different
 * calendars — the only difference is whether days carry marks and what happens
 * when you tap one.
 *
 * Six rows always. A grid that shrinks to five in short months makes
 * everything under it jump on every page-turn.
 */
export function CalendarGrid({
  selected,
  onSelect,
  onViewChange,
  marks,
  todayIso,
  className,
  size = "default",
}: {
  /** `YYYY-MM-DD`, or null for nothing chosen yet. */
  selected: string | null;
  onSelect: (iso: string) => void;
  /** Fires when the arrows (or Today) turn the page to a different month. */
  onViewChange?: (year: number, month: number) => void;
  /** Keyed by `YYYY-MM-DD`. */
  marks?: Record<string, DayMark[]>;
  /** Passed in rather than read from the device, so the app's timezone wins. */
  todayIso: string;
  className?: string;
  size?: "default" | "compact";
}) {
  const initial = useMemo(() => {
    const base = (selected && parseDateString(selected)) || parseDateString(todayIso) || new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  }, [selected, todayIso]);

  const [view, setView] = useState(initial);

  /** The one place the page turns, so the owner always hears about it. */
  function changeView(year: number, month: number) {
    setView({ year, month });
    onViewChange?.(year, month);
  }

  const days = useMemo(
    () => buildMonthGrid(view.year, view.month, todayIso),
    [view, todayIso]
  );

  const showingThisMonth = useMemo(() => {
    const t = parseDateString(todayIso);
    return !!t && t.getFullYear() === view.year && t.getMonth() === view.month;
  }, [todayIso, view]);

  return (
    <div className={cn("border-2 border-rule bg-surface", className)}>
      {/* Month navigator — arrows in their own ruled cells so the whole thing
          reads as one control rather than three loose pieces. */}
      <div className="flex items-stretch border-b-2 border-rule">
        <button
          type="button"
          onClick={() => {
            const prev = addMonths(view.year, view.month, -1);
            changeView(prev.year, prev.month);
          }}
          aria-label="Previous month"
          className="tap-press flex w-10 shrink-0 items-center justify-center border-r border-hairline transition-colors hover:bg-muted"
        >
          <ChevronLeft className="size-4" strokeWidth={2.5} />
        </button>
        <span className="micro flex flex-1 items-center justify-center py-2.5">
          {MONTH_NAMES[view.month]} {view.year}
        </span>
        {!showingThisMonth && (
          <button
            type="button"
            onClick={() => {
              const t = parseDateString(todayIso) ?? new Date();
              changeView(t.getFullYear(), t.getMonth());
            }}
            className="micro-sm tap-press shrink-0 border-l border-hairline px-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Today
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const next = addMonths(view.year, view.month, 1);
            changeView(next.year, next.month);
          }}
          aria-label="Next month"
          className="tap-press flex w-10 shrink-0 items-center justify-center border-l border-hairline transition-colors hover:bg-muted"
        >
          <ChevronRight className="size-4" strokeWidth={2.5} />
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-hairline">
        {WEEKDAY_INITIALS.map((d, i) => (
          <span
            key={i}
            className="micro-sm py-1.5 text-center text-muted-foreground"
            aria-hidden="true"
          >
            {d}
          </span>
        ))}
      </div>

      {/* gap-px over a hairline ground: correct dividers in both directions at
          any row count, with no doubled line against the frame. */}
      <div className="grid grid-cols-7 gap-px bg-hairline">
        {days.map((day) => {
          const isSelected = day.iso === selected;
          const dayMarks = marks?.[day.iso] ?? [];
          return (
            <button
              key={day.iso}
              type="button"
              onClick={() => onSelect(day.iso)}
              aria-label={day.iso}
              aria-current={day.isToday ? "date" : undefined}
              aria-pressed={isSelected}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 transition-colors",
                size === "compact" ? "aspect-square text-xs" : "aspect-square text-sm",
                isSelected
                  ? "bg-foreground text-background"
                  : day.inMonth
                    ? "bg-surface hover:bg-muted"
                    : "bg-surface text-muted-foreground/40 hover:bg-muted",
                // Today is a ring rather than a fill, so it can still be seen
                // when some other day is the one selected.
                day.isToday && !isSelected && "outline-2 -outline-offset-2 outline-primary"
              )}
            >
              <span className={cn("tabular", day.isToday && "font-bold")}>{day.day}</span>

              {dayMarks.length > 0 && (
                <span className="flex h-1 items-center gap-0.5">
                  {dayMarks.slice(0, 3).map((mark, i) => (
                    <span
                      key={i}
                      className={cn(
                        "block size-1",
                        isSelected
                          ? "bg-background"
                          : mark.color === "primary"
                            ? "bg-primary"
                            : mark.color === "accent"
                              ? "bg-accent"
                              : mark.color === "muted"
                                ? "bg-muted-foreground"
                                : "bg-foreground"
                      )}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Today / Tomorrow / next week — the three dates people actually pick. */
export function DateShortcuts({
  todayIso,
  onSelect,
  className,
}: {
  todayIso: string;
  onSelect: (iso: string) => void;
  className?: string;
}) {
  const base = parseDateString(todayIso) ?? new Date();
  const shift = (days: number) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
    return toDateString(d);
  };

  const options = [
    { label: "Today", iso: shift(0) },
    { label: "Tomorrow", iso: shift(1) },
    { label: "Next week", iso: shift(7) },
  ];

  return (
    <div className={cn("grid grid-cols-3 border-2 border-rule bg-surface", className)}>
      {options.map((o, i) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onSelect(o.iso)}
          className={cn(
            "micro-sm tap-press py-2.5 transition-colors hover:bg-foreground hover:text-background",
            i > 0 && "border-l border-hairline"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
