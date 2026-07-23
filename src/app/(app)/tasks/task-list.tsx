"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellRing, Check, ChevronDown, ChevronRight, Plus, Repeat, Trash2 } from "lucide-react";
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
import { listItemVariants, LIST_ITEM_TRANSITION } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatInAppTimezone } from "@/lib/time";
import { describeRRule } from "@/lib/reminders/rrule";
import { createReminderFromTask } from "@/app/(app)/calendar/actions";
import {
  TASK_HORIZONS,
  TASK_HORIZON_LABELS,
  TASK_CATEGORY_LABELS,
  type Task,
  type TaskHorizon,
} from "@/lib/tasks/types";
import {
  createTask,
  deleteTask,
  getCompletedTasks,
  setTaskCompleted,
} from "./actions";
import { TaskDetailDialog } from "./task-detail-dialog";

export function TaskList({
  initialTasks,
  weeklyDoneCount,
  initialReminderTaskIds,
}: {
  initialTasks: Task[];
  weeklyDoneCount: number;
  initialReminderTaskIds: string[];
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [title, setTitle] = useState("");
  const [horizon, setHorizon] = useState<TaskHorizon>("today");
  const [remindedIds, setRemindedIds] = useState<Set<string>>(new Set(initialReminderTaskIds));
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [confirmTask, setConfirmTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Task[] | null>(null);

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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const id = crypto.randomUUID();
    const optimistic: Task = {
      id,
      user_id: "",
      parent_task_id: null,
      title: trimmed,
      notes: null,
      horizon,
      due_at: null,
      category: "personal",
      completed_at: null,
      sort_order: 0,
      created_at: new Date().toISOString(),
      rrule: null,
    };
    setTasks((prev) => [...prev, optimistic]);
    setTitle("");
    await createTask({ id, title: trimmed, horizon, category: "personal" });
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
      rrule: null,
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
    const result = await setTaskCompleted({ id: task.id, completed: true });
    if (result.nextTask) {
      setTasks((prev) => [...prev, result.nextTask!]);
      toast.success(`"${task.title}" completed — repeats again ${task.rrule ? describeRRule(task.rrule) : ""}`.trim());
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
    await setTaskCompleted({ id: task.id, completed: false });
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Tasks</h1>
        <span className="text-xs font-medium text-muted-foreground">
          {weeklyDoneCount} done this week
        </span>
      </div>

      <form onSubmit={handleAdd} className="my-4 flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          className="flex-1"
        />
        <Select value={horizon} onChange={(e) => setHorizon(e.target.value as TaskHorizon)} className="w-32 shrink-0">
          {TASK_HORIZONS.map((h) => (
            <option key={h} value={h}>
              {TASK_HORIZON_LABELS[h]}
            </option>
          ))}
        </Select>
        <Button type="submit" size="icon" aria-label="Add task">
          <Plus className="size-4" />
        </Button>
      </form>
      <p className="mb-4 -mt-2 text-xs text-muted-foreground">
        Tap a task afterward to set a category, due date, repeat, or reminder.
      </p>

      {tasks.length === 0 && (
        <EmptyState
          title="Nothing on your plate"
          description="Add a task above to get started."
          icon={<TasksIllustration className="size-8" />}
        />
      )}

      <div className="space-y-6">
        {TASK_HORIZONS.map((h) => {
          const inHorizon = topLevel.filter((t) => t.horizon === h);
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
              onRemindMe={handleRemindMe}
              onOpenDetail={setEditingTask}
              remindedIds={remindedIds}
            />
          );
        })}
      </div>

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

      {editingTask && (
        <TaskDetailDialog
          task={editingTask}
          hasReminder={remindedIds.has(editingTask.id)}
          onClose={() => setEditingTask(null)}
          onSaved={(updated) => {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
            setRemindedIds((prev) => {
              const next = new Set(prev);
              if (updated.due_at) next.add(updated.id);
              else next.delete(updated.id);
              return next;
            });
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
  tasks,
  subtasksOf,
  addingSubtaskFor,
  subtaskTitle,
  onSubtaskTitleChange,
  onStartAddSubtask,
  onAddSubtask,
  onToggleComplete,
  onDelete,
  onRemindMe,
  onOpenDetail,
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
  onRemindMe: (task: Task) => void;
  onOpenDetail: (task: Task) => void;
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
            <motion.li
              key={task.id}
              layout
              variants={listItemVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={LIST_ITEM_TRANSITION}
            >
              <TaskRow
                task={task}
                onToggleComplete={() => onToggleComplete(task)}
                onDelete={() => onDelete(task)}
                onRemindMe={() => onRemindMe(task)}
                onOpenDetail={() => onOpenDetail(task)}
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
              {addingSubtaskFor === task.id ? (
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
              ) : (
                !task.parent_task_id && (
                  <button
                    onClick={() => onStartAddSubtask(task.id)}
                    className="tap-press ml-7 mt-1 text-xs text-muted-foreground/60 hover:text-foreground"
                  >
                    + subtask
                  </button>
                )
              )}
            </motion.li>
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
  onRemindMe,
  onOpenDetail,
  reminded,
}: {
  task: Task;
  subtle?: boolean;
  onToggleComplete: () => void;
  onDelete: () => void;
  onRemindMe?: () => void;
  onOpenDetail?: () => void;
  reminded?: boolean;
}) {
  const subtitleParts: string[] = [];
  if (task.due_at) {
    subtitleParts.push(formatInAppTimezone(task.due_at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
  }
  if (task.category !== "personal") {
    subtitleParts.push(TASK_CATEGORY_LABELS[task.category]);
  }

  return (
    <div
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
      <button
        onClick={onOpenDetail}
        disabled={!onOpenDetail}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <p className="truncate text-sm">{task.title}</p>
        {subtitleParts.length > 0 && (
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            {task.rrule && <Repeat className="size-3 shrink-0" />}
            {subtitleParts.join(" · ")}
          </p>
        )}
      </button>
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
      <button
        onClick={onDelete}
        className="tap-press shrink-0 text-muted-foreground/40 hover:text-destructive"
        aria-label="Delete task"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
