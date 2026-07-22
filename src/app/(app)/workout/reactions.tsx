"use client";

import { useState } from "react";
import { SmilePlus, X } from "lucide-react";
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
  const [picking, setPicking] = useState(false);

  async function handleTap(emoji: string) {
    const mine = local.find((r) => r.emoji === emoji && r.user_id === currentUserId);
    if (mine) {
      setLocal((prev) => prev.filter((r) => r.id !== mine.id));
    } else {
      setLocal((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          workout_id: workoutId,
          user_id: currentUserId,
          emoji,
          created_at: new Date().toISOString(),
        },
      ]);
    }
    setPicking(false);
    await toggleReaction({ workoutId, emoji });
  }

  const present = REACTION_EMOJIS.map((emoji) => ({
    emoji,
    count: local.filter((r) => r.emoji === emoji).length,
    mine: local.some((r) => r.emoji === emoji && r.user_id === currentUserId),
  })).filter((r) => r.count > 0);

  if (!picking && present.length === 0) {
    return (
      <button
        onClick={() => setPicking(true)}
        className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground"
        aria-label="React"
      >
        <SmilePlus className="size-3.5" />
        React
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {present.map(({ emoji, count, mine }) => (
        <button
          key={emoji}
          onClick={() => handleTap(emoji)}
          className={cn(
            "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
            mine ? "border-accent/50 bg-accent/10" : "border-border hover:bg-muted"
          )}
        >
          <span>{emoji}</span>
          <span className="tabular text-muted-foreground">{count}</span>
        </button>
      ))}

      {picking ? (
        <>
          {REACTION_EMOJIS.filter((e) => !present.some((p) => p.emoji === e)).map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleTap(emoji)}
              className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
            >
              {emoji}
            </button>
          ))}
          <button
            onClick={() => setPicking(false)}
            className="text-muted-foreground/50 hover:text-muted-foreground"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </>
      ) : (
        <button
          onClick={() => setPicking(true)}
          className="text-muted-foreground/50 hover:text-muted-foreground"
          aria-label="Add reaction"
        >
          <SmilePlus className="size-3.5" />
        </button>
      )}
    </div>
  );
}
