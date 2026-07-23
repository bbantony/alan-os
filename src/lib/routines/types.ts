import type { TaskCategory } from "@/lib/tasks/types";

export interface RoutineStep {
  id: string;
  routine_id: string;
  title: string;
  sort_order: number;
}

export interface Routine {
  id: string;
  user_id: string;
  title: string;
  icon: string;
  category: TaskCategory;
  rrule: string;
  time_of_day: string | null;
  active: boolean;
  created_at: string;
}

export interface RoutineCompletion {
  id: string;
  routine_id: string;
  user_id: string;
  completed_date: string;
  steps_done: string[];
  completed_at: string;
}

// A routine bundled with its steps and enough completion history to render a
// streak and today's checked-off state without a second round trip per card.
export interface RoutineWithProgress extends Routine {
  steps: RoutineStep[];
  streak: { current: number; longest: number };
  completedToday: RoutineCompletion | null;
}
