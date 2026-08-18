"use client";

import { Bell, BellOff } from "lucide-react";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DEFAULT_NUDGE_MINUTES, describeNudge, NUDGE_OPTIONS } from "@/lib/tasks/nudge";

/**
 * "When should I tell you?" — the replacement for the old remind-me switch.
 *
 * The switch could only mean "notify me at the exact moment this becomes
 * late", which is the wrong moment for anything you need lead time on. This
 * asks how far ahead instead.
 *
 * It's a switch plus a dropdown rather than one long list, because the first
 * decision ("do I want telling at all?") is the common one and shouldn't cost
 * a scroll through eight options.
 */
export function NudgePicker({
  value,
  onChange,
  disabled,
  disabledHint,
  className,
}: {
  /** Minutes before due, or null for no notification. */
  value: number | null;
  onChange: (next: number | null) => void;
  /** True when there's no due date yet, so there's nothing to offset from. */
  disabled?: boolean;
  disabledHint?: string;
  className?: string;
}) {
  const on = value !== null;

  return (
    <div className={cn("border-2 border-rule bg-surface", className)}>
      <button
        type="button"
        onClick={() => onChange(on ? null : DEFAULT_NUDGE_MINUTES)}
        disabled={disabled}
        aria-pressed={on}
        className={cn(
          "flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors",
          disabled ? "cursor-not-allowed opacity-50" : "tap-press hover:bg-muted",
          on && !disabled && "bg-foreground text-background hover:bg-foreground"
        )}
      >
        <span className="flex items-center gap-2">
          {on ? <Bell className="size-4 shrink-0" /> : <BellOff className="size-4 shrink-0" />}
          <span>
            <span className="micro block">Remind me</span>
            <span
              className={cn(
                "mt-0.5 block text-xs",
                on ? "text-background/70" : "text-muted-foreground"
              )}
            >
              {disabled ? (disabledHint ?? "Set a due date first") : describeNudge(value)}
            </span>
          </span>
        </span>

        <span
          className={cn(
            "flex h-6 w-11 shrink-0 items-center border-2 p-0.5",
            on ? "border-background bg-background" : "border-rule bg-muted"
          )}
        >
          <span
            className={cn(
              "block size-4 transition-transform duration-100 ease-out",
              on ? "translate-x-[18px] bg-foreground" : "translate-x-0 bg-rule"
            )}
          />
        </span>
      </button>

      {on && !disabled && (
        <div className="border-t-2 border-rule p-2">
          <Select
            value={String(value)}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label="How long before"
          >
            {NUDGE_OPTIONS.filter((o) => o.minutes !== null).map((o) => (
              <option key={o.minutes} value={String(o.minutes)}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}
