"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, CheckCircle2, Circle, MoonStar, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fadeInUpVariants } from "@/lib/motion";
import { formatInAppTimezone } from "@/lib/time";
import { getRoutineIcon } from "@/lib/routines/icon-registry";
import { StreakBadge } from "@/components/streak-badge";
import { completeRoutineToday, uncompleteRoutineToday } from "@/app/(app)/routines/actions";
import { planTomorrow } from "@/app/(app)/calendar/actions";
import type { TodayFocusGoal } from "@/app/(app)/calendar/actions";
import type { Task } from "@/lib/tasks/types";
import type { RoutineWithProgress } from "@/lib/routines/types";

export function TodayTimeline({
  isEvening,
  dueTodayTasks,
  overdueTasks,
  routinesDueToday,
  nextEventTitle,
  nextEventTime,
  focus,
  yesterdayReflection,
  openTasks,
}: {
  isEvening: boolean;
  dueTodayTasks: Task[];
  overdueTasks: Task[];
  routinesDueToday: RoutineWithProgress[];
  nextEventTitle: string | null;
  nextEventTime: string | null;
  focus: { source: "planned" | "auto"; goals: TodayFocusGoal[] };
  yesterdayReflection: string | null;
  openTasks: Task[];
}) {
  const [routines, setRoutines] = useState(routinesDueToday);

  async function toggleRoutine(routine: RoutineWithProgress) {
    if (routine.completedToday) {
      setRoutines((prev) => prev.map((r) => (r.id === routine.id ? { ...r, completedToday: null } : r)));
      await uncompleteRoutineToday({ routineId: routine.id });
      return;
    }
    const stepIds = routine.steps.map((s) => s.id);
    setRoutines((prev) =>
      prev.map((r) =>
        r.id === routine.id
          ? { ...r, completedToday: { id: "", routine_id: r.id, user_id: "", completed_date: "", steps_done: stepIds, completed_at: "" } }
          : r
      )
    );
    await completeRoutineToday({ routineId: routine.id, stepsDone: stepIds });
  }

  const whatsNext = useMemo(() => {
    if (overdueTasks.length > 0) return { label: overdueTasks[0].title, tag: "Overdue" };
    const nextRoutine = routines.find((r) => !r.completedToday);
    const nextTask = dueTodayTasks[0];
    if (nextTask && nextRoutine) {
      return { label: nextTask.title, tag: "Due today" };
    }
    if (nextTask) return { label: nextTask.title, tag: "Due today" };
    if (nextRoutine) return { label: nextRoutine.title, tag: "Routine" };
    if (nextEventTitle) return { label: nextEventTitle, tag: "Next up" };
    return null;
  }, [overdueTasks, routines, dueTodayTasks, nextEventTitle]);

  return (
    <motion.div variants={fadeInUpVariants} className="rounded-xl border border-border bg-surface p-4 sm:col-span-2">
      {whatsNext && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm">
          <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            {whatsNext.tag}
          </span>
          <span className="truncate font-medium">{whatsNext.label}</span>
        </div>
      )}

      {routines.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Routines today</p>
          <ul className="space-y-1">
            {routines.map((r) => {
              const Icon = getRoutineIcon(r.icon);
              const done = !!r.completedToday;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => toggleRoutine(r)}
                    className="tap-press flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-md border", done ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                      {done ? <Check className="size-3.5" /> : <Icon className="size-3 text-muted-foreground" />}
                    </span>
                    <span className={cn("flex-1 truncate", done && "text-muted-foreground line-through")}>{r.title}</span>
                    <StreakBadge current={r.streak.current} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(overdueTasks.length > 0 || dueTodayTasks.length > 0) && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tasks</p>
          <ul className="space-y-1">
            {[...overdueTasks, ...dueTodayTasks].slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm">
                <Circle className="size-3.5 shrink-0 text-muted-foreground/50" />
                <span className="flex-1 truncate">{t.title}</span>
                {t.due_at && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatInAppTimezone(t.due_at, { hour: "numeric", minute: "2-digit" })}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <Link href="/tasks" className="tap-press mt-1 flex items-center gap-1 text-xs font-medium text-primary">
            View all tasks
            <ArrowRight className="size-3" />
          </Link>
        </div>
      )}

      {nextEventTitle && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next on your calendar</p>
          <p className="text-sm">
            {nextEventTitle}
            {nextEventTime && (
              <span className="ml-1.5 text-xs text-muted-foreground">
                {formatInAppTimezone(nextEventTime, { dateStyle: "medium", timeStyle: "short" })}
              </span>
            )}
          </p>
        </div>
      )}

      {!isEvening && (
        <div className="border-t border-border pt-3">
          <div className="mb-1.5 flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="font-heading text-sm font-semibold">Today&apos;s focus</span>
            {focus.source === "auto" && focus.goals.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Auto-picked</span>
            )}
            {focus.source === "planned" && focus.goals.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {focus.goals.filter((g) => g.done).length} of {focus.goals.length} done
              </span>
            )}
          </div>
          {focus.goals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing picked — plan tomorrow tonight after 8pm.</p>
          ) : (
            <ul className="space-y-1">
              {focus.goals.map((g, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  {g.done ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                  ) : (
                    <Circle className="size-3.5 shrink-0 text-muted-foreground/50" />
                  )}
                  <span className={cn(g.done && "text-muted-foreground line-through")}>{g.title}</span>
                </li>
              ))}
            </ul>
          )}
          {yesterdayReflection && (
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              Yesterday: &ldquo;{yesterdayReflection}&rdquo;
            </p>
          )}
        </div>
      )}

      {isEvening && <EveningRitual openTasks={openTasks} />}
    </motion.div>
  );
}

