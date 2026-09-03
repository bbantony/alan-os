"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { fadeInUpVariants } from "@/lib/motion";
import { Button } from "@/components/ui/button";
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
 * said mattered; after 8pm it becomes the form for picking tomorrow's three.
 * Keeping it as one panel in one screen position — rather than a card that
 * appears and disappears — is what makes it a ritual rather than a surprise.
 */
export function FocusPanel({
  isEvening,
  focus,
  yesterdayReflection,
  openTasks,
}: {
  isEvening: boolean;
  focus: { source: "planned" | "auto"; goals: TodayFocusGoal[] };
  yesterdayReflection: string | null;
  openTasks: Task[];
}) {
  if (isEvening) {
    return (
      <motion.div variants={fadeInUpVariants}>
        <EveningRitual openTasks={openTasks} />
      </motion.div>
    );
  }

  const doneCount = focus.goals.filter((g) => g.done).length;

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
            Nothing picked yet. The evening ritual opens after 8pm — that&apos;s
            where tomorrow&apos;s three get chosen.
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

        {yesterdayReflection && (
          <p className="border-t-2 border-rule bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground italic">
            Yesterday: &ldquo;{yesterdayReflection}&rdquo;
          </p>
        )}
      </Panel>
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
    <Panel>
      <PanelHead title="Plan tomorrow" count={`${selected.length}/3`} />

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
  );
}
