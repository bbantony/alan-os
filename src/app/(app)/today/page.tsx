import { getCurrentProfile } from "@/lib/supabase/profile";
import { getTasks } from "@/app/(app)/tasks/actions";
import { getShoppingItems, getStapleSuggestions } from "@/app/(app)/shopping/actions";
import { getWorkoutDashboardSummary } from "@/app/(app)/workout/actions";
import { getFinanceDashboardSummary } from "@/app/(app)/money/actions";
import { getUpcomingBills, postDueRecurringTransactions } from "@/app/(app)/money/recurring-actions";
import {
  getCalendarDashboardSummary,
  getTodayFocus,
  getYesterdayReflection,
} from "@/app/(app)/calendar/actions";
import { getRoutinesDueToday } from "@/app/(app)/routines/actions";
import { formatCents } from "@/lib/finance/money";
import {
  APP_TIMEZONE,
  isEveningPlanningTime,
  todayInAppTimezone,
  utcToZonedParts,
  zonedTimeToUtc,
} from "@/lib/time";
import { PageHeader, HeaderFact } from "@/components/ui/page-header";
import { Stat, StatStrip } from "@/components/ui/stat";
import { NO_MODULES_ACCESS } from "@/lib/permissions";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";
import { getLedger } from "@/lib/ledger";
import { TodayConsole } from "./today-console";
import { FocusPanel } from "./focus-panel";
import { JumpTo } from "./jump-to";
import { TodaySoFar } from "./today-so-far";
import { UpcomingBills } from "./upcoming-bills";
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

  // Repeating money (rent, salary, subscriptions) posts itself here too, not
  // only on the Money screen — otherwise this dashboard's safe-to-spend would
  // still be showing last month's picture until Money happened to be opened.
  // Idempotent, so both pages doing it is harmless.
  if (access.money) await postDueRecurringTransactions();

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
  // Both from preferences now: the hour used to be a hardcoded 8pm and the
  // timezone a hardcoded Winnipeg.
  const prefs = profile?.preferences ?? DEFAULT_PREFERENCES;
  const timezone = profile?.timezone ?? APP_TIMEZONE;
  const isEvening = isEveningPlanningTime(new Date(), prefs.eveningRitualHour, timezone);

  const today = todayInAppTimezone(timezone);
  const [y, m, d] = today.split("-").map(Number);
  const todayStartUtc = zonedTimeToUtc({
    year: y, month: m, day: d, hour: 0, minute: 0, second: 0,
  });

  // Only fetched when the panel is actually on screen — a hidden panel should
  // not cost six queries on every dashboard load.
  const ledgerToday = prefs.todayPanels.includes("timeline")
    ? await getLedger(today, today)
    : [];

  const upcomingBills =
    access.money && prefs.todayPanels.includes("bills") ? await getUpcomingBills(7) : [];

  const overdueTasks = tasks.filter((t) => t.due_at && new Date(t.due_at) < todayStartUtc);
  const overdueIds = new Set(overdueTasks.map((t) => t.id));
  const dueTodayTasks = tasks.filter(
    (t) => !overdueIds.has(t.id) && (t.horizon === "now" || t.horizon === "today")
  );

  // The clock the whole dashboard reasons about comes from the app's timezone,
  // not the device's — so "is this already past?" stays correct if Alan opens
  // the app from another time zone.
  const nowParts = utcToZonedParts(new Date(), timezone);
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const dateLine = `${weekday} ${d} ${MONTHS[m - 1]}`;

  const greeting =
    nowParts.hour < 12 ? "Good morning" : nowParts.hour < 17 ? "Good afternoon" : "Good evening";

  const dueCount = dueTodayTasks.length + routinesDueToday.filter((r) => !r.completedToday).length;

  // The order (and what's shown at all) comes from Settings → Today. The old
  // layout was a fixed two-column grid; this is a straight list so a person can
  // put what they actually look at first.
  const panels = prefs.todayPanels.filter((p) => p !== "vitals");

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
              one tap apart. It's a panel like the others now: Settings → Today
              can move it or hide it. */}
          <Reveal className={prefs.todayPanels.includes("vitals") ? undefined : "hidden"}>
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
                unit="days"
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

          {panels.map((panel) => {
            if (panel === "console" && (access.tasks || access.calendar)) {
              return (
                <TodayConsole
                  key={panel}
                  dueTodayTasks={dueTodayTasks}
                  overdueTasks={overdueTasks}
                  routinesDueToday={routinesDueToday}
                  nextEventTitle={calendar.nextEventTitle}
                  nextEventTime={calendar.nextEventTime}
                  nowMinutes={nowMinutes}
                />
              );
            }
            if (panel === "bills" && access.money) {
              return (
                <UpcomingBills
                  key={panel}
                  bills={upcomingBills}
                  safeToSpendCents={money.safeToSpendCents}
                />
              );
            }
            if (panel === "timeline") {
              return <TodaySoFar key={panel} events={ledgerToday} />;
            }
            if (panel === "focus" && access.calendar) {
              return (
                <FocusPanel
                  key={panel}
                  isEvening={isEvening}
                  focus={focus}
                  yesterdayReflection={yesterdayReflection}
                  openTasks={tasks}
                />
              );
            }
            if (panel === "jump") {
              return <JumpTo key={panel} moduleAccess={access} />;
            }
            return null;
          })}

        </DashboardGrid>
      </div>
    </div>
  );
}
