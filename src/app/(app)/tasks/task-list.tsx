"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  BellRing,
  Check,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Plus,
  Repeat,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Panel, PanelHead, PanelEmpty } from "@/components/ui/panel";
import { Tag, Micro } from "@/components/ui/tag";
import { DateTimeField } from "@/components/ui/date-field";
import { NudgePicker } from "@/components/nudge-picker";
import { RecurrencePicker } from "@/components/recurrence-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { TasksIllustration } from "@/components/illustrations";
import { toast } from "@/components/ui/toast";
import { listItemVariants, LIST_ITEM_TRANSITION } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatInAppTimezone } from "@/lib/time";
import { DEFAULT_NUDGE_MINUTES, shortNudge } from "@/lib/tasks/nudge";
import { buildRRuleString, describeRRule } from "@/lib/reminders/rrule";
import type { RecurrencePreset } from "@/lib/reminders/types";
import {
  TASK_HORIZONS,
  TASK_HORIZON_LABELS,
  TASK_CATEGORY_LABELS,
  type Task,
  type TaskCategory,
  type TaskHorizon,
} from "@/lib/tasks/types";
import {
  createTask,
  deleteTask,
  getCompletedTasks,
  setTaskCompleted,
  setTaskNudge,
} from "./actions";
import { TaskDetailDialog } from "./task-detail-dialog";

const QUICK_ADD_PRESETS: RecurrencePreset[] = [
  "none", "daily", "weekdays", "weekly", "every_n_days", "monthly",
];

