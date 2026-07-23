"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { listItemVariants, LIST_ITEM_TRANSITION } from "@/lib/motion";
import { StreakBadge } from "@/components/streak-badge";
import { getRoutineIcon } from "@/lib/routines/icon-registry";
import type { RoutineWithProgress } from "@/lib/routines/types";
import type { RoutineSuggestion } from "./actions";
import { archiveRoutine, completeRoutineToday, getRoutines, uncompleteRoutineToday } from "./actions";
import { RoutineCreateDialog } from "./routine-create-dialog";

export function RoutineSection({
  initialRoutines,
  suggestions,
}: {
  initialRoutines: RoutineWithProgress[];
  suggestions: RoutineSuggestion[];
}) {
  const [routines, setRoutines] = useState(initialRoutines);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [prefillTitle, setPrefillTitle] = useState<string | undefined>(undefined);
  const [checklistFor, setChecklistFor] = useState<RoutineWithProgress | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<RoutineWithProgress | null>(null);

  async function handleComplete(routine: RoutineWithProgress) {
    if (routine.completedToday) {
      setRoutines((prev) =>
        prev.map((r) => (r.id === routine.id ? { ...r, completedToday: null, streak: { ...r.streak, current: Math.max(0, r.streak.current - 1) } } : r))
      );
      await uncompleteRoutineToday({ routineId: routine.id });
      return;
    }
    const stepIds = routine.steps.map((s) => s.id);
    setRoutines((prev) =>
      prev.map((r) =>
        r.id === routine.id
          ? { ...r, completedToday: { id: "", routine_id: r.id, user_id: "", completed_date: "", steps_done: stepIds, completed_at: "" }, streak: { ...r.streak, current: r.streak.current + 1 } }
          : r
      )
    );
    const { streak } = await completeRoutineToday({ routineId: routine.id, stepsDone: stepIds });
    setRoutines((prev) => prev.map((r) => (r.id === routine.id ? { ...r, streak } : r)));
    toast.success(`"${routine.title}" done — ${streak.current} day streak`);
  }

  async function handleArchive(routine: RoutineWithProgress) {
    setRoutines((prev) => prev.filter((r) => r.id !== routine.id));
    setConfirmArchive(null);
    await archiveRoutine({ id: routine.id });
    toast.success("Routine archived");
  }

  function handleSuggestionAccept(title: string) {
    setPrefillTitle(title);
    setCreating(true);
  }

  const visibleSuggestions = suggestions.filter((s) => !dismissedSuggestions.has(s.title));

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Routines</h2>
        <button
          onClick={() => {
            setPrefillTitle(undefined);
            setCreating(true);
          }}
          className="tap-press flex items-center gap-1 text-xs font-medium text-primary"
        >
          <Plus className="size-3.5" />
          Add routine
        </button>
      </div>

      {visibleSuggestions.map((s) => (
        <div key={s.title} className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-dashed border-accent/50 bg-accent/10 px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 shrink-0 text-accent" />
            You&apos;ve added &ldquo;{s.title}&rdquo; {s.count} times this month — make it a routine?
          </span>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => handleSuggestionAccept(s.title)} className="tap-press font-medium text-primary">
              Yes
            </button>
            <button
              onClick={() => setDismissedSuggestions((prev) => new Set(prev).add(s.title))}
              className="tap-press text-muted-foreground"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}

      {routines.length === 0 ? (
        <p className="text-sm text-muted-foreground">No routines yet — add one for something you want to do on a schedule.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <AnimatePresence initial={false}>
            {routines.map((routine) => {
              const Icon = getRoutineIcon(routine.icon);
              const done = !!routine.completedToday;
              const isChecklist = routine.steps.length > 1;
              return (
                <motion.div
                  key={routine.id}
                  layout
                  variants={listItemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={LIST_ITEM_TRANSITION}
                  className={cn(
                    "group relative rounded-xl border p-3 text-left",
                    done ? "border-primary/40 bg-primary/5" : "border-border bg-surface"
                  )}
                >
                  <button
                    onClick={() => (isChecklist ? setChecklistFor(routine) : handleComplete(routine))}
                    className="tap-press flex w-full flex-col items-start gap-2"
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className={cn("flex size-8 items-center justify-center rounded-lg", done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                        {done ? <Check className="size-4" /> : <Icon className="size-4" />}
                      </div>
                      <StreakBadge current={routine.streak.current} />
                    </div>
                    <p className={cn("truncate text-sm font-medium", done && "text-muted-foreground line-through")}>{routine.title}</p>
                    {isChecklist && (
                      <p className="text-xs text-muted-foreground">
                        {(routine.completedToday?.steps_done.length ?? 0)}/{routine.steps.length} steps
                      </p>
                    )}
                  </button>
                  <button
                    onClick={() => setConfirmArchive(routine)}
                    className="tap-press absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-destructive"
                    aria-label="Archive routine"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <RoutineCreateDialog
        open={creating}
        initialTitle={prefillTitle}
        onClose={() => setCreating(false)}
        onCreated={async () => {
          setCreating(false);
          const fresh = await getRoutines();
          setRoutines(fresh);
        }}
      />

      {checklistFor && (
        <ChecklistDialog
          routine={checklistFor}
          onClose={() => setChecklistFor(null)}
          onSaved={(updated) => {
            setRoutines((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setChecklistFor(null);
          }}
        />
      )}

      <Dialog open={!!confirmArchive} onOpenChange={(open) => !open && setConfirmArchive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this routine?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            &ldquo;{confirmArchive?.title}&rdquo; and its streak history will be hidden — this can&apos;t be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmArchive(null)}>
              Cancel
            </Button>
            <Button className="text-destructive" variant="outline" onClick={() => confirmArchive && handleArchive(confirmArchive)}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChecklistDialog({
  routine,
  onClose,
  onSaved,
}: {
  routine: RoutineWithProgress;
  onClose: () => void;
  onSaved: (routine: RoutineWithProgress) => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set(routine.completedToday?.steps_done ?? []));
  const [saving, setSaving] = useState(false);

  function toggleStep(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    const stepsDone = [...checked];
    const { streak } = await completeRoutineToday({ routineId: routine.id, stepsDone });
    setSaving(false);
    onSaved({
      ...routine,
      streak,
      completedToday: stepsDone.length > 0 ? { id: "", routine_id: routine.id, user_id: "", completed_date: "", steps_done: stepsDone, completed_at: "" } : null,
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{routine.title}</DialogTitle>
        </DialogHeader>
        <ul className="space-y-1.5">
          {routine.steps.map((step) => (
            <li key={step.id}>
              <button
                onClick={() => toggleStep(step.id)}
                className="tap-press flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm"
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-md border",
                    checked.has(step.id) ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  )}
                >
                  {checked.has(step.id) && <Check className="size-3.5" />}
                </span>
                {step.title}
              </button>
            </li>
          ))}
        </ul>
        <Button className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
