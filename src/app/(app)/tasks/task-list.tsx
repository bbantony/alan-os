"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellRing, Check, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
import { cn } from "@/lib/utils";
import { formatInAppTimezone, isOutsideWorkHours } from "@/lib/time";
import { createReminderFromTask } from "@/app/(app)/calendar/actions";
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
  moveTaskHorizon,
  setTaskCompleted,
} from "./actions";

const QUICK_CHIPS = ["Follow up with ", "Call "];
const NON_PERSONAL_LABELS: TaskCategory[] = ["errand", "pr_application", "french", "other"];

export function TaskList({
  initialTasks,
  weeklyDoneCount,
}: {
  initialTasks: Task[];
  weeklyDoneCount: number;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [title, setTitle] = useState("");
  const [horizon, setHorizon] = useState<TaskHorizon>("today");
  const [category, setCategory] = useState<TaskCategory>("personal");
  const [dueAt, setDueAt] = useState("");
  const [remindedIds, setRemindedIds] = useState<Set<string>>(new Set());
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [confirmTask, setConfirmTask] = useState<Task | null>(null);
  const [workExpanded, setWorkExpanded] = useState(() => !isOutsideWorkHours());
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Task[] | null>(null);

  const nonWorkTop = tasks.filter((t) => !t.parent_task_id && t.category !== "work");
  const workTop = tasks.filter((t) => !t.parent_task_id && t.category === "work");
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const id = crypto.randomUUID();
    const dueAtIso = dueAt ? new Date(dueAt).toISOString() : null;
    const optimistic: Task = {
      id,
      user_id: "",
      parent_task_id: null,
      title: trimmed,
      notes: null,
      horizon,
      due_at: dueAtIso,
      category,
      completed_at: null,
      sort_order: 0,
      created_at: new Date().toISOString(),
    };
    setTasks((prev) => [...prev, optimistic]);
    setTitle("");
    setCategory("personal");
    setDueAt("");
    await createTask({ id, title: trimmed, horizon, category, dueAt: dueAtIso });
  }

  async function handleRemindMe(task: Task) {
    setRemindedIds((prev) => new Set(prev).add(task.id));
    await createReminderFromTask({ taskId: task.id });
    toast.success("Reminder set");
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
    await setTaskCompleted({ id: task.id, completed: true });
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

  async function handleMoveHorizon(task: Task, next: TaskHorizon) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, horizon: next } : t)));
    await moveTaskHorizon({ id: task.id, horizon: next });
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
    await setTaskCompleted({ id: task.id, completed: false });
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-4">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Tasks</h1>
        <span className="text-xs font-medium text-muted-foreground">
          {weeklyDoneCount} done this week
        </span>
      </div>

      <form onSubmit={handleAdd} className="my-4 space-y-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
        />
        <div className="flex flex-wrap gap-2">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => {
                setTitle(chip);
                setCategory("work");
              }}
              className="tap-press rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
            >
              {chip}___
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Select value={horizon} onChange={(e) => setHorizon(e.target.value as TaskHorizon)} className="h-8 flex-1">
            {TASK_HORIZONS.map((h) => (
              <option key={h} value={h}>
                {TASK_HORIZON_LABELS[h]}
              </option>
            ))}
          </Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)} className="h-8 flex-1">
            {Object.entries(TASK_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Button type="submit" size="icon" aria-label="Add task">
            <Plus className="size-4" />
          </Button>
        </div>
        <Input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="text-xs"
          aria-label="Due date (optional)"
        />
      </form>

      {tasks.length === 0 && (
        <EmptyState
          title="Nothing on your plate"
          description="Add a task above to get started."
          icon={<TasksIllustration className="size-8" />}
        />
      )}

      <div className="space-y-6">
        {TASK_HORIZONS.map((h) => {
          const inHorizon = nonWorkTop.filter((t) => t.horizon === h);
          if (inHorizon.length === 0) return null;
          return (
            <TaskSection
              key={h}
              label={TASK_HORIZON_LABELS[h]}
              tasks={inHorizon}
              subtasksOf={subtasksOf}
              addingSubtaskFor={addingSubtaskFor}
              subtaskTitle={subtaskTitle}
              onSubtaskTitleChange={setSubtaskTitle}
              onStartAddSubtask={setAddingSubtaskFor}
              onAddSubtask={handleAddSubtask}
              onToggleComplete={handleToggleComplete}
              onDelete={handleDelete}
              onMoveHorizon={handleMoveHorizon}
              onRemindMe={handleRemindMe}
              remindedIds={remindedIds}
            />
          );
        })}
      </div>

      {workTop.length > 0 && (
        <div className="mt-8 rounded-xl border border-border bg-surface">
          <button
            onClick={() => setWorkExpanded((v) => !v)}
            className="tap-press flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
          >
            <span>Work ({workTop.length})</span>
            {workExpanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
          {workExpanded && (
            <div className="space-y-4 border-t border-border p-4">
              {TASK_HORIZONS.map((h) => {
                const inHorizon = workTop.filter((t) => t.horizon === h);
                if (inHorizon.length === 0) return null;
                return (
                  <TaskSection
                    key={h}
                    label={TASK_HORIZON_LABELS[h]}
                    tasks={inHorizon}
                    subtasksOf={subtasksOf}
                    addingSubtaskFor={addingSubtaskFor}
                    subtaskTitle={subtaskTitle}
                    onSubtaskTitleChange={setSubtaskTitle}
                    onStartAddSubtask={setAddingSubtaskFor}
                    onAddSubtask={handleAddSubtask}
                    onToggleComplete={handleToggleComplete}
                    onDelete={handleDelete}
                    onMoveHorizon={handleMoveHorizon}
                    onRemindMe={handleRemindMe}
                    remindedIds={remindedIds}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="mt-8">
        <button
          onClick={handleToggleCompletedArchive}
          className="tap-press flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {showCompleted ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          Completed
        </button>
        {showCompleted && (
          <ul className="mt-2 space-y-1">
            {(completedTasks ?? []).map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
              >
                <button
                  onClick={() => handleUndoComplete(task)}
                  className="tap-press flex size-5 shrink-0 items-center justify-center rounded-md border border-primary bg-primary text-primary-foreground"
                  aria-label="Mark incomplete"
                >
                  <Check className="size-3.5" />
                </button>
                <span className="flex-1 text-sm text-muted-foreground line-through">
                  {task.title}
                </span>
              </li>
            ))}
            {completedTasks?.length === 0 && (
              <li className="text-sm text-muted-foreground">Nothing completed yet.</li>
            )}
          </ul>
        )}
      </div>

      <Dialog open={!!confirmTask} onOpenChange={(open) => !open && setConfirmTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete this task?</DialogTitle>
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
    </div>
  );
}

function TaskSection({
  label,
  tasks,
  subtasksOf,
  addingSubtaskFor,
  subtaskTitle,
  onSubtaskTitleChange,
  onStartAddSubtask,
  onAddSubtask,
  onToggleComplete,
  onDelete,
  onMoveHorizon,
  onRemindMe,
  remindedIds,
}: {
  label: string;
  tasks: Task[];
  subtasksOf: Map<string, Task[]>;
  addingSubtaskFor: string | null;
  subtaskTitle: string;
  onSubtaskTitleChange: (v: string) => void;
  onStartAddSubtask: (id: string | null) => void;
  onAddSubtask: (parent: Task) => void;
  onToggleComplete: (task: Task) => void;
  onDelete: (task: Task) => void;
  onMoveHorizon: (task: Task, horizon: TaskHorizon) => void;
  onRemindMe: (task: Task) => void;
  remindedIds: Set<string>;
}) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h2>
      <ul className="space-y-1">
        <AnimatePresence initial={false}>
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskRow
                task={task}
                onToggleComplete={() => onToggleComplete(task)}
                onDelete={() => onDelete(task)}
                onMoveHorizon={(h) => onMoveHorizon(task, h)}
                onStartAddSubtask={() => onStartAddSubtask(task.id)}
                onRemindMe={() => onRemindMe(task)}
                reminded={remindedIds.has(task.id)}
              />
              {(subtasksOf.get(task.id) ?? []).length > 0 && (
                <ul className="ml-7 mt-1 space-y-1">
                  {(subtasksOf.get(task.id) ?? []).map((sub) => (
                    <TaskRow
                      key={sub.id}
                      task={sub}
                      subtle
                      onToggleComplete={() => onToggleComplete(sub)}
                      onDelete={() => onDelete(sub)}
                    />
                  ))}
                </ul>
              )}
              {addingSubtaskFor === task.id && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onAddSubtask(task);
                  }}
                  className="ml-7 mt-1 flex gap-2"
                >
                  <Input
                    autoFocus
                    value={subtaskTitle}
                    onChange={(e) => onSubtaskTitleChange(e.target.value)}
                    placeholder="Subtask…"
                    className="h-7 text-xs"
                  />
                  <Button type="submit" size="icon-sm">
                    <Plus className="size-3.5" />
                  </Button>
                </form>
              )}
            </li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function TaskRow({
  task,
  subtle,
  onToggleComplete,
  onDelete,
  onMoveHorizon,
  onStartAddSubtask,
  onRemindMe,
  reminded,
}: {
  task: Task;
  subtle?: boolean;
  onToggleComplete: () => void;
  onDelete: () => void;
  onMoveHorizon?: (h: TaskHorizon) => void;
  onStartAddSubtask?: () => void;
  onRemindMe?: () => void;
  reminded?: boolean;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2",
        subtle && "border-transparent bg-transparent py-1"
      )}
    >
      <button
        onClick={onToggleComplete}
        className="tap-press flex size-5 shrink-0 items-center justify-center rounded-md border border-border transition-colors hover:border-primary hover:bg-primary/10"
        aria-label="Complete task"
      />
      <span className="flex-1 text-sm">{task.title}</span>
      {!subtle && task.due_at && (
        <span className="text-xs text-muted-foreground">
          {formatInAppTimezone(task.due_at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </span>
      )}
      {!subtle && task.due_at && onRemindMe && (
        <button
          onClick={onRemindMe}
          disabled={reminded}
          className="tap-press shrink-0 text-muted-foreground/50 hover:text-foreground disabled:text-accent"
          aria-label={reminded ? "Reminder set" : "Remind me"}
          title={reminded ? "Reminder set" : "Remind me at the due time"}
        >
          {reminded ? <BellRing className="size-4" /> : <Bell className="size-4" />}
        </button>
      )}
      {!subtle && NON_PERSONAL_LABELS.includes(task.category) && (
        <span className="text-xs text-muted-foreground">
          {TASK_CATEGORY_LABELS[task.category]}
        </span>
      )}
      {!subtle && onMoveHorizon && (
        <select
          value={task.horizon}
          onChange={(e) => onMoveHorizon(e.target.value as TaskHorizon)}
          className="h-6 rounded-md border border-input bg-transparent px-1 text-xs"
          aria-label="Move to section"
        >
          {TASK_HORIZONS.map((h) => (
            <option key={h} value={h}>
              {TASK_HORIZON_LABELS[h]}
            </option>
          ))}
        </select>
      )}
      {!subtle && !task.parent_task_id && onStartAddSubtask && (
        <button
          onClick={onStartAddSubtask}
          className="tap-press shrink-0 text-muted-foreground/50 hover:text-foreground"
          aria-label="Add subtask"
          title="Add subtask"
        >
          <Plus className="size-4" />
        </button>
      )}
      <button
        onClick={onDelete}
        className="tap-press shrink-0 text-muted-foreground/40 hover:text-destructive"
        aria-label="Delete task"
      >
        <Trash2 className="size-4" />
      </button>
    </motion.div>
  );
}
