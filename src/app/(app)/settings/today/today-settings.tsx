"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";

import { SettingsGroup } from "@/components/settings/setting-controls";
import { Micro } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  TODAY_PANEL_IDS,
  TODAY_PANEL_LABELS,
  type Preferences,
  type TodayPanelId,
} from "@/lib/preferences";
import { updatePreferences } from "../preferences-actions";

/**
 * Which panels Today shows, and in what order.
 *
 * Up/down buttons rather than drag-and-drop. Dragging is nicer on a desktop and
 * genuinely awkward on a phone — where this screen will actually be used — and
 * it needs a dependency plus a keyboard story to be accessible at all. Five
 * items do not need a drag library.
 */
export function TodaySettings({ initial }: { initial: Preferences }) {
  const [order, setOrder] = useState<TodayPanelId[]>(initial.todayPanels);
  const [saving, setSaving] = useState(false);

  // Hidden panels are the ones missing from the saved order, listed after the
  // visible ones so the whole set is always on screen.
  const hidden = TODAY_PANEL_IDS.filter((id) => !order.includes(id));

  async function save(next: TodayPanelId[]) {
    const previous = order;
    setOrder(next);
    setSaving(true);
    // `todayPanelsKnown` is written alongside the order every time, because
    // this screen is the moment Alan is shown every panel that exists — after
    // this, "missing from the list" genuinely means "hidden on purpose", and a
    // later new panel can still be told apart from one he chose to drop.
    const result = await updatePreferences({
      todayPanels: next,
      todayPanelsKnown: [...TODAY_PANEL_IDS],
    });
    setSaving(false);
    if (result.error) {
      setOrder(previous);
      toast.error("Couldn't save that.");
    }
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...order];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    save(next);
  }

  function toggle(id: TodayPanelId) {
    if (order.includes(id)) save(order.filter((p) => p !== id));
    // Re-shown panels go back to the bottom rather than guessing where they
    // used to be — you can move them from there.
    else save([...order, id]);
  }

  return (
    <SettingsGroup
      title="What's on Today"
      description="Drop anything you don't look at, and put what matters first."
    >
      {order.map((id, i) => (
        <div
          key={id}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5",
            i < order.length - 1 || hidden.length > 0 ? "border-b border-hairline" : ""
          )}
        >
          <span className="micro-sm w-4 shrink-0 tabular text-muted-foreground">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {TODAY_PANEL_LABELS[id]}
          </span>

          <div className="flex shrink-0 items-stretch border-2 border-rule">
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={saving || i === 0}
              aria-label={`Move ${TODAY_PANEL_LABELS[id]} up`}
              className="tap-press tap-reach flex size-7 items-center justify-center transition-colors hover:bg-muted disabled:opacity-25"
            >
              <ArrowUp className="size-3.5" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={saving || i === order.length - 1}
              aria-label={`Move ${TODAY_PANEL_LABELS[id]} down`}
              className="tap-press tap-reach flex size-7 items-center justify-center border-l border-hairline transition-colors hover:bg-muted disabled:opacity-25"
            >
              <ArrowDown className="size-3.5" strokeWidth={2.5} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => toggle(id)}
            disabled={saving}
            aria-label={`Hide ${TODAY_PANEL_LABELS[id]}`}
            className="tap-press tap-target shrink-0 text-muted-foreground transition-colors hover:text-destructive"
          >
            <Eye className="size-4" />
          </button>
        </div>
      ))}

      {order.length === 0 && (
        <p className="hatch px-3 py-6 text-center">
          <Micro>Everything is hidden. Today will be an empty screen.</Micro>
        </p>
      )}

      {hidden.length > 0 && (
        <>
          <p className="border-b border-hairline bg-muted/40 px-3 py-1.5">
            <Micro>Hidden</Micro>
          </p>
          {hidden.map((id, i) => (
            <div
              key={id}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                i < hidden.length - 1 && "border-b border-hairline"
              )}
            >
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {TODAY_PANEL_LABELS[id]}
              </span>
              <button
                type="button"
                onClick={() => toggle(id)}
                disabled={saving}
                aria-label={`Show ${TODAY_PANEL_LABELS[id]}`}
                className="tap-press tap-target shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <EyeOff className="size-4" />
              </button>
            </div>
          ))}
        </>
      )}
    </SettingsGroup>
  );
}
