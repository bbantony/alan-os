import { cn } from "@/lib/utils";
import { Panel, PanelHead, PanelEmpty } from "@/components/ui/panel";
import { StreakBadge } from "@/components/streak-badge";
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
      <Panel>
        <PanelEmpty>No one&apos;s logged a workout yet.</PanelEmpty>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHead title="The board" count={entries.length} />
      <ol>
        {entries.map((entry, i) => {
          const isMe = entry.profile.id === currentUserId;
          return (
            <li
              key={entry.profile.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                i > 0 && "border-t border-hairline",
                // Your own row is an inverted block rather than a faint tint —
                // finding yourself on a leaderboard should be instant.
                isMe && "bg-foreground text-background"
              )}
            >
              <span
                className={cn(
                  "micro-sm w-4 shrink-0 tabular",
                  isMe ? "text-background/60" : "text-muted-foreground"
                )}
              >
                {i + 1}
              </span>
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                  isMe ? "border-background" : "border-rule"
                )}
              >
                {initials(entry.profile.display_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {entry.profile.display_name ?? "Someone"}
                </p>
                <p
                  className={cn(
                    "micro-sm mt-0.5 tabular",
                    isMe ? "text-background/60" : "text-muted-foreground"
                  )}
                >
                  {entry.workoutsThisWeek} this week · longest {entry.longestStreak}d
                </p>
              </div>
              <StreakBadge
                current={entry.currentStreak}
                className={cn(isMe && "border-background text-background")}
              />
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
