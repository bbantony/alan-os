"use client";

import { useState } from "react";
import { ChevronDown, Trash2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { formatDuration, formatPace, formatRelativeTime } from "@/lib/workout/format";
import { formatWeight } from "@/lib/workout/units";
import { headlinePrsByExercise, PR_KIND_LABELS } from "@/lib/workout/pr";
import {
  WORKOUT_TYPE_LABELS,
  type FeedWorkout,
  type Pr,
  type WeightUnit,
} from "@/lib/workout/types";
import { deleteWorkout } from "./actions";
import { Reactions } from "./reactions";

/**
 * A record's value in the units the reader uses.
 *
 * Weight and estimated 1RM are a weight, so they format as one. Volume is
 * weight × reps summed over a session — a much bigger number that isn't
 * really "a weight" — so it's rounded and given its own unit suffix rather
 * than being dressed up as one.
 */
function formatPrValue(pr: Pick<Pr, "kind" | "value">, unit: WeightUnit): string {
  if (pr.kind === "volume") {
    const converted = unit === "lbs" ? pr.value * 2.2046226218 : pr.value;
    return `${Math.round(converted).toLocaleString()} ${unit}`;
  }
  return formatWeight(pr.value, unit);
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const TYPE_TONES: Record<string, "primary" | "accent"> = {
  resistance: "primary",
  running: "accent",
};

export function FeedCard({
  feedItem,
  currentUserId,
  weightUnit,
  onDeleted,
}: {
  feedItem: FeedWorkout;
  currentUserId: string;
  weightUnit: WeightUnit;
  onDeleted: () => void;
}) {
  const { workout, author, sets, run, prs, reactions } = feedItem;
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // One headline per exercise rather than one row per record kind.
  const headlines = headlinePrsByExercise(prs);
  const hasPr = headlines.length > 0;
  const isMine = workout.user_id === currentUserId;

  const exerciseIds = [...new Set(sets.map((s) => s.exercise_id))];
  const totalSets = sets.length;

  async function handleDelete() {
    if (deleting) return;
    if (!window.confirm("Delete this workout? This can't be undone.")) return;
    setDeleting(true);
    await deleteWorkout({ id: workout.id });
    onDeleted();
  }

  return (
    <Panel className={cn(hasPr && "border-accent")}>
      {/* Records, stated as facts.
          This replaces a solid banner reading "New PR — Bench Press", which
          announced loudly that *something* had happened without saying what:
          no number, no lift, no sense of whether it mattered. It also fired
          three times per exercise (heaviest / strongest set / biggest
          session) and fired on the very first time you ever logged a
          movement, so within a fortnight every session had a PR banner and
          the word stopped meaning anything.
          Now: one headline per exercise, the most impressive kind wins, and
          the actual figure is on screen. `headlinePrsByExercise` does the
          picking; `reportablePrs` in the logging path stops opening baselines
          being called records at all. */}
      {headlines.length > 0 && (
        <div className="border-b-2 border-rule">
          {headlines.map((pr, i) => (
            <div
              key={pr.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2",
                i > 0 && "border-t border-hairline",
                // The first record is the shout; any others are supporting
                // detail, so only one block per card is inverted.
                i === 0 ? "bg-accent text-accent-foreground" : "bg-muted/50"
              )}
            >
              <Trophy
                className={cn("size-4 shrink-0", i > 0 && "text-accent")}
                strokeWidth={2.5}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {pr.exercise_name}
              </span>
              <span
                className={cn(
                  "micro-sm shrink-0",
                  i === 0 ? "text-accent-foreground/75" : "text-muted-foreground"
                )}
              >
                {PR_KIND_LABELS[pr.kind]}
              </span>
              <span className="stat shrink-0 text-base">{formatPrValue(pr, weightUnit)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 border-b border-hairline px-3 py-2.5">
        {/* Avatars stay circular — a person is one of the few things in this
            app that genuinely reads as round. */}
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-rule text-xs font-bold">
          {initials(author?.display_name ?? null)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{author?.display_name ?? "Someone"}</p>
          <p className="micro-sm text-muted-foreground">
            {formatRelativeTime(workout.created_at)}
          </p>
        </div>
        <Tag tone={TYPE_TONES[workout.type] ?? "default"}>
          {WORKOUT_TYPE_LABELS[workout.type]}
        </Tag>
        {isMine && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="tap-press tap-target shrink-0 text-muted-foreground/50 transition-colors hover:text-destructive disabled:opacity-50"
            aria-label="Delete workout"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {run ? (
        <div className="grid grid-cols-3 gap-px bg-hairline">
          <div className="bg-surface p-3">
            <p className="micro-sm text-muted-foreground">Distance</p>
            <p className="stat mt-1 text-xl">
              {run.distance_km}
              <span className="micro-sm ml-1 text-muted-foreground">km</span>
            </p>
          </div>
          <div className="bg-surface p-3">
            <p className="micro-sm text-muted-foreground">Time</p>
            <p className="stat mt-1 text-xl">{formatDuration(run.duration_seconds)}</p>
          </div>
          <div className="bg-surface p-3">
            <p className="micro-sm text-muted-foreground">Pace</p>
            <p className="stat mt-1 text-xl">
              {formatPace(run.distance_km, run.duration_seconds)}
            </p>
          </div>
          {run.avg_hr && (
            <div className="col-span-3 bg-surface px-3 py-2">
              <span className="micro-sm text-muted-foreground">
                Average heart rate — {run.avg_hr} bpm
              </span>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="tap-press flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
        >
          <span>
            <span className="stat text-lg">{exerciseIds.length}</span>
            <span className="micro-sm ml-1.5 text-muted-foreground">
              exercise{exerciseIds.length === 1 ? "" : "s"}
            </span>
            <span className="stat ml-3 text-lg">{totalSets}</span>
            <span className="micro-sm ml-1.5 text-muted-foreground">
              set{totalSets === 1 ? "" : "s"}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
              expanded && "rotate-180"
            )}
            strokeWidth={2.5}
          />
        </button>
      )}

      {expanded && !run && (
        <ul className="border-t border-hairline">
          {exerciseIds.map((id, i) => {
            const exerciseSets = sets.filter((s) => s.exercise_id === id);
            return (
              <li
                key={id}
                className={cn("px-3 py-2 text-sm", i > 0 && "border-t border-hairline")}
              >
                <span className="micro-sm block text-muted-foreground">
                  {exerciseSets[0].exercise_name}
                </span>
                <span className="mt-0.5 block tabular">
                  {exerciseSets
                    .map((s) => `${formatWeight(s.weight_kg, weightUnit)}×${s.reps}`)
                    .join("  ·  ")}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {workout.notes && (expanded || run) && (
        <p className="border-t border-hairline px-3 py-2 text-sm text-muted-foreground">
          {workout.notes}
        </p>
      )}

      <div className="border-t-2 border-rule px-3 py-2">
        <Reactions workoutId={workout.id} reactions={reactions} currentUserId={currentUserId} />
      </div>
    </Panel>
  );
}
