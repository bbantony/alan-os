import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

// The Flame+number pairing Workout already used inline in two places
// (workout-feed.tsx, leaderboard.tsx) — pulled out so Routines can be a
// second real consumer instead of a third copy-paste.
export function StreakBadge({ current, size = "sm", className }: { current: number; size?: "sm" | "lg"; className?: string }) {
  return (
    <span className={cn("flex items-center gap-1", className)}>
      <Flame className={cn(size === "lg" ? "size-5" : "size-3.5", current > 0 ? "text-accent" : "text-muted-foreground/40")} />
      <span className={cn("tabular font-semibold", size === "lg" ? "text-xl" : "text-sm")}>{current}</span>
    </span>
  );
}
