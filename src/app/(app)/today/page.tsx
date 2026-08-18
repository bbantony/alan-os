import { getCurrentProfile } from "@/lib/supabase/profile";
import { getTasks } from "@/app/(app)/tasks/actions";
import { getShoppingItems, getStapleSuggestions } from "@/app/(app)/shopping/actions";
import { getWorkoutDashboardSummary } from "@/app/(app)/workout/actions";
import { getFinanceDashboardSummary } from "@/app/(app)/money/actions";
import {
  getCalendarDashboardSummary,
  getTodayFocus,
  getYesterdayReflection,
} from "@/app/(app)/calendar/actions";
import { getRoutinesDueToday } from "@/app/(app)/routines/actions";
import { formatCents } from "@/lib/finance/money";
import {
  isEveningPlanningTime,
  todayInAppTimezone,
  utcToZonedParts,
  zonedTimeToUtc,
} from "@/lib/time";
import { PageHeader, HeaderFact } from "@/components/ui/page-header";
import { Stat, StatStrip } from "@/components/ui/stat";
import { NO_MODULES_ACCESS } from "@/lib/permissions";
import { TodayConsole } from "./today-console";
import { FocusPanel } from "./focus-panel";
import { JumpTo } from "./jump-to";
import { DashboardGrid, Reveal } from "./dashboard-grid";

/**
 * The dashboard, rebuilt as a console.
 *
 * The old version was a bag of widgets: an AI-briefing placeholder, a merged
 * timeline card, four live tiles and four "coming soon" tiles, in a two-column
 * grid with no reading order. It answered "here is some stuff" rather than
 * "here is what to do".
 *
 * The new one has one reading order, top to bottom, and each band answers
 * exactly one question:
 *
 *   masthead   what day is it, and how loaded is it
 *   NOW        what is the single next thing            (the one loud element)
 *   VITALS     the four numbers worth knowing           (each a door)
 *   THE DAY    what the whole day looks like, in order
 *   FOCUS      what you said mattered / plan tomorrow
 *   JUMP TO    everywhere else
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];

export default async function TodayPage() {
  const profile = await getCurrentProfile();
  const access = profile?.moduleAccess ?? NO_MODULES_ACCESS;

  const [
    tasks,
    shoppingItems,
    suggestions,
    workout,
    money,
    calendar,
    focus,
    yesterdayReflection,
    routinesDueToday,
  ] = await Promise.all([
    access.tasks ? getTasks() : Promise.resolve([]),
    access.shopping ? getShoppingItems() : Promise.resolve([]),
    access.shopping ? getStapleSuggestions() : Promise.resolve([]),
    access.workout
      ? getWorkoutDashboardSummary()
      : Promise.resolve({ currentStreak: 0, loggedToday: false }),
    access.money
      ? getFinanceDashboardSummary()
      : Promise.resolve({ safeToSpendCents: 0, overCount: 0 }),
    access.calendar
      ? getCalendarDashboardSummary()
      : Promise.resolve({ nextEventTitle: null, nextEventTime: null, remindersDueToday: 0 }),
    access.calendar ? getTodayFocus() : Promise.resolve({ source: "auto" as const, goals: [] }),
    access.calendar ? getYesterdayReflection() : Promise.resolve(null),
    access.tasks ? getRoutinesDueToday() : Promise.resolve([]),
  ]);

  const name = profile?.displayName?.split(" ")[0] ?? null;
  const uncheckedShopping = shoppingItems.filter((i) => !i.checked).length;
  const isEvening = isEveningPlanningTime();

  const today = todayInAppTimezone();
  const [y, m, d] = today.split("-").map(Number);
  const todayStartUtc = zonedTimeToUtc({
    year: y, month: m, day: d, hour: 0, minute: 0, second: 0,
  });

  const overdueTasks = tasks.filter((t) => t.due_at && new Date(t.due_at) < todayStartUtc);
  const overdueIds = new Set(overdueTasks.map((t) => t.id));
  const dueTodayTasks = tasks.filter(
    (t) => !overdueIds.has(t.id) && (t.horizon === "now" || t.horizon === "today")
  );

  // The clock the whole dashboard reasons about comes from the app's timezone,
  // not the device's — so "is this already past?" stays correct if Alan opens
  // the app from another time zone.
  const nowParts = utcToZonedParts(new Date());
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const dateLine = `${weekday} ${d} ${MONTHS[m - 1]}`;

  const greeting =
    nowParts.hour < 12 ? "Good morning" : nowParts.hour < 17 ? "Good afternoon" : "Good evening";

  const dueCount = dueTodayTasks.length + routinesDueToday.filter((r) => !r.completedToday).length;

  return (
    <div>
      <PageHeader
        eyebrow={name ? `${greeting}, ${name}` : greeting}
        title="Today"
        meta={
          <>
            <HeaderFact>{dateLine}</HeaderFact>
            {access.tasks && <HeaderFact>{dueCount} due</HeaderFact>}
            {access.tasks && overdueTasks.length > 0 && (
              <HeaderFact tone="alert">{overdueTasks.length} overdue</HeaderFact>
            )}
            {access.calendar && calendar.remindersDueToday > 0 && (
              <HeaderFact>{calendar.remindersDueToday} reminders</HeaderFact>
            )}
          </>
        }
      />

      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        <DashboardGrid>
          {/* VITALS. Every figure here is a link into the module that produced
              it — seeing a number and acting on it should never be more than
              one tap apart. */}
          <Reveal>
            <StatStrip columns={4}>
              {access.tasks && (
              <Stat
                label="Due today"
                value={dueCount}
                href="/plan"
                tone={overdueTasks.length > 0 ? "alert" : "default"}
                sub={
                  overdueTasks.length > 0
                    ? `${overdueTasks.length} overdue`
                    : dueCount === 0
                      ? "All clear"
                      : "tasks & routines"
                }
              />
            )}
            {access.money && (
              <Stat
                label="Safe to spend"
                value={formatCents(money.safeToSpendCents)}
                href="/money"
                tone={money.safeToSpendCents < 0 ? "alert" : "default"}
                sub={
                  money.overCount > 0
                    ? `${money.overCount} budget${money.overCount > 1 ? "s" : ""} over`
                    : "this period"
                }
              />
            )}
            {access.workout && (
              <Stat
                label="Streak"
                value={workout.currentStreak}
                unit="wk"
                href="/workout"
                tone={workout.loggedToday ? "ok" : "default"}
                sub={workout.loggedToday ? "Logged today" : "Not logged yet"}
              />
            )}
            {access.shopping && (
              <Stat
                label="Shopping"
                value={uncheckedShopping}
                href="/shopping"
                sub={
                  suggestions.length > 0
                    ? `${suggestions.length} running low`
                    : "on the list"
                }
                />
              )}
            </StatStrip>
          </Reveal>

          {(access.tasks || access.calendar) && (
            <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
              <TodayConsole
                dueTodayTasks={dueTodayTasks}
                overdueTasks={overdueTasks}
                routinesDueToday={routinesDueToday}
                nextEventTitle={calendar.nextEventTitle}
                nextEventTime={calendar.nextEventTime}
                nowMinutes={nowMinutes}
              />

              <div className="flex flex-col gap-4">
                {access.calendar && (
                  <FocusPanel
                    isEvening={isEvening}
                    focus={focus}
                    yesterdayReflection={yesterdayReflection}
                    openTasks={tasks}
                  />
                )}
                <JumpTo moduleAccess={access} />
              </div>
            </div>
          )}

          {!access.tasks && !access.calendar && <JumpTo moduleAccess={access} />}
        </DashboardGrid>
      </div>
    </div>
  );
}
