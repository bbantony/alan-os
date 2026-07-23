import { getTasks, getTaskIdsWithReminders, getWeeklyDoneCount } from "./actions";
import { TaskList } from "./task-list";

export default async function TasksPage() {
  const [tasks, weeklyDoneCount, reminderTaskIds] = await Promise.all([
    getTasks(),
    getWeeklyDoneCount(),
    getTaskIdsWithReminders(),
  ]);

  return <TaskList initialTasks={tasks} weeklyDoneCount={weeklyDoneCount} initialReminderTaskIds={reminderTaskIds} />;
}
