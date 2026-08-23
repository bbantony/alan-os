// What survives of the reminders module's own types.
//
// The `Reminder`, `ReminderStatus` and `DayPlan` interfaces were removed on
// 22 Aug 2026: nothing read them any more. A reminder stopped being a thing of
// its own when the nudge model landed — it is a setting on a task or a routine,
// created and edited by `tasks/actions.ts` and `routines/actions.ts` writing to
// the table directly, and advanced by the `advance_reminder` RPC. `DayPlan` was
// already unused, and `day_plans` rows are read column by column where needed.
//
// The recurrence vocabulary below is the live part, shared by tasks, routines
// and repeating money — it is deliberately ONE vocabulary across all three, so
// do not fork a second copy for a new module.

export type RecurrencePreset =
  | "none"
  | "daily"
  | "weekdays"
  | "weekly"
  | "every_n_days"
  | "monthly"
  | "custom";

export const RECURRENCE_PRESET_LABELS: Record<RecurrencePreset, string> = {
  none: "One-time",
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
  every_n_days: "Every N days",
  monthly: "Monthly",
  custom: "Custom",
};

// A goal can be tied to an existing task (taskId set) or a free-typed entry
// (taskId null) — either way it's just a title string shown on the ritual.
export interface TopGoal {
  taskId: string | null;
  title: string;
}
