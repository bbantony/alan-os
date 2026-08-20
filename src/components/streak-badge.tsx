import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

// The Flame+number pairing Workout already used inline in two places
// (the crew feed, leaderboard.tsx) — pulled out so Routines can be a
// second real consumer instead of a third copy-paste.
//
// A live streak is now a filled block rather than a tinted icon: it's one of
// the few genuinely motivating numbers in the app, and it was previously
// indistinguishable at a glance from a dead one.
export function StreakBadge({
  current,
  size = "sm",
  className,
}: {
  current: number;
  size?: "sm" | "lg";
  className?: string;
}) {
  const alive = current > 0;

  if (size === "lg") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-2 border-2 px-2.5 py-1",
          alive ? "border-rule bg-primary text-primary-foreground" : "border-hairline text-muted-foreground",
          className
        )}
      >
        <Flame className="size-5" strokeWidth={2.5} />
        <span className="stat text-xl">{current}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5",
        alive ? "border-primary text-primary" : "border-hairline text-muted-foreground",
        className
      )}
    >
      <Flame className="size-3" strokeWidth={2.5} />
      <span className="micro-sm tabular">{current}</span>
    </span>
  );
}
