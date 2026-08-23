"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";

import { Panel, PanelHead } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Micro } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import type { OutlookSuggestion } from "@/lib/ai/outlook";
import { dismissOutlook, runOutlookSuggestion } from "./outlook-actions";

/**
 * The read on today, at the top of the dashboard.
 *
 * Everything below this on Today is a fact — what's due, what's about to land,
 * what the numbers are. This is the only band that joins them up, which is why
 * it sits first and why it's `raised`: it earns the emphasis by saying the one
 * thing no other panel can.
 *
 * The suggestions underneath are stored intentions, not actions. Nothing has
 * happened to any data until a thumb lands on one — the same boundary the
 * weekly insight on the Timeline uses, and the reason the model is never handed
 * the ability to write anything itself.
 */
export function OutlookPanel({
  briefing,
  suggestions,
}: {
  briefing: string | null;
  suggestions: OutlookSuggestion[];
}) {
  // Optimistic done-state, layered ON TOP of the server's own `actedAt`. The
  // server never reorders or shortens the list, so an index means the same
  // suggestion before and after a revalidate — this only covers the gap between
  // the action returning and the fresh props landing.
  const [done, setDone] = useState<number[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // The panel is only rendered when there's something to say, but a briefing
  // can be null while suggestions exist, and vice versa.
  if (dismissed || (!briefing && suggestions.length === 0)) return null;

  // Everything already taken and nothing to read: the panel has said all it has
  // to say for today and should get out of the way.
  if (!briefing && suggestions.every((s) => s.actedAt)) return null;

  async function act(index: number) {
    setBusy(index);
    const result = await runOutlookSuggestion({ index });
    setBusy(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setDone((d) => [...d, index]);
  }

  async function handleDismiss() {
    setDismissed(true);
    await dismissOutlook();
  }

  return (
    <Panel tone="raised">
      <PanelHead
        title="Today's outlook"
        action={
          <button
            type="button"
            onClick={handleDismiss}
            className="micro-sm tap-press text-muted-foreground transition-colors hover:text-foreground"
          >
            Dismiss
          </button>
        }
      />

      <div className="flex flex-col gap-3 px-3 py-3">
        {briefing && (
          <div className="flex gap-3">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.5} />
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{briefing}</p>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="flex flex-col gap-2">
            {suggestions.map((s, i) =>
              s.actedAt || done.includes(i) ? (
                <Micro key={i} className="flex items-center gap-1.5 py-1.5">
                  <Check className="size-3.5 text-ok" strokeWidth={3} />
                  Done
                </Micro>
              ) : (
                <Button
                  key={i}
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => act(i)}
                >
                  {busy === i ? "Working…" : s.label}
                </Button>
              )
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