export function TaskList({
  initialTasks,
  weeklyDoneCount,
  initialDoneTodayByHorizon,
  autoFocusNew = false,
}: {
  initialTasks: Task[];
  weeklyDoneCount: number;
  initialDoneTodayByHorizon: Record<TaskHorizon, number>;
  /** Set by the `?new=1` link the app-wide quick-add sends here. */
  autoFocusNew?: boolean;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [title, setTitle] = useState("");
  const [horizon, setHorizon] = useState<TaskHorizon>("today");
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [confirmTask, setConfirmTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Task[] | null>(null);
  const [doneTodayByHorizon, setDoneTodayByHorizon] = useState(initialDoneTodayByHorizon);
  const [countedTaskIds, setCountedTaskIds] = useState<Set<string>>(new Set());

  // "More options" quick-add panel — collapsed by default so a bare quick
  // task stays exactly as fast as it always was (type + Enter).
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [quickCategory, setQuickCategory] = useState<TaskCategory>("personal");
  const [quickDueAt, setQuickDueAt] = useState("");
  const [quickPreset, setQuickPreset] = useState<RecurrencePreset>("none");
  const [quickWeekday, setQuickWeekday] = useState(0);
  const [quickIntervalDays, setQuickIntervalDays] = useState("2");
  const [quickMonthDay, setQuickMonthDay] = useState("1");
  const [quickNudge, setQuickNudge] = useState<number | null>(null);

  // Arriving from the app-wide quick-add should land with the cursor already
  // in the box — otherwise "add a task" costs a tap on the menu and another
  // on the field, which defeats the point of having the shortcut.
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocusNew) titleRef.current?.focus();
  }, [autoFocusNew]);

  const topLevel = tasks.filter((t) => !t.parent_task_id);
  const subtasksOf = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.parent_task_id) {
        const list = map.get(t.parent_task_id) ?? [];
        list.push(t);
        map.set(t.parent_task_id, list);
      }
    }
    return map;
  }, [tasks]);

  function resetMoreOptions() {
    setShowMoreOptions(false);
    setQuickCategory("personal");
    setQuickDueAt("");
    setQuickPreset("none");
    setQuickWeekday(0);
    setQuickIntervalDays("2");
    setQuickMonthDay("1");
    setQuickNudge(null);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const id = crypto.randomUUID();

    const dueAtIso = quickDueAt ? new Date(quickDueAt).toISOString() : null;
    const rrule =
      quickPreset === "weekly"
        ? buildRRuleString({ preset: quickPreset, weekday: quickWeekday })
        : quickPreset === "every_n_days"
          ? buildRRuleString({ preset: quickPreset, intervalDays: Number(quickIntervalDays) || 2 })
          : quickPreset === "monthly"
            ? buildRRuleString({ preset: quickPreset, monthDay: Number(quickMonthDay) || 1 })
            : buildRRuleString({ preset: quickPreset });

    const optimistic: Task = {
      id,
      user_id: "",
      parent_task_id: null,
      title: trimmed,
      notes: null,
      horizon,
      due_at: dueAtIso,
      category: quickCategory,
      completed_at: null,
      sort_order: 0,
      created_at: new Date().toISOString(),
      rrule,
      gcal_event_id: null,
      notify_offset_minutes: dueAtIso ? quickNudge : null,
    };
    setTasks((prev) => [...prev, optimistic]);
    setTitle("");
    const category = quickCategory;
    resetMoreOptions();
    await createTask({
      id,
      title: trimmed,
      horizon,
      category,
      dueAt: dueAtIso,
      rrule,
      notifyOffsetMinutes: dueAtIso ? quickNudge : null,
    });
  }

  // The bell on a row is a shortcut between "no reminder" and a sensible
  // default. Picking exactly how far ahead is the detail dialog's job.
  async function handleToggleNudge(task: Task) {
    const next = task.notify_offset_minutes === null ? DEFAULT_NUDGE_MINUTES : null;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, notify_offset_minutes: next } : t))
    );
    const result = await setTaskNudge({ id: task.id, offsetMinutes: next });
    if (result.error) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, notify_offset_minutes: task.notify_offset_minutes } : t
        )
      );
      toast.error(result.error);
      return;
    }
    toast.success(next === null ? "Reminder off" : "Reminder set for 30 min before");
  }

  async function handleAddSubtask(parent: Task) {
    const trimmed = subtaskTitle.trim();
    if (!trimmed) return;
    const id = crypto.randomUUID();
    const optimistic: Task = {
      id,
      user_id: "",
      parent_task_id: parent.id,
      title: trimmed,
      notes: null,
      horizon: parent.horizon,
      due_at: null,
      category: parent.category,
      completed_at: null,
      sort_order: 0,
      created_at: new Date().toISOString(),
      rrule: null,
      gcal_event_id: null,
      notify_offset_minutes: null,
    };
    setTasks((prev) => [...prev, optimistic]);
    setSubtaskTitle("");
    setAddingSubtaskFor(null);
    await createTask({
      id,
      title: trimmed,
      horizon: parent.horizon,
      category: parent.category,
      parentTaskId: parent.id,
    });
  }

  async function completeTask(task: Task) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    setCompletedTasks(null);
    setDoneTodayByHorizon((prev) => ({ ...prev, [task.horizon]: (prev[task.horizon] ?? 0) + 1 }));
    setCountedTaskIds((prev) => new Set(prev).add(task.id));
    const result = await setTaskCompleted({ id: task.id, completed: true });
    if (result.nextTask) {
      setTasks((prev) => [...prev, result.nextTask!]);
      toast.success(
        `"${task.title}" completed — repeats again ${task.rrule ? describeRRule(task.rrule) : ""}`.trim()
      );
    }
  }

  function handleToggleComplete(task: Task) {
    const openSubtasks = subtasksOf.get(task.id)?.filter((s) => !s.completed_at) ?? [];
    if (openSubtasks.length > 0) {
      setConfirmTask(task);
      return;
    }
    completeTask(task);
  }

  async function handleDelete(task: Task) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id && t.parent_task_id !== task.id));
    await deleteTask({ id: task.id });
    toast.success("Task deleted");
  }

  async function handleToggleCompletedArchive() {
    const next = !showCompleted;
    setShowCompleted(next);
    if (next && completedTasks === null) {
      const done = await getCompletedTasks();
      setCompletedTasks(done);
    }
  }

  async function handleUndoComplete(task: Task) {
    setCompletedTasks((prev) => (prev ? prev.filter((t) => t.id !== task.id) : prev));
    setTasks((prev) => [...prev, { ...task, completed_at: null }]);
    // Only back out of today's count if this task was actually completed in
    // this same session — undoing something from a prior day (reachable via
    // this same Completed archive) shouldn't decrement today's tally.
    if (countedTaskIds.has(task.id)) {
      setDoneTodayByHorizon((prev) => ({
        ...prev,
        [task.horizon]: Math.max(0, (prev[task.horizon] ?? 0) - 1),
      }));
      setCountedTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
    await setTaskCompleted({ id: task.id, completed: false });
  }

  const visibleSections = TASK_HORIZONS.filter((h) => {
    const inHorizon = topLevel.filter((t) => t.horizon === h);
    return inHorizon.length > 0 || (doneTodayByHorizon[h] ?? 0) > 0;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------- Quick add ---------------- */}
      <Panel>
        <form onSubmit={handleAdd}>
          <div className="flex items-stretch border-b-2 border-rule">
            <Input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a task…"
              aria-label="New task"
              className="h-11 flex-1 border-0 border-r-2 border-rule focus-visible:border-rule"
            />
            <button
              type="submit"
              aria-label="Add task"
              className="tap-press tap-target flex w-12 shrink-0 items-center justify-center bg-primary text-primary-foreground transition-colors hover:brightness-95"
            >
              <Plus className="size-5" strokeWidth={3} />
            </button>
          </div>

          <div className="flex items-stretch">
            <Select
              value={horizon}
              onChange={(e) => setHorizon(e.target.value as TaskHorizon)}
              aria-label="When"
              className="h-10 flex-1 border-0 border-r-2 border-rule text-xs focus-visible:border-rule"
            >
              {TASK_HORIZONS.map((h) => (
                <option key={h} value={h}>
                  {TASK_HORIZON_LABELS[h]}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => setShowMoreOptions((v) => !v)}
              aria-expanded={showMoreOptions}
              className="micro-sm tap-press flex w-36 shrink-0 items-center justify-center gap-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {showMoreOptions ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              Options
            </button>
          </div>

          {showMoreOptions && (
            <div className="flex flex-col gap-3 border-t-2 border-rule bg-muted/30 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="micro-sm mb-1.5 block text-muted-foreground">Category</label>
                  <Select
                    value={quickCategory}
                    onChange={(e) => setQuickCategory(e.target.value as TaskCategory)}
                  >
                    {Object.entries(TASK_CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="micro-sm mb-1.5 block text-muted-foreground">Due</label>
                  <DateTimeField
                    value={quickDueAt}
                    onChange={setQuickDueAt}
                    placeholder="No due date"
                    aria-label="Due date"
                  />
                </div>
              </div>

              <RecurrencePicker
                presets={QUICK_ADD_PRESETS}
                preset={quickPreset}
                onPresetChange={setQuickPreset}
                weekday={quickWeekday}
                onWeekdayChange={setQuickWeekday}
                intervalDays={quickIntervalDays}
                onIntervalDaysChange={setQuickIntervalDays}
                monthDay={quickMonthDay}
                onMonthDayChange={setQuickMonthDay}
              />

              <NudgePicker value={quickNudge} onChange={setQuickNudge} disabled={!quickDueAt} />
            </div>
          )}
        </form>
      </Panel>

      {/* ---------------- Horizon sections ---------------- */}
      {tasks.length === 0 && visibleSections.length === 0 ? (
        <EmptyState
          title="Nothing on your plate"
          description="Add a task above to get started."
          icon={<TasksIllustration className="size-8" />}
        />
      ) : (
        visibleSections.map((h) => (
          <TaskSection
            key={h}
            label={TASK_HORIZON_LABELS[h]}
            doneToday={doneTodayByHorizon[h] ?? 0}
            tasks={topLevel.filter((t) => t.horizon === h)}
            subtasksOf={subtasksOf}
            addingSubtaskFor={addingSubtaskFor}
            subtaskTitle={subtaskTitle}
            onSubtaskTitleChange={setSubtaskTitle}
            onStartAddSubtask={setAddingSubtaskFor}
            onAddSubtask={handleAddSubtask}
            onToggleComplete={handleToggleComplete}
            onDelete={handleDelete}
            onToggleNudge={handleToggleNudge}
            onOpenDetail={setEditingTask}
          />
        ))
      )}

      {/* ---------------- Completed archive ---------------- */}
      <Panel>
        <button
          type="button"
          onClick={handleToggleCompletedArchive}
          aria-expanded={showCompleted}
          className="micro flex min-h-11 w-full items-center gap-1.5 px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {showCompleted ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          Completed
        </button>

        {showCompleted && (
          <ul className="border-t-2 border-rule">
            {(completedTasks ?? []).map((task, i) => (
              <li
                key={task.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5",
                  i > 0 && "border-t border-hairline"
                )}
              >
                <button
                  type="button"
                  onClick={() => handleUndoComplete(task)}
                  className="tap-press tap-target flex size-5 shrink-0 items-center justify-center border-2 border-rule bg-foreground text-background"
                  aria-label={`Mark ${task.title} not done`}
                >
                  <Check className="size-3" strokeWidth={3} />
                </button>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground line-through">
                  {task.title}
                </span>
              </li>
            ))}
            {completedTasks?.length === 0 && (
              <PanelEmpty>Nothing completed yet.</PanelEmpty>
            )}
          </ul>
        )}
      </Panel>

      <Micro className="px-1">{weeklyDoneCount} done this week</Micro>

      {/* ---------------- Dialogs ---------------- */}
      <Dialog open={!!confirmTask} onOpenChange={(open) => !open && setConfirmTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete this?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            &ldquo;{confirmTask?.title}&rdquo; still has unfinished subtasks.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTask(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirmTask) completeTask(confirmTask);
                setConfirmTask(null);
              }}
            >
              Complete anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingTask && (
        <TaskDetailDialog
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={(updated) => {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setEditingTask(null);
          }}
          onDeleted={(id) => {
            setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_task_id !== id));
            setEditingTask(null);
          }}
        />
      )}
    </div>
  );
}

