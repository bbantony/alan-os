export type ReminderStatus = "active" | "paused" | "done";

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

export interface Reminder {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  remind_at: string;
  rrule: string | null;
  status: ReminderStatus;
  last_fired_at: string | null;
  mirror_to_gcal: boolean;
  gcal_event_id: string | null;
  linked_task_id: string | null;
  created_at: string;
}

// A goal can be tied to an existing task (taskId set) or a free-typed entry
// (taskId null) — either way it's just a title string shown on the ritual.
export interface TopGoal {
  taskId: string | null;
  title: string;
}

export interface DayPlan {
  id: string;
  user_id: string;
  plan_date: string;
  top_goals: TopGoal[];
  ai_briefing: string | null;
  evening_reflection: string | null;
  created_at: string;
}
