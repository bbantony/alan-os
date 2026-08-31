"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { RoutineSection } from "@/app/(app)/routines/routine-section";
import { TaskList } from "@/app/(app)/tasks/task-list";
import type { Task, TaskHorizon } from "@/lib/tasks/types";
import type { RoutineWithProgress } from "@/lib/routines/types";
import type { RoutineSuggestion } from "@/app/(app)/routines/actions";
import { CalendarView } from "./calendar-view";
import { AgendaView } from "./agenda-view";
import type { PlanItem } from "./actions";

type View = "list" | "calendar" | "agenda";

/**
 * Tasks and Calendar, merged.
 *
 * They were two modules describing the same commitments in different words —
 * a task with a due date appeared in Tasks, again in Agenda, and a third time
 * as a reminder. One module with three ways of looking at it removes the
 * duplication without losing any of the views.
 *
 * List is the default because it's the one you open forty times a day; the
 * other two are for planning rather than doing.
 */
export function PlanShell({
  initialView,
  tasks,
  weeklyDoneCount,
  doneTodayByHorizon,
  routines,
  routineSuggestions,
  planItems,
  todayIso,
  initialMonth,
  gcalConnected,
  autoFocusNew,
  timeZone,
}: {
  initialView: View;
  tasks: Task[];
  weeklyDoneCount: number;
  doneTodayByHorizon: Record<TaskHorizon, number>;
  routines: RoutineWithProgress[];
  routineSuggestions: RoutineSuggestion[];
  planItems: PlanItem[];
  todayIso: string;
  initialMonth: string;
  gcalConnected: boolean;
  /** The profile's timezone — every time on this screen renders in it. */
  timeZone?: string;
  autoFocusNew: boolean;
}) {
  const [view, setView] = useState<View>(initialView);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
      <Segmented
        options={[
          { value: "list", label: "List" },
          { value: "calendar", label: "Calendar" },
          { value: "agenda", label: "Agenda" },
        ]}
        value={view}
        onChange={setView}
      />

      {view === "list" && (
        <>
          <RoutineSection initialRoutines={routines} suggestions={routineSuggestions} />
          <TaskList
            initialTasks={tasks}
            weeklyDoneCount={weeklyDoneCount}
            initialDoneTodayByHorizon={doneTodayByHorizon}
            autoFocusNew={autoFocusNew}
          />
        </>
      )}

      {view === "calendar" && (
        <CalendarView
          timeZone={timeZone}
          todayIso={todayIso}
          initialItems={planItems}
          initialMonth={initialMonth}
        />
      )}

      {view === "agenda" && (
        <AgendaView
          items={planItems}
          todayIso={todayIso}
          gcalConnected={gcalConnected}
          timeZone={timeZone}
        />
      )}
    </div>
  );
}
