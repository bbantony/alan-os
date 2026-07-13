import { getTasks, getWeeklyDoneCount } from "./actions";
import { TaskList } from "./task-list";

export default async function TasksPage() {
  const [tasks, weeklyDoneCount] = await Promise.all([getTasks(), getWeeklyDoneCount()]);

  return <TaskList initialTasks={tasks} weeklyDoneCount={weeklyDoneCount} />;
}
