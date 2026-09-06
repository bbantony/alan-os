"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { fadeInUpVariants } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { planTomorrow } from "@/app/(app)/calendar/actions";
import type { TodayFocusGoal } from "@/app/(app)/calendar/actions";
import type { Task } from "@/lib/tasks/types";

/**
 * The day-planner ritual, split out of the old monolithic timeline card.
 *
 * Two faces of the same panel: during the day it shows the three things you
 * said mattered; in the evening it becomes the form for picking tomorrow's
 * three. Keeping it as one panel in one screen position — rather than a card
 * that appears and disappears — is what makes it a ritual rather than a
 * surprise.
 *
 * The evening hour opens the ritual automatically; it does not lock it. Being
 * told to come back later by a screen that could simply have shown the form is
 * the app getting in the way of someone who is ready now, so "Plan tomorrow
 * now" opens the same form early. Nothing about what gets saved changes — the
 * hour was only ever about when to *offer* it.
 */
export function FocusPanel({
  isEvening,
  eveningRitualHour,
  focus,
  yesterdayReflection,
  openTasks,
}: {
  isEvening: boolean;
  /** From Settings → Plan. Only used for the copy: 20 reads as "8pm". */
  eveningRitualHour: number;
  focus: { source: "planned" | "auto"; goals: TodayFocusGoal[] };
  yesterdayReflection: string | null;
  openTasks: Task[];
}) {
  const [openedEarly, setOpenedEarly] = useState(false);

  if (isEvening || openedEarly) {
    return (
      <motion.div variants={fadeInUpVariants}>
        <EveningRitual
          openTasks={openTasks}
          // Only escapable when it was opened by hand. During the evening this
          // IS the panel, and a dismiss would leave a blank space.
          onDismiss={isEvening ? undefined : () => setOpenedEarly(false)}
        />
      </motion.div>
    );
  }

  const doneCount = focus.goals.filter((g) => g.done).length;
  const hourLabel = formatHour(eveningRitualHour);

  return (
    <motion.div variants={fadeInUpVariants}>
      <Panel>
        <PanelHead
          title="Today's focus"
          count={
            focus.goals.length > 0 ? `${doneCount}/${focus.goals.length}` : undefined
          }
          action={
            focus.source === "auto" && focus.goals.length > 0 ? (
              <Tag>Auto-picked</Tag>
            ) : null
          }
        />

        {focus.goals.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            Nothing picked yet. Tomorrow&apos;s three get chosen in the evening
            ritual, which opens on its own at {hourLabel}.
          </p>
        ) : (
          <ol>
            {focus.goals.map((g, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5",
                  i < focus.goals.length - 1 && "border-b border-hairline"
                )}
              >
                <span className="micro-sm w-4 shrink-0 text-muted-foreground tabular">
                  {i + 1}
                </span>
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center border-2 border-rule",
                    g.done && "bg-foreground text-background"
                  )}
                >
                  {g.done && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 text-sm",
                    g.done && "text-muted-foreground line-through"
                  )}
                >
                  {g.title}
                </span>
              </li>
            ))}
          </ol>
        )}

        {/* The way in before the hour comes round. Quiet — it is an offer,
            not the thing the panel is for — but always there, including on
            the days three goals are already picked and you want to redo
            tomorrow early. */}
        <button
          type="button"
          onClick={() => setOpenedEarly(true)}
          className="tap-press flex w-full items-center justify-between gap-3 border-t-2 border-rule px-3 py-2.5 text-left transition-colors hover:bg-muted"
        >
          <span className="text-sm font-semibold">Plan tomorrow now</span>
          <span className="micro-sm flex shrink-0 items-center gap-1 text-muted-foreground">
            Opens at {hourLabel}
            <ArrowRight className="size-3" strokeWidth={2.5} />
          </span>
        </button>

        {yesterdayReflection && (
          <p className="border-t-2 border-rule bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground italic">
            Yesterday: &ldquo;{yesterdayReflection}&rdquo;
          </p>
        )}
      </Panel>
    </motion.div>
  );
}

/** 20 -> "8pm", 12 -> "12pm", 0 -> "12am". Preferences clamps this to 12-23,
 *  so in practice it is always an evening hour, but the maths is general. */
function formatHour(hour: number): string {
  const h = ((Math.round(hour) % 24) + 24) % 24;
  const suffix = h >= 12 ? "pm" : "am";
  return `${h % 12 === 0 ? 12 : h % 12}${suffix}`;
}

