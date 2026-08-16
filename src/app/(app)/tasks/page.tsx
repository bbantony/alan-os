import {
  getTasks,
  getTaskIdsWithReminders,
  getWeeklyDoneCount,
  getTodayCompletionCountsByHorizon,
} from "./actions";
import { getRoutines, getRoutineSuggestions } from "@/app/(app)/routines/actions";
import { RoutineSection } from "@/app/(app)/routines/routine-section";
import { PageHeader, HeaderFact } from "@/components/ui/page-header";
import { TaskList } from "./task-list";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const [
    { new: isNew },
    tasks,
    weeklyDoneCount,
    reminderTaskIds,
    routines,
    routineSuggestions,
    doneTodayByHorizon,
  ] = await Promise.all([
    searchParams,
    getTasks(),
    getWeeklyDoneCount(),
    getTaskIdsWithReminders(),
    getRoutines(),
    getRoutineSuggestions(),
    getTodayCompletionCountsByHorizon(),
  ]);

  const openCount = tasks.filter((t) => !t.parent_task_id).length;
  const activeRoutines = routines.filter((r) => r.active).length;

  return (
    <div>
      <PageHeader
        eyebrow="Everything you owe yourself"
        title="Tasks"
        meta={
          <>
            <HeaderFact>{openCount} open</HeaderFact>
            <HeaderFact>{activeRoutines} routines</HeaderFact>
            <HeaderFact>{weeklyDoneCount} done this week</HeaderFact>
          </>
        }
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        <RoutineSection initialRoutines={routines} suggestions={routineSuggestions} />
        <TaskList
          initialTasks={tasks}
          weeklyDoneCount={weeklyDoneCount}
          initialReminderTaskIds={reminderTaskIds}
          initialDoneTodayByHorizon={doneTodayByHorizon}
          autoFocusNew={isNew === "1"}
        />
      </div>
    </div>
  );
}