function EveningRitual({ openTasks }: { openTasks: Task[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ taskId: string | null; title: string }[]>([]);
  const [freeText, setFreeText] = useState("");
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const filtered = useMemo(() => {
    const key = query.trim().toLowerCase();
    const selectedIds = new Set(selected.map((g) => g.taskId));
    const pool = openTasks.filter((t) => !selectedIds.has(t.id));
    return (key ? pool.filter((t) => t.title.toLowerCase().includes(key)) : pool).slice(0, 6);
  }, [openTasks, query, selected]);

  function toggleTask(task: Task) {
    setSelected((prev) => {
      if (prev.some((g) => g.taskId === task.id)) return prev.filter((g) => g.taskId !== task.id);
      if (prev.length >= 3) return prev;
      return [...prev, { taskId: task.id, title: task.title }];
    });
  }

  function addFreeText() {
    const title = freeText.trim();
    if (!title || selected.length >= 3) return;
    setSelected((prev) => [...prev, { taskId: null, title }]);
    setFreeText("");
  }

  async function handleSave() {
    setSaving(true);
    await planTomorrow({ goals: selected, reflection: reflection.trim() || null });
    setSaving(false);
    setSaved(true);
  }

  if (saved) {
    return (
      <div className="flex items-center gap-2 border-t border-border pt-3 text-sm text-primary">
        <CheckCircle2 className="size-4" />
        Tomorrow&apos;s plan is set.
      </div>
    );
  }

  return (
    <div className="border-t border-border pt-3">
      <div className="mb-3 flex items-center gap-2">
        <MoonStar className="size-4 text-primary" />
        <span className="font-heading text-sm font-semibold">Plan tomorrow</span>
      </div>

      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Pick up to 3 goals ({selected.length}/3)</p>
      {selected.length > 0 && (
        <ul className="mb-2 space-y-1">
          {selected.map((g, i) => (
            <li key={i} className="flex items-center justify-between rounded-lg bg-primary/10 px-2.5 py-1.5 text-sm">
              {g.title}
              <button onClick={() => setSelected((prev) => prev.filter((_, idx) => idx !== i))} className="tap-press text-primary/60 hover:text-primary">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected.length < 3 && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search open tasks…"
            className="mb-1.5 h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
          />
          {filtered.length > 0 && (
            <ul className="mb-2 space-y-1">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button onClick={() => toggleTask(t)} className="tap-press w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted">
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mb-3 flex gap-1.5">
            <input
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addFreeText()}
              placeholder="Or type a new goal…"
              className="h-8 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
            />
            <Button type="button" size="sm" variant="outline" onClick={addFreeText}>
              Add
            </Button>
          </div>
        </>
      )}

      <p className="mb-1.5 text-xs font-medium text-muted-foreground">One-line reflection on today (optional)</p>
      <input
        value={reflection}
        onChange={(e) => setReflection(e.target.value)}
        placeholder="How'd today go?"
        className="mb-3 h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
      />

      <Button type="button" className={cn("w-full", saving && "opacity-70")} onClick={handleSave} disabled={saving || (selected.length === 0 && !reflection.trim())}>
        {saving ? "Saving…" : "Save plan"}
      </Button>
    </div>
  );
}
