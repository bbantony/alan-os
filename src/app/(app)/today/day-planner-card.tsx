"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Circle, MoonStar, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TopGoal } from "@/lib/reminders/types";
import type { Task } from "@/lib/tasks/types";
import { planTomorrow } from "@/app/(app)/calendar/actions";

export function DayPlannerCard({
  isEvening,
  focus,
  yesterdayReflection,
  openTasks,
}: {
  isEvening: boolean;
  focus: { source: "planned" | "auto"; goals: TopGoal[] };
  yesterdayReflection: string | null;
  openTasks: Task[];
}) {
  const [saved, setSaved] = useState(false);

  if (!isEvening) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 sm:col-span-2">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span className="font-heading text-sm font-semibold">Today&apos;s focus</span>
          {focus.source === "auto" && focus.goals.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Auto-picked
            </span>
          )}
        </div>
        {focus.goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing picked — plan tomorrow tonight after 8pm.</p>
        ) : (
          <ul className="space-y-1.5">
            {focus.goals.map((g, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Circle className="size-3.5 shrink-0 text-muted-foreground/50" />
                {g.title}
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
    );
  }

  return <EveningRitual openTasks={openTasks} onSaved={() => setSaved(true)} saved={saved} />;
}

function EveningRitual({
  openTasks,
  onSaved,
  saved,
}: {
  openTasks: Task[];
  onSaved: () => void;
  saved: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<TopGoal[]>([]);
  const [freeText, setFreeText] = useState("");
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);

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
    onSaved();
  }

  if (saved) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm sm:col-span-2">
        <div className="flex items-center gap-2 text-primary">
          <CheckCircle2 className="size-4" />
          Tomorrow&apos;s plan is set.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:col-span-2">
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
              <button
                onClick={() => setSelected((prev) => prev.filter((_, idx) => idx !== i))}
                className="tap-press text-primary/60 hover:text-primary"
              >
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
                  <button
                    onClick={() => toggleTask(t)}
                    className="tap-press w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                  >
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

      <Button
        type="button"
        className={cn("w-full", saving && "opacity-70")}
        onClick={handleSave}
        disabled={saving || (selected.length === 0 && !reflection.trim())}
      >
        {saving ? "Saving…" : "Save plan"}
      </Button>
    </div>
  );
}
