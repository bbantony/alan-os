import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry } from "./actions";

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function Leaderboard({
  entries,
  currentUserId,
}: {
  entries: LeaderboardEntry[];
  currentUserId: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No one&apos;s logged a workout yet.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {entries.map((entry) => (
        <li
          key={entry.profile.id}
          className={cn(
            "flex items-center gap-3 rounded-xl border p-3",
            entry.profile.id === currentUserId ? "border-primary/40 bg-primary/5" : "border-border bg-surface"
          )}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials(entry.profile.display_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{entry.profile.display_name ?? "Someone"}</p>
            <p className="text-xs text-muted-foreground">
              {entry.workoutsThisWeek} this week · longest {entry.longestStreak}d
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 tabular text-sm font-semibold text-accent">
            <Flame className="size-4" />
            {entry.currentStreak}
          </div>
        </li>
      ))}
    </ul>
  );
}
