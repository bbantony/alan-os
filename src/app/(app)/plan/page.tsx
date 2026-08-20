import {
  getTasks,
  getWeeklyDoneCount,
  getTodayCompletionCountsByHorizon,
} from "@/app/(app)/tasks/actions";
import { getRoutines, getRoutineSuggestions } from "@/app/(app)/routines/actions";
import { getGcalStatus } from "@/app/(app)/calendar/actions";
import { PageHeader, HeaderFact } from "@/components/ui/page-header";
import { todayInAppTimezone } from "@/lib/time";
import { addMonths, parseDateString, toDateString } from "@/lib/calendar";
import { getPlanRange } from "./actions";
import { getPreferences } from "@/app/(app)/settings/preferences-actions";
import { PlanShell } from "./plan-shell";

/**
 * Plan — Tasks and Calendar in one place.
 *
 * The calendar and agenda views load a three-month window up front (previous,
 * current, next). Paging one month either way is the common move and shouldn't
 * cost a round trip; going further does, and `CalendarView` fetches on demand
 * when it happens.
 */
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; new?: string }>;
}) {
  const params = await searchParams;
  const todayIso = todayInAppTimezone();
  const today = parseDateString(todayIso) ?? new Date();

  const prev = addMonths(today.getFullYear(), today.getMonth(), -1);
  const next = addMonths(today.getFullYear(), today.getMonth(), 1);
  const rangeStart = toDateString(new Date(prev.year, prev.month, 1));
  const rangeEnd = toDateString(new Date(next.year, next.month + 1, 0));

  const [
    tasks,
    weeklyDoneCount,
    routines,
    routineSuggestions,
    doneTodayByHorizon,
    planItems,
    gcalStatus,
    preferences,
  ] = await Promise.all([
    getTasks(),
    getWeeklyDoneCount(),
    getRoutines(),
    getRoutineSuggestions(),
    getTodayCompletionCountsByHorizon(),
    getPlanRange(rangeStart, rangeEnd),
    getGcalStatus(),
    getPreferences(),
  ]);

  const openCount = tasks.filter((t) => !t.parent_task_id).length;
  const activeRoutines = routines.filter((r) => r.active).length;
  const dueToday = planItems.filter((i) => i.dateIso === todayIso && !i.done).length;

  // A ?view= in the URL wins (that's someone deliberately linking to a view);
  // otherwise it's whichever one you set in Settings → Plan.
  const view =
    params.view === "calendar" || params.view === "agenda" || params.view === "list"
      ? params.view
      : preferences.defaultPlanView;

  return (
    <div>
      <PageHeader
        eyebrow="Tasks, routines and your calendar"
        title="Plan"
        meta={
          <>
            <HeaderFact>{openCount} open</HeaderFact>
            <HeaderFact>{activeRoutines} routines</HeaderFact>
            <HeaderFact>{dueToday} today</HeaderFact>
            <HeaderFact>{weeklyDoneCount} done this week</HeaderFact>
          </>
        }
      />

      <PlanShell
        initialView={view}
        tasks={tasks}
        weeklyDoneCount={weeklyDoneCount}
        doneTodayByHorizon={doneTodayByHorizon}
        routines={routines}
        routineSuggestions={routineSuggestions}
        planItems={planItems}
        todayIso={todayIso}
        initialMonth={todayIso.slice(0, 7)}
        gcalConnected={gcalStatus.connected}
        autoFocusNew={params.new === "1"}
      />
    </div>
  );
}
