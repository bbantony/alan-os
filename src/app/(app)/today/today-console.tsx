"use client";

import { createElement, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Check, CalendarDays, Bell, ListChecks } from "lucide-react";

import { cn } from "@/lib/utils";
import { fadeInUpVariants } from "@/lib/motion";
import { utcToZonedParts } from "@/lib/time";
import { getRoutineIcon } from "@/lib/routines/icon-registry";
import { StreakBadge } from "@/components/streak-badge";
import { Panel, PanelHead, PanelEmpty } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import {
  completeRoutineToday,
  uncompleteRoutineToday,
} from "@/app/(app)/routines/actions";
import { setTaskCompleted } from "@/app/(app)/tasks/actions";
import type { Task } from "@/lib/tasks/types";
import type { RoutineWithProgress } from "@/lib/routines/types";

/**
 * The top half of the dashboard: what to do right now, and the shape of the
 * rest of the day.
 *
 * The old Today screen showed the same information three times — a "Tasks"
 * widget, a "Calendar & Reminders" widget and a day-planner card, none of them
 * aware of the others. This replaces all of it with one merged, ordered view,
 * and answers one question at the top of the screen before anything else:
 * *what is the single next thing*.
 *
 * NOW and THE DAY deliberately live in one component rather than two. They
 * share routine-completion state, and if they didn't, ticking a routine off in
 * the timeline would leave it still showing as "next up" in the block above —
 * exactly the kind of drift the previous three-widget design suffered from.
 */

type FlowKind = "routine" | "task" | "event";

interface FlowItem {
  key: string;
  kind: FlowKind;
  title: string;
  /** Minutes from local midnight. `null` means "sometime today". */
  minutes: number | null;
  timeLabel: string | null;
  overdue: boolean;
  done: boolean;
  href: string;
  routine?: RoutineWithProgress;
}

const KIND_META: Record<FlowKind, { label: string; icon: typeof ListChecks }> = {
  routine: { label: "Routine", icon: Bell },
  task: { label: "Task", icon: ListChecks },
  event: { label: "Event", icon: CalendarDays },
};