function TaskSection({
  label,
  doneToday,
  tasks,
  subtasksOf,
  addingSubtaskFor,
  subtaskTitle,
  onSubtaskTitleChange,
  onStartAddSubtask,
  onAddSubtask,
  onToggleComplete,
  onDelete,
  onToggleNudge,
  onOpenDetail,
}: {
  label: string;
  doneToday: number;
  tasks: Task[];
  subtasksOf: Map<string, Task[]>;
  addingSubtaskFor: string | null;
  subtaskTitle: string;
  onSubtaskTitleChange: (v: string) => void;
  onStartAddSubtask: (id: string | null) => void;
  onAddSubtask: (parent: Task) => void;
  onToggleComplete: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleNudge: (task: Task) => void;
  onOpenDetail: (task: Task) => void;
}) {
  const cleared = tasks.length === 0 && doneToday > 0;

  return (
    <Panel>
      <PanelHead
        title={label}
        count={tasks.length > 0 ? tasks.length : undefined}
        action={
          doneToday > 0 ? (
            <Tag tone="ok" filled={cleared}>
              {doneToday} done
            </Tag>
          ) : null
        }
      />

      {cleared ? (
        <PanelEmpty>All clear — {doneToday} done today.</PanelEmpty>
      ) : (
        <ul>
          <AnimatePresence initial={false}>
            {tasks.map((task, i) => {
              const subs = subtasksOf.get(task.id) ?? [];
              return (
                <motion.li
                  key={task.id}
                  layout
                  variants={listItemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={LIST_ITEM_TRANSITION}
                  className={cn(i > 0 && "border-t border-hairline")}
                >
                  <TaskRow
                    task={task}
                    onToggleComplete={() => onToggleComplete(task)}
                    onDelete={() => onDelete(task)}
                    onToggleNudge={() => onToggleNudge(task)}
                    onOpenDetail={() => onOpenDetail(task)}
                  />

                  {/* Subtasks sit behind a left rule rather than on plain
                      indentation — the rule is what makes the nesting legible
                      at a glance in a dense list. */}
                  {subs.length > 0 && (
                    <ul className="ml-8 border-l-2 border-hairline">
                      {subs.map((sub) => (
                        <li key={sub.id}>
                          <TaskRow
                            task={sub}
                            subtle
                            onToggleComplete={() => onToggleComplete(sub)}
                            onDelete={() => onDelete(sub)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}

                  {addingSubtaskFor === task.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        onAddSubtask(task);
                      }}
                      className="ml-8 flex gap-2 border-l-2 border-hairline p-2"
                    >
                      <Input
                        autoFocus
                        value={subtaskTitle}
                        onChange={(e) => onSubtaskTitleChange(e.target.value)}
                        placeholder="Subtask…"
                        className="h-8 text-sm"
                      />
                      <Button type="submit" size="icon-sm" aria-label="Add subtask">
                        <Plus className="size-4" strokeWidth={3} />
                      </Button>
                    </form>
                  ) : (
                    !task.parent_task_id && (
                      <button
                        type="button"
                        onClick={() => onStartAddSubtask(task.id)}
                        className="micro-sm tap-press ml-8 flex items-center gap-1.5 border-l-2 border-hairline px-3 py-1.5 text-muted-foreground/70 hover:text-foreground"
                      >
                        <CornerDownRight className="size-3" />
                        Subtask
                      </button>
                    )
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </Panel>
  );
}

function TaskRow({
  task,
  subtle,
  onToggleComplete,
  onDelete,
  onToggleNudge,
  onOpenDetail,
}: {
  task: Task;
  subtle?: boolean;
  onToggleComplete: () => void;
  onDelete: () => void;
  onToggleNudge?: () => void;
  onOpenDetail?: () => void;
}) {
  const meta: string[] = [];
  if (task.due_at) {
    meta.push(
      formatInAppTimezone(task.due_at, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    );
  }
  if (task.category !== "personal") meta.push(TASK_CATEGORY_LABELS[task.category]);
  // How far ahead the nudge is set, so a row reads "6pm - 1h before" rather
  // than lighting a bell and leaving you to guess what it means.
  const nudgeLabel = shortNudge(task.notify_offset_minutes);
  if (nudgeLabel) meta.push(nudgeLabel);

  return (
    <div className={cn("flex items-center gap-2 px-3", subtle ? "py-1.5" : "py-2.5")}>
      <button
        type="button"
        onClick={onToggleComplete}
        className="group/check tap-press flex size-5 shrink-0 items-center justify-center border-2 border-rule transition-colors hover:bg-foreground hover:text-background"
        aria-label={`Complete ${task.title}`}
      >
        {/* A ghost tick that fills in on hover, so the square reads as
            something you check rather than a decorative box. */}
        <Check
          className="size-3 opacity-0 transition-opacity group-hover/check:opacity-100"
          strokeWidth={3}
        />
      </button>

      <button
        type="button"
        onClick={onOpenDetail}
        disabled={!onOpenDetail}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <span className={cn("block truncate", subtle ? "text-[0.8125rem]" : "text-sm")}>
          {task.title}
        </span>
        {meta.length > 0 && (
          <span className="micro-sm mt-0.5 flex items-center gap-1 truncate text-muted-foreground">
            {task.rrule && <Repeat className="size-3 shrink-0" />}
            {meta.join(" · ")}
          </span>
        )}
      </button>

      {!subtle && task.due_at && onToggleNudge && (
        <button
          type="button"
          onClick={onToggleNudge}
          className={cn(
            "tap-press shrink-0 transition-colors",
            task.notify_offset_minutes !== null
              ? "text-primary"
              : "text-muted-foreground/60 hover:text-foreground"
          )}
          aria-label={
            task.notify_offset_minutes !== null
              ? `Turn off the reminder for ${task.title}`
              : `Remind me about ${task.title}`
          }
        >
          {task.notify_offset_minutes !== null ? (
            <BellRing className="size-4" />
          ) : (
            <Bell className="size-4" />
          )}
        </button>
      )}

      <button
        type="button"
        onClick={onDelete}
        className="tap-press tap-target shrink-0 text-muted-foreground/50 transition-colors hover:text-destructive"
        aria-label={`Delete ${task.title}`}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