function EveningRitual({
  openTasks,
  onDismiss,
}: {
  openTasks: Task[];
  onDismiss?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ taskId: string | null; title: string }[]>([]);
  const [freeText, setFreeText] = useState("");
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // WHY "NOT NOW" ASKS FIRST.
  //
  // Backing out of the early-opened ritual unmounts this component, and every
  // goal picked and every word typed goes with it — no warning, no way back.
  // Losing something a person has written is the one failure this whole panel
  // exists to prevent, so it cannot be the price of tapping the wrong thing.
  //
  // Asked rather than kept mounted and hidden: a hidden copy of the form would
  // still be in the page for a screen reader and the tab order (two "Search"
  // boxes, two "Save plan" buttons), and it would quietly resurrect a draft
  // from hours ago with no sign of where it came from. A question is honest
  // about what is happening and costs one tap only when there is something to
  // lose — with an empty form, "Not now" still closes instantly.
  //
  // `query` deliberately does not count: it filters the task list, it is not
  // something written down.
  const draftBits: string[] = [];
  if (selected.length > 0) {
    draftBits.push(`${selected.length} goal${selected.length > 1 ? "s" : ""} for tomorrow`);
  }
  if (freeText.trim()) draftBits.push("the goal you were typing");
  if (reflection.trim()) draftBits.push("your line about today");

  function requestDismiss() {
    if (!onDismiss) return;
    if (draftBits.length === 0) {
      onDismiss();
      return;
    }
    setConfirmDiscard(true);
  }

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
    try {
      const result = await planTomorrow({ goals: selected, reflection: reflection.trim() || null });
      if (result.error) {
        // The form stays as-is — nothing was saved, so nothing gets cleared,
        // and the "Plan set" panel only ever shows a confirmed save.
        toast.error(result.error);
        return;
      }
      setSaved(true);
    } catch {
      toast.error("Couldn't save the plan — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <Panel tone="invert">
        <div className="flex items-center gap-3 p-5">
          <span className="flex size-8 shrink-0 items-center justify-center border-2 border-background">
            <Check className="size-4" strokeWidth={3} />
          </span>
          <div>
            <p className="display-sm">Plan set</p>
            <p className="micro-sm mt-1 text-background/60">Tomorrow is decided.</p>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <>
      <Panel>
        <PanelHead
          title="Plan tomorrow"
          count={`${selected.length}/3`}
          action={
            onDismiss ? (
              <button
                type="button"
                onClick={requestDismiss}
                className="micro-sm text-muted-foreground hover:text-foreground"
              >
                Not now
              </button>
            ) : null
          }
        />

        <div className="flex flex-col gap-3 p-3">
          {selected.length > 0 && (
            <ol className="border-2 border-rule">
              {selected.map((g, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex items-center gap-2 bg-muted/50 px-3 py-2 text-sm",
                    i < selected.length - 1 && "border-b border-hairline"
                  )}
                >
                  <span className="micro-sm w-4 shrink-0 text-muted-foreground tabular">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{g.title}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${g.title}`}
                    onClick={() => setSelected((prev) => prev.filter((_, idx) => idx !== i))}
                    className="tap-press shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-4" strokeWidth={2.5} />
                  </button>
                </li>
              ))}
            </ol>
          )}

          {selected.length < 3 && (
            <>
              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">
                  Pick from your open tasks
                </label>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                />
              </div>

              {filtered.length > 0 && (
                <ul className="border-2 border-rule">
                  {filtered.map((t, i) => (
                    <li key={t.id} className={cn(i > 0 && "border-t border-hairline")}>
                      <button
                        type="button"
                        onClick={() => toggleTask(t)}
                        className="tap-press w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                      >
                        {t.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">
                  Or write a new one
                </label>
                <div className="flex gap-2">
                  <Input
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addFreeText()}
                    placeholder="A goal for tomorrow…"
                  />
                  <Button type="button" variant="outline" onClick={addFreeText}>
                    Add
                  </Button>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="micro-sm mb-1.5 block text-muted-foreground">
              One line on today (optional)
            </label>
            <Input
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="How&rsquo;d today go?"
            />
          </div>

          <Button
            type="button"
            block
            onClick={handleSave}
            disabled={saving || (selected.length === 0 && !reflection.trim())}
          >
            {saving ? "Saving…" : "Save plan"}
          </Button>
        </div>
      </Panel>

      <ConfirmDialog
        open={confirmDiscard}
        title="Close without saving?"
        description="Nothing here has been saved yet."
        detail={`You'll lose ${listSentence(draftBits)}.`}
        confirmLabel="Close anyway"
        cancelLabel="Keep planning"
        onConfirm={() => {
          setConfirmDiscard(false);
          onDismiss?.();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}

/** "a, b and c" — plain English, not a comma-spliced list. */
function listSentence(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