function minutesFromTimeOfDay(value: string | null): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export function TodayConsole({
  dueTodayTasks,
  overdueTasks,
  routinesDueToday,
  nextEventTitle,
  nextEventTime,
  nowMinutes,
}: {
  dueTodayTasks: Task[];
  overdueTasks: Task[];
  routinesDueToday: RoutineWithProgress[];
  nextEventTitle: string | null;
  nextEventTime: string | null;
  /** Local wall-clock minutes at render, computed server-side so the app's
   *  timezone is the source of truth rather than the device's. */
  nowMinutes: number;
}) {
  const [routines, setRoutines] = useState(routinesDueToday);
  const [doneTaskIds, setDoneTaskIds] = useState<Set<string>>(new Set());

  // Optimistic, then persisted. Ticking a task off the dashboard has to be a
  // real completion — a checkbox that only looks checked until the next page
  // load would be worse than not offering one at all.
  async function toggleTask(taskId: string) {
    const willBeDone = !doneTaskIds.has(taskId);
    setDoneTaskIds((prev) => {
      const nextSet = new Set(prev);
      if (willBeDone) nextSet.add(taskId);
      else nextSet.delete(taskId);
      return nextSet;
    });
    try {
      await setTaskCompleted({ id: taskId, completed: willBeDone });
    } catch {
      // Put it back the way it was rather than leaving the row lying.
      setDoneTaskIds((prev) => {
        const nextSet = new Set(prev);
        if (willBeDone) nextSet.delete(taskId);
        else nextSet.add(taskId);
        return nextSet;
      });
    }
  }

  async function toggleRoutine(routine: RoutineWithProgress) {
    if (routine.completedToday) {
      setRoutines((prev) =>
        prev.map((r) => (r.id === routine.id ? { ...r, completedToday: null } : r))
      );
      await uncompleteRoutineToday({ routineId: routine.id });
      return;
    }
    const stepIds = routine.steps.map((s) => s.id);
    setRoutines((prev) =>
      prev.map((r) =>
        r.id === routine.id
          ? {
              ...r,
              completedToday: {
                id: "",
                routine_id: r.id,
                user_id: "",
                completed_date: "",
                steps_done: stepIds,
                completed_at: "",
              },
            }
          : r
      )
    );
    await completeRoutineToday({ routineId: routine.id, stepsDone: stepIds });
  }

  const flow = useMemo<FlowItem[]>(() => {
    const items: FlowItem[] = [];

    for (const r of routines) {
      const minutes = minutesFromTimeOfDay(r.time_of_day);
      items.push({
        key: `routine-${r.id}`,
        kind: "routine",
        title: r.title,
        minutes,
        timeLabel: minutes === null ? null : formatClock(minutes),
        overdue: false,
        done: !!r.completedToday,
        href: "/plan",
        routine: r,
      });
    }

    for (const t of overdueTasks) {
      items.push({
        key: `task-${t.id}`,
        kind: "task",
        title: t.title,
        minutes: null,
        timeLabel: null,
        overdue: true,
        done: doneTaskIds.has(t.id),
        href: "/plan",
      });
    }

    for (const t of dueTodayTasks) {
      const parts = t.due_at ? utcToZonedParts(new Date(t.due_at)) : null;
      // A due date with no meaningful time on it (midnight) is "today", not
      // "at 12am" — showing it in the timed run would push every all-day task
      // to the very top of the day for no reason.
      const timed = parts && (parts.hour !== 0 || parts.minute !== 0);
      const minutes = timed ? parts.hour * 60 + parts.minute : null;
      items.push({
        key: `task-${t.id}`,
        kind: "task",
        title: t.title,
        minutes,
        timeLabel: minutes === null ? null : formatClock(minutes),
        overdue: false,
        done: doneTaskIds.has(t.id),
        href: "/plan",
      });
    }

    if (nextEventTitle) {
      const parts = nextEventTime ? utcToZonedParts(new Date(nextEventTime)) : null;
      const minutes = parts ? parts.hour * 60 + parts.minute : null;
      items.push({
        key: "event-next",
        kind: "event",
        title: nextEventTitle,
        minutes,
        timeLabel: minutes === null ? null : formatClock(minutes),
        overdue: false,
        done: false,
        href: "/plan?view=agenda",
      });
    }

    // Timed items in clock order first, then everything that's simply "today".
    // Overdue jumps the untimed queue — it's the most pressing thing there is.
    return items.sort((a, b) => {
      if (a.minutes !== null && b.minutes !== null) return a.minutes - b.minutes;
      if (a.minutes !== null) return -1;
      if (b.minutes !== null) return 1;
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return 0;
    });
  }, [routines, overdueTasks, dueTodayTasks, doneTaskIds, nextEventTitle, nextEventTime]);

  const outstanding = flow.filter((i) => !i.done);
  const doneCount = flow.length - outstanding.length;

  // "Next" is the first thing not yet done: an overdue item if there is one,
  // otherwise the earliest item whose time hasn't already passed, otherwise
  // just the first outstanding thing left.
  const next =
    outstanding.find((i) => i.overdue) ??
    outstanding.find((i) => i.minutes !== null && i.minutes >= nowMinutes) ??
    outstanding[0] ??
    null;

  return (
    <div className="flex flex-col gap-4">
      <NowBlock next={next} total={flow.length} done={doneCount} onToggleRoutine={toggleRoutine} />

      <motion.div variants={fadeInUpVariants}>
        <Panel>
          <PanelHead
            title="The day"
            count={flow.length > 0 ? `${doneCount}/${flow.length}` : undefined}
            action={
              <Link
                href="/plan"
                className="micro-sm flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                All
                <ArrowRight className="size-3" />
              </Link>
            }
          />

          {/* A thin completion meter directly under the header. Alan's note on
              the old Tasks page was that clearing things gave "no payoff" —
              this is the cheapest honest payoff there is: the bar fills. */}
          {flow.length > 0 && (
            <div className="h-1.5 w-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${(doneCount / flow.length) * 100}%` }}
              />
            </div>
          )}

          {flow.length === 0 ? (
            <PanelEmpty>Nothing scheduled today. Enjoy it.</PanelEmpty>
          ) : (
            <ul>
              {flow.map((item, i) => (
                <FlowRow
                  key={item.key}
                  item={item}
                  last={i === flow.length - 1}
                  isPast={item.minutes !== null && item.minutes < nowMinutes}
                  onToggleRoutine={toggleRoutine}
                  onToggleTask={toggleTask}
                />
              ))}
            </ul>
          )}
        </Panel>
      </motion.div>
    </div>
  );
}

/**
 * The one emphasised block on the screen: ink ground, paper text, the single
 * next thing in the display register. Everything else on the dashboard is
 * quieter than this on purpose — if two things shout, neither does.
 */
