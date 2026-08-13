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
    <div className="space-y-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Repeat</label>
        <Select value={preset} onChange={(e) => onPresetChange(e.target.value as RecurrencePreset)}>
          {presets.map((p) => (
            <option key={p} value={p}>
              {RECURRENCE_PRESET_LABELS[p]}
            </option>
          ))}
        </Select>
      </div>

      {preset === "weekly" && (
        <div className="flex flex-wrap gap-1.5">
          {RECURRENCE_WEEKDAY_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => onWeekdayChange(i)}
              className={cn(
                "tap-press rounded-full border px-2.5 py-1 text-xs",
                weekday === i ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {preset === "every_n_days" && (
        <div className="flex items-center gap-2 text-sm">
          Every
          <Input
            type="number"
            inputMode="numeric"
            value={intervalDays}
            onChange={(e) => onIntervalDaysChange(e.target.value)}
            className="w-16"
          />
          days
        </div>
      )}
      {preset === "monthly" && (
        <div className="flex items-center gap-2 text-sm">
          On day
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={monthDay}
            onChange={(e) => onMonthDayChange(e.target.value)}
            className="w-16"
          />
          of the month
        </div>
      )}
    </div>
  );
}
