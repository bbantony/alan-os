export type TaskHorizon = "now" | "today" | "this_week" | "this_month" | "someday";
export type TaskCategory = "personal" | "work" | "errand" | "pr_application" | "french" | "other";

export const TASK_HORIZONS: TaskHorizon[] = ["now", "today", "this_week", "this_month", "someday"];

export const TASK_HORIZON_LABELS: Record<TaskHorizon, string> = {
  now: "Now",
  today: "Today",
  this_week: "This Week",
  this_month: "This Month",
  someday: "Someday",
};

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  personal: "Personal",
  work: "Work",
  errand: "Errand",
  pr_application: "PR Application",
  french: "French",
  other: "Other",
};

export interface Task {
  id: string;
  user_id: string;
  parent_task_id: string | null;
  title: string;
  notes: string | null;
  horizon: TaskHorizon;
  due_at: string | null;
  category: TaskCategory;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
  // Reuses the exact rrule text format reminders already use
  // (src/lib/reminders/rrule.ts) — same RecurrencePreset vocabulary, same
  // DST-aware next-occurrence math, just stored on a different table.
  rrule: string | null;
  gcal_event_id: string | null;
  // Minutes before `due_at` to send a notification. null = never.
  // Replaces the old "has a reminder / doesn't" boolean, which could only ever
  // notify you at the exact moment something became late. See lib/tasks/nudge.ts.
  notify_offset_minutes: number | null;
}