function NowBlock({
  next,
  total,
  done,
  onToggleRoutine,
}: {
  next: FlowItem | null;
  total: number;
  done: number;
  onToggleRoutine: (routine: RoutineWithProgress) => void;
}) {
  if (!next) {
    return (
      <motion.div variants={fadeInUpVariants}>
        <div className="border-2 border-rule bg-surface p-5">
          <p className="micro-sm text-muted-foreground">Now</p>
          <p className="display mt-2">All clear</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {total > 0
              ? `Everything for today is done — all ${done} of them.`
              : "Nothing on the books for today."}
          </p>
        </div>
      </motion.div>
    );
  }

  const Icon = KIND_META[next.kind].icon;

  return (
    <motion.div variants={fadeInUpVariants}>
      <div className="border-2 border-rule bg-foreground p-5 text-background">
        <div className="flex items-center justify-between gap-3">
          <p className="micro-sm text-background/60">Now</p>
          {next.overdue ? (
            <Tag tone="alert" filled>
              Overdue
            </Tag>
          ) : (
            <span className="micro-sm flex items-center gap-1.5 text-background/60">
              <Icon className="size-3" strokeWidth={2.5} />
              {next.timeLabel ?? KIND_META[next.kind].label}
            </span>
          )}
        </div>

        <p className="display mt-2 break-words">{next.title}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {next.routine ? (
            <button
              type="button"
              onClick={() => onToggleRoutine(next.routine!)}
              className="press flex h-10 items-center gap-2 border-2 border-background bg-background px-4 text-xs font-bold tracking-[0.08em] text-foreground uppercase hover:opacity-90"
            >
              <Check className="size-4" strokeWidth={3} />
              Mark done
            </button>
          ) : (
            <Link
              href={next.href}
              className="press flex h-10 items-center gap-2 border-2 border-background bg-background px-4 text-xs font-bold tracking-[0.08em] text-foreground uppercase hover:opacity-90"
            >
              Open
              <ArrowRight className="size-4" strokeWidth={3} />
            </Link>
          )}

          {total > 0 && (
            <span className="micro-sm text-background/60">
              {done} of {total} done today
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function FlowRow({
  item,
  last,
  isPast,
  onToggleRoutine,
  onToggleTask,
}: {
  item: FlowItem;
  last: boolean;
  isPast: boolean;
  onToggleRoutine: (routine: RoutineWithProgress) => void;
  onToggleTask: (id: string) => void;
}) {
  const KindIcon = KIND_META[item.kind].icon;
  const checkable = item.kind === "routine" || item.kind === "task";

  // `createElement` rather than binding the looked-up icon to a capitalised
  // local and rendering it as JSX: the latter reads to React's lint rules as
  // declaring a brand-new component type on every render, which would reset
  // its state each time. Nothing here is stateful, but the rule is right in
  // general and this is the cheap way to stay on the correct side of it.
  const routineGlyph = item.routine
    ? createElement(getRoutineIcon(item.routine.icon), {
        className: "size-3 text-muted-foreground",
      })
    : null;

  function handleCheck() {
    if (item.routine) onToggleRoutine(item.routine);
    else if (item.kind === "task") onToggleTask(item.key.replace("task-", ""));
  }

  return (
    <li
      className={cn(
        "flex items-stretch",
        !last && "border-b border-hairline",
        item.done && "bg-muted/30"
      )}
    >
      {/* Time gutter. Fixed width and tabular so the column lines up and the
          day reads as a schedule rather than as a list. A time that has
          already passed on something still outstanding goes amber — the one
          bit of ambient pressure on the screen. */}
      <span
        className={cn(
          "micro-sm flex w-14 shrink-0 items-center justify-end py-3 pr-1 tabular",
          item.overdue
            ? "text-destructive"
            : isPast && !item.done
              ? "text-warn"
              : "text-muted-foreground"
        )}
      >
        {item.overdue ? "LATE" : (item.timeLabel ?? "—")}
      </span>

      {/* The check control is its own hit target so ticking something off
          never navigates away by accident, and vice versa. */}
      {checkable ? (
        <button
          type="button"
          aria-label={item.done ? `Mark ${item.title} not done` : `Mark ${item.title} done`}
          aria-pressed={item.done}
          onClick={handleCheck}
          className="tap-press flex shrink-0 items-center px-2.5 transition-colors hover:bg-muted"
        >
          <span
            className={cn(
              "flex size-5 items-center justify-center border-2 border-rule",
              item.done && "bg-foreground text-background"
            )}
          >
            {item.done ? <Check className="size-3" strokeWidth={3} /> : routineGlyph}
          </span>
        </button>
      ) : (
        <span className="flex shrink-0 items-center px-2.5">
          <KindIcon className="size-4 text-muted-foreground" strokeWidth={2.5} />
        </span>
      )}

      {/* The title opens the owning module. A dashboard row has no business
          editing a task's notes, subtasks or recurrence — it hands off. */}
      <Link
        href={item.href}
        className="tap-press flex min-w-0 flex-1 items-center gap-2 py-3 pr-3 transition-colors hover:bg-muted"
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            item.done && "text-muted-foreground line-through"
          )}
        >
          {item.title}
        </span>
        {item.routine && !item.done && (
          <StreakBadge current={item.routine.streak.current} />
        )}
      </Link>
    </li>
  );
}
