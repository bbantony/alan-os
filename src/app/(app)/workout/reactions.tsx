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
        type="button"
        onClick={() => setPicking(true)}
        className="micro-sm tap-press tap-target flex items-center gap-1.5 text-muted-foreground/70 transition-colors hover:text-foreground"
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
          type="button"
          onClick={() => handleTap(emoji)}
          aria-pressed={mine}
          className={cn(
            "tap-press flex items-center gap-1.5 border-2 px-1.5 py-0.5 text-xs transition-colors",
            mine ? "border-accent bg-accent/20" : "border-hairline hover:bg-muted"
          )}
        >
          <span>{emoji}</span>
          <span className="micro-sm tabular text-muted-foreground">{count}</span>
        </button>
      ))}

      {picking ? (
        <>
          {REACTION_EMOJIS.filter((e) => !present.some((p) => p.emoji === e)).map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleTap(emoji)}
              className="tap-press border-2 border-hairline px-1.5 py-0.5 text-xs transition-colors hover:bg-muted"
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="tap-press tap-target text-muted-foreground/60 transition-colors hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="tap-press tap-target text-muted-foreground/60 transition-colors hover:text-foreground"
          aria-label="Add reaction"
        >
          <SmilePlus className="size-4" />
        </button>
      )}
    </div>
  );
}
