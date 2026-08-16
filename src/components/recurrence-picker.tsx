"use client";

import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RECURRENCE_PRESET_LABELS, type RecurrencePreset } from "@/lib/reminders/types";

export const RECURRENCE_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// The repeat-preset + weekday-buttons + interval/monthday-inputs block used
// identically by TaskDetailDialog, RoutineFormDialog, and the Tasks quick-add
// "more options" panel — extracted here once all three needed it, rather
// than a third near-copy of the same ~30 lines.
export function RecurrencePicker({
  presets,
  preset,
  onPresetChange,
  weekday,
  onWeekdayChange,
  intervalDays,
  onIntervalDaysChange,
  monthDay,
  onMonthDayChange,
}: {
  presets: RecurrencePreset[];
  preset: RecurrencePreset;
  onPresetChange: (preset: RecurrencePreset) => void;
  weekday: number;
  onWeekdayChange: (weekday: number) => void;
  intervalDays: string;
  onIntervalDaysChange: (value: string) => void;
  monthDay: string;
  onMonthDayChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <label className="micro-sm mb-1.5 block text-muted-foreground">Repeat</label>
        <Select value={preset} onChange={(e) => onPresetChange(e.target.value as RecurrencePreset)}>
          {presets.map((p) => (
            <option key={p} value={p}>
              {RECURRENCE_PRESET_LABELS[p]}
            </option>
          ))}
        </Select>
      </div>

      {preset === "weekly" && (
        // One ruled strip of seven equal cells rather than seven loose pills.
        // A weekday picker is a single control with seven states, and drawing
        // it as one object makes that read at a glance.
        <div className="grid grid-cols-7 border-2 border-rule">
          {RECURRENCE_WEEKDAY_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              aria-pressed={weekday === i}
              onClick={() => onWeekdayChange(i)}
              className={cn(
                "micro-sm tap-press py-2 transition-colors",
                i > 0 && "border-l border-hairline",
                weekday === i
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {label.slice(0, 1)}
            </button>
          ))}
        </div>
      )}
      {preset === "every_n_days" && (
        <div className="flex items-center gap-2 text-sm">
          <span className="micro-sm text-muted-foreground">Every</span>
          <Input
            type="number"
            inputMode="numeric"
            value={intervalDays}
            onChange={(e) => onIntervalDaysChange(e.target.value)}
            className="w-20"
          />
          <span className="micro-sm text-muted-foreground">days</span>
        </div>
      )}
      {preset === "monthly" && (
        <div className="flex items-center gap-2 text-sm">
          <span className="micro-sm text-muted-foreground">On day</span>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={monthDay}
            onChange={(e) => onMonthDayChange(e.target.value)}
            className="w-20"
          />
          <span className="micro-sm text-muted-foreground">of the month</span>
        </div>
      )}
    </div>
  );
}
