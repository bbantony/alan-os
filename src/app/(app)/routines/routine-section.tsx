"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Panel, PanelHead, PanelEmpty } from "@/components/ui/panel";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { listItemVariants, LIST_ITEM_TRANSITION } from "@/lib/motion";
import { StreakBadge } from "@/components/streak-badge";
import { getRoutineIcon } from "@/lib/routines/icon-registry";
import type { RoutineWithProgress } from "@/lib/routines/types";
import type { RoutineSuggestion } from "./actions";
import { completeRoutineToday, getRoutines, uncompleteRoutineToday } from "./actions";
import { RoutineFormDialog } from "./routine-create-dialog";

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
  const [editingRoutine, setEditingRoutine] = useState<RoutineWithProgress | null>(null);
  // Collapsed by default — a compact strip so Tasks (the thing that felt
  // messy) gets top billing on page load; tap to expand into the full grid.
  const [expanded, setExpanded] = useState(false);

  async function handleComplete(routine: RoutineWithProgress) {
    if (routine.completedToday) {
      setRoutines((prev) =>
        prev.map((r) =>
          r.id === routine.id
            ? {
                ...r,
                completedToday: null,
                streak: { ...r.streak, current: Math.max(0, r.streak.current - 1) },
              }
            : r
        )
      );
      const undone = await uncompleteRoutineToday({ routineId: routine.id });
      if (undone.error) {
        setRoutines((prev) =>
          prev.map((r) =>
            r.id === routine.id
              ? { ...r, completedToday: routine.completedToday, streak: routine.streak }
              : r
          )
        );
        toast.error(undone.error);
        return;
      }
      // The optimistic "minus one" above is a guess, and it is wrong whenever
      // the streak spans a forgiven miss. Settle on the server's number.
      setRoutines((prev) =>
        prev.map((r) => (r.id === routine.id ? { ...r, streak: undone.streak } : r))
      );
      return;
    }
    const stepIds = routine.steps.map((s) => s.id);
    setRoutines((prev) =>
      prev.map((r) =>
        r.id === routine.id
          ? {
              ...r,
              completedToday: {
                id: "", routine_id: r.id, user_id: "", completed_date: "",
                steps_done: stepIds, completed_at: "",
              },
              streak: { ...r.streak, current: r.streak.current + 1 },
            }
          : r
      )
    );
    const result = await completeRoutineToday({ routineId: routine.id, stepsDone: stepIds });
    // Roll the optimistic tick back. Without this a failed save left the
    // routine looking done — and the streak incremented — until a reload.
    if (result.error) {
      setRoutines((prev) =>
        prev.map((r) =>
          r.id === routine.id
            ? { ...r, completedToday: routine.completedToday, streak: routine.streak }
            : r
        )
      );
      toast.error(result.error);
      return;
    }
    setRoutines((prev) => prev.map((r) => (r.id === routine.id ? { ...r, streak: result.streak } : r)));
    toast.success(`"${routine.title}" done — ${result.streak.current} day streak`);
  }

  function handleSuggestionAccept(title: string) {
    setPrefillTitle(title);
    setCreating(true);
  }

  const visibleSuggestions = suggestions.filter((s) => !dismissedSuggestions.has(s.title));
  const doneCount = routines.filter((r) => r.completedToday).length;

  return (
    <div className="flex flex-col gap-4">
      {/* The plain-SQL "you keep adding this — make it a routine?" nudge.
          Given the accent colour and a hatch ground so it reads as a
          suggestion the app is offering, not a state it's reporting. */}
      {visibleSuggestions.map((s) => (
        <Panel key={s.title} className="border-accent">
          <div className="flex items-start gap-3 p-3">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2.5} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                You&apos;ve added &ldquo;{s.title}&rdquo; {s.count} times this month. Make it a
                routine?
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => handleSuggestionAccept(s.title)}>
                  Yes, set it up
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDismissedSuggestions((prev) => new Set(prev).add(s.title))
                  }
                >
                  No thanks
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      ))}

      <Panel>
        <PanelHead
          title={
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              disabled={routines.length === 0}
              aria-expanded={expanded}
              className="tap-press tap-target flex items-center gap-1.5 disabled:cursor-default"
            >
              {routines.length > 0 &&
                (expanded ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                ))}
              Routines
            </button>
          }
          count={routines.length > 0 ? `${doneCount}/${routines.length}` : undefined}
          action={
            <button
              type="button"
              onClick={() => {
                setPrefillTitle(undefined);
                setCreating(true);
              }}
              aria-label="Add routine"
              className="tap-press tap-reach flex size-7 items-center justify-center border-2 border-rule bg-surface transition-colors hover:bg-foreground hover:text-background"
            >
              <Plus className="size-4" strokeWidth={3} />
            </button>
          }
        />

        {routines.length === 0 ? (
          <PanelEmpty>
            No routines yet — add one for something you want to do on a schedule.
          </PanelEmpty>
        ) : expanded ? (
          <div className="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-3">
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
                      "relative flex flex-col gap-2 p-3",
                      done ? "bg-foreground text-background" : "bg-surface"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center border-2",
                          done
                            ? "border-background bg-background text-foreground"
                            : "border-rule text-muted-foreground"
                        )}
                      >
                        {done ? (
                          <Check className="size-4" strokeWidth={3} />
                        ) : (
                          <Icon className="size-4" />
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingRoutine(routine)}
                        className={cn(
                          "tap-press shrink-0",
                          done
                            ? "text-background/60 hover:text-background"
                            : "text-muted-foreground/60 hover:text-foreground"
                        )}
                        aria-label={`Edit ${routine.title}`}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        isChecklist ? setChecklistFor(routine) : handleComplete(routine)
                      }
                      className="tap-press flex flex-1 flex-col items-start gap-1 text-left"
                    >
                      <span
                        className={cn(
                          "line-clamp-2 text-sm font-semibold",
                          done && "line-through opacity-70"
                        )}
                      >
                        {routine.title}
                      </span>
                      {isChecklist && (
                        <span
                          className={cn(
                            "micro-sm",
                            done ? "text-background/60" : "text-muted-foreground"
                          )}
                        >
                          {routine.completedToday?.steps_done.length ?? 0}/
                          {routine.steps.length} steps
                        </span>
                      )}
                    </button>

                    {!done && <StreakBadge current={routine.streak.current} className="self-start" />}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          // Collapsed strip: horizontally scrollable icon chips. Squared and
          // ruled so it reads as a row of switches on a panel.
          <div className="flex overflow-x-auto">
            {routines.map((routine, i) => {
              const Icon = getRoutineIcon(routine.icon);
              const done = !!routine.completedToday;
              const isChecklist = routine.steps.length > 1;
              return (
                <button
                  key={routine.id}
                  type="button"
                  onClick={() =>
                    isChecklist ? setChecklistFor(routine) : handleComplete(routine)
                  }
                  className={cn(
                    "tap-press flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5 px-2 py-2.5 transition-colors",
                    i > 0 && "border-l border-hairline",
                    done ? "bg-foreground text-background" : "hover:bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center border-2",
                      done
                        ? "border-background bg-background text-foreground"
                        : "border-rule text-muted-foreground"
                    )}
                  >
                    {done ? (
                      <Check className="size-4" strokeWidth={3} />
                    ) : (
                      <Icon className="size-4" />
                    )}
                  </span>
                  <span className="micro-sm w-full truncate text-center text-[0.5625rem]">
                    {routine.title}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      <RoutineFormDialog
        key={creating ? (prefillTitle ?? "blank") : "closed"}
        open={creating}
        initialTitle={prefillTitle}
        onClose={() => setCreating(false)}
        onCreated={async () => {
          setCreating(false);
          const fresh = await getRoutines();
          setRoutines(fresh);
        }}
      />

      <RoutineFormDialog
        key={editingRoutine?.id ?? "none"}
        open={!!editingRoutine}
        existing={editingRoutine}
        onClose={() => setEditingRoutine(null)}
        onUpdated={async () => {
          setEditingRoutine(null);
          const fresh = await getRoutines();
          setRoutines(fresh);
        }}
        onArchived={(id) => {
          setRoutines((prev) => prev.filter((r) => r.id !== id));
          setEditingRoutine(null);
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
  const [checked, setChecked] = useState<Set<string>>(
    new Set(routine.completedToday?.steps_done ?? [])
  );
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

    // Nothing ticked means NOT done. This used to call completeRoutineToday
    // regardless, so the database recorded the routine as complete and
    // extended the streak while the screen showed it as not done — and on the
    // next load it came back complete with 0 of N steps.
    if (stepsDone.length === 0) {
      const result = await uncompleteRoutineToday({ routineId: routine.id });
      setSaving(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onSaved({ ...routine, streak: result.streak, completedToday: null });
      return;
    }

    const result = await completeRoutineToday({ routineId: routine.id, stepsDone });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    onSaved({
      ...routine,
      streak: result.streak,
      completedToday: {
        id: "", routine_id: routine.id, user_id: "", completed_date: "",
        steps_done: stepsDone, completed_at: "",
      },
    });
  }

  const progress = routine.steps.length > 0 ? checked.size / routine.steps.length : 0;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent showCloseButton={false} className="gap-0 p-0">
        <DialogHeader className="mx-0 mt-0 flex-row items-start justify-between gap-3 px-4">
          <div className="min-w-0">
            <DialogTitle className="pr-0">{routine.title}</DialogTitle>
            <p className="micro-sm mt-1 text-muted-foreground">
              {checked.size} of {routine.steps.length} steps
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap-press shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </DialogHeader>

        {/* The step meter — the same "watch it fill" payoff the dashboard uses. */}
        <div className="h-1.5 w-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <ul>
          {routine.steps.map((step, i) => {
            const isChecked = checked.has(step.id);
            return (
              <li key={step.id} className={cn(i > 0 && "border-t border-hairline")}>
                <button
                  type="button"
                  onClick={() => toggleStep(step.id)}
                  className={cn(
                    "tap-press flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted",
                    isChecked && "bg-muted/40"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center border-2 border-rule",
                      isChecked && "bg-foreground text-background"
                    )}
                  >
                    {isChecked && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className={cn(isChecked && "text-muted-foreground line-through")}>
                    {step.title}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="border-t-2 border-rule p-3">
          <Button block onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
