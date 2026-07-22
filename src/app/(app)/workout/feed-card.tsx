"use client";

import { useState } from "react";
import { ChevronDown, Trash2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
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

const TYPE_BADGE_STYLES: Record<string, string> = {
  resistance: "bg-primary/10 text-primary",
  running: "bg-accent/15 text-accent",
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
    <div
      className={cn(
        "rounded-xl border bg-surface p-4",
        hasPr ? "border-accent/50 bg-accent/5" : "border-border"
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {initials(author?.display_name ?? null)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{author?.display_name ?? "Someone"}</p>
          <p className="text-xs text-muted-foreground">{formatRelativeTime(workout.created_at)}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            TYPE_BADGE_STYLES[workout.type]
          )}
        >
          {WORKOUT_TYPE_LABELS[workout.type]}
        </span>
        {isMine && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="tap-press shrink-0 rounded-full p-1 text-muted-foreground/40 hover:text-destructive disabled:opacity-50"
            aria-label="Delete workout"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      {hasPr && (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-accent">
          <Trophy className="size-3.5" />
          New PR{prs.length > 1 ? "s" : ""}: {prs.map((p) => p.exercise_name).join(", ")}
        </div>
      )}

      {run ? (
        <p className="text-sm">
          {run.distance_km} km · {formatDuration(run.duration_seconds)}
          {" · "}
          {formatPace(run.distance_km, run.duration_seconds)}
          {run.avg_hr ? ` · ${run.avg_hr} bpm` : ""}
        </p>
      ) : (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="tap-press flex w-full items-center justify-between text-left text-sm"
        >
          <span>
            {exerciseIds.length} exercise{exerciseIds.length === 1 ? "" : "s"} · {totalSets} set
            {totalSets === 1 ? "" : "s"}
          </span>
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </button>
      )}

      {expanded && !run && (
        <ul className="mt-2 space-y-1 text-sm">
          {exerciseIds.map((id) => {
            const exerciseSets = sets.filter((s) => s.exercise_id === id);
            return (
              <li key={id}>
                <span className="font-medium">{exerciseSets[0].exercise_name}:</span>{" "}
                <span className="text-muted-foreground">
                  {exerciseSets.map((s) => `${formatWeight(s.weight_kg, weightUnit)}×${s.reps}`).join(", ")}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {workout.notes && (expanded || run) && (
        <p className="mt-1 text-sm text-muted-foreground">{workout.notes}</p>
      )}

      <div className="mt-3 border-t border-border pt-2.5">
        <Reactions workoutId={workout.id} reactions={reactions} currentUserId={currentUserId} />
      </div>
    </div>
  );
}
