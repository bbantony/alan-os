"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Comment, CrewProfile } from "@/lib/workout/types";
import { addComment } from "./actions";

export function Comments({
  workoutId,
  comments,
}: {
  workoutId: string;
  comments: (Comment & { author: CrewProfile | null })[];
}) {
  const [local, setLocal] = useState(comments);
  const [expanded, setExpanded] = useState(comments.length > 0 && comments.length <= 2);
  const [body, setBody] = useState("");

  async function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setBody("");
    setExpanded(true);
    setLocal((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        workout_id: workoutId,
        user_id: "",
        body: trimmed,
        created_at: new Date().toISOString(),
        author: null,
      },
    ]);
    await addComment({ workoutId, body: trimmed });
  }

  return (
    <div className="mt-2">
      {local.length > 0 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs font-medium text-muted-foreground underline underline-offset-2"
        >
          View {local.length} comment{local.length > 1 ? "s" : ""}
        </button>
      )}
      {expanded && (
        <ul className="mb-2 space-y-1">
          {local.map((c) => (
            <li key={c.id} className="text-xs">
              <span className="font-medium">{c.author?.display_name ?? "You"}</span>{" "}
              <span className="text-muted-foreground">{c.body}</span>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex gap-1.5"
      >
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          className="h-7 flex-1 text-xs"
        />
        <Button type="submit" size="icon-sm" variant="ghost" aria-label="Send comment">
          <Send className="size-3.5" />
        </Button>
      </form>
    </div>
  );
}
