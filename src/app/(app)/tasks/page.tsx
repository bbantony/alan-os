import { getTasks, getTaskIdsWithReminders, getWeeklyDoneCount, getTodayCompletionCountsByHorizon } from "./actions";
import { getRoutines, getRoutineSuggestions } from "@/app/(app)/routines/actions";
import { RoutineSection } from "@/app/(app)/routines/routine-section";
import { TaskList } from "./task-list";

export default async function TasksPage() {
  const [tasks, weeklyDoneCount, reminderTaskIds, routines, routineSuggestions, doneTodayByHorizon] = await Promise.all([
    getTasks(),
    getWeeklyDoneCount(),
    getTaskIdsWithReminders(),
    getRoutines(),
    getRoutineSuggestions(),
    getTodayCompletionCountsByHorizon(),
  ]);

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-4">
      <RoutineSection initialRoutines={routines} suggestions={routineSuggestions} />
      <TaskList
        initialTasks={tasks}
        weeklyDoneCount={weeklyDoneCount}
        initialReminderTaskIds={reminderTaskIds}
        initialDoneTodayByHorizon={doneTodayByHorizon}
      />
    </div>
  );
}
