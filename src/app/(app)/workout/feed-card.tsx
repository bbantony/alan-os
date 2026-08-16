"use client";

import { useState } from "react";
import { ChevronDown, Trash2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { formatDuration, formatPace, formatRelativeTime } from "@/lib/workout/format";
import { formatWeight } from "@/lib/workout/units";
import { WORKOUT_TYPE_LABELS, type FeedWorkout, type WeightUnit } from "@/lib/workout/types";
import { deleteWorkout } from "./actions";
import { Reactions } from "./reactions";

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
  const hasPr = prs.length > 0;
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
      {/* A PR gets a solid banner across the top of the card rather than a
          tinted background and a small line of text. It's the loudest thing
          that happens in this module — it should look like it. */}
      {hasPr && (
        <div className="flex items-center gap-2 border-b-2 border-rule bg-accent px-3 py-2 text-accent-foreground">
          <Trophy className="size-4 shrink-0" strokeWidth={2.5} />
          <span className="micro-sm min-w-0 truncate">
            New PR{prs.length > 1 ? "s" : ""} — {prs.map((p) => p.exercise_name).join(", ")}
          </span>
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
            className="tap-press shrink-0 text-muted-foreground/50 transition-colors hover:text-destructive disabled:opacity-50"
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
