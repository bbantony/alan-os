"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { REACTION_EMOJIS, type Reaction } from "@/lib/workout/types";
import { toggleReaction } from "./actions";

export function Reactions({
  workoutId,
  reactions,
  currentUserId,
}: {
  workoutId: string;
  reactions: Reaction[];
  currentUserId: string;
}) {
  const [local, setLocal] = useState(reactions);

  async function handleTap(emoji: string) {
    const mine = local.find((r) => r.emoji === emoji && r.user_id === currentUserId);
    if (mine) {
      setLocal((prev) => prev.filter((r) => r.id !== mine.id));
    } else {
      setLocal((prev) => [
        ...prev,
        { id: crypto.randomUUID(), workout_id: workoutId, user_id: currentUserId, emoji, created_at: new Date().toISOString() },
      ]);
    }
    await toggleReaction({ workoutId, emoji });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {REACTION_EMOJIS.map((emoji) => {
        const count = local.filter((r) => r.emoji === emoji).length;
        const active = local.some((r) => r.emoji === emoji && r.user_id === currentUserId);
        return (
          <button
            key={emoji}
            onClick={() => handleTap(emoji)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
              active ? "border-accent/50 bg-accent/10" : "border-border hover:bg-muted"
            )}
          >
            <span>{emoji}</span>
            {count > 0 && <span className="tabular text-muted-foreground">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
