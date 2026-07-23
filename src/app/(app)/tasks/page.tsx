import { getTasks, getTaskIdsWithReminders, getWeeklyDoneCount } from "./actions";
import { getRoutines, getRoutineSuggestions } from "@/app/(app)/routines/actions";
import { RoutineSection } from "@/app/(app)/routines/routine-section";
import { TaskList } from "./task-list";

export default async function TasksPage() {
  const [tasks, weeklyDoneCount, reminderTaskIds, routines, routineSuggestions] = await Promise.all([
    getTasks(),
    getWeeklyDoneCount(),
    getTaskIdsWithReminders(),
    getRoutines(),
    getRoutineSuggestions(),
  ]);

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-4">
      <RoutineSection initialRoutines={routines} suggestions={routineSuggestions} />
      <TaskList initialTasks={tasks} weeklyDoneCount={weeklyDoneCount} initialReminderTaskIds={reminderTaskIds} />
    </div>
  );
}
