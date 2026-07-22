import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatWeight } from "@/lib/workout/units";
import { WORKOUT_TYPE_LABELS, type FeedWorkout, type WeightUnit } from "@/lib/workout/types";
import { Reactions } from "./reactions";

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatPace(distanceKm: number, durationSeconds: number): string {
  if (distanceKm <= 0) return "";
  const secPerKm = durationSeconds / distanceKm;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${sec.toString().padStart(2, "0")}/km`;
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function topSetLabel(
  sets: FeedWorkout["sets"],
  exerciseId: string,
  unit: WeightUnit
): string {
  const exerciseSets = sets.filter((s) => s.exercise_id === exerciseId);
  const top = exerciseSets.reduce((best, s) =>
    s.weight_kg > best.weight_kg || (s.weight_kg === best.weight_kg && s.reps > best.reps) ? s : best
  );
  return `${top.exercise_name} ${formatWeight(top.weight_kg, unit)}×${top.reps}`;
}

const TYPE_BADGE_STYLES: Record<string, string> = {
  push: "bg-primary/10 text-primary",
  pull: "bg-primary/10 text-primary",
  legs: "bg-primary/10 text-primary",
  run: "bg-accent/15 text-accent",
  other: "bg-muted text-muted-foreground",
};

export function FeedCard({
  feedItem,
  currentUserId,
  weightUnit,
}: {
  feedItem: FeedWorkout;
  currentUserId: string;
  weightUnit: WeightUnit;
}) {
  const { workout, author, sets, run, prs, reactions } = feedItem;
  const hasPr = prs.length > 0;

  const exerciseIds = [...new Set(sets.map((s) => s.exercise_id))];
  const summaryParts = exerciseIds.slice(0, 3).map((id) => topSetLabel(sets, id, weightUnit));
  const extra = exerciseIds.length > 3 ? ` +${exerciseIds.length - 3} more` : "";

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
        <p className="text-sm">
          {summaryParts.join(", ")}
          {extra}
        </p>
      )}

      {workout.notes && <p className="mt-1 text-sm text-muted-foreground">{workout.notes}</p>}

      <div className="mt-3 border-t border-border pt-2.5">
        <Reactions workoutId={workout.id} reactions={reactions} currentUserId={currentUserId} />
      </div>
    </div>
  );
}
