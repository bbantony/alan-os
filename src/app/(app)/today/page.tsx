import {
  Sparkles,
  ShoppingCart,
  Wallet,
  Dumbbell,
  Flame,
  BookImage,
  CloudSun,
  Newspaper,
  MapPin,
} from "lucide-react";
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
import { isEveningPlanningTime, todayInAppTimezone, zonedTimeToUtc } from "@/lib/time";
import { DashboardWidget } from "@/components/dashboard/widget";
import { SunriseIllustration } from "@/components/illustrations";
import { TodayTimeline } from "./today-timeline";
import { DashboardGrid } from "./dashboard-grid";
import { NO_MODULES_ACCESS } from "@/lib/permissions";

export default async function TodayPage() {
  const profile = await getCurrentProfile();
  const access = profile?.moduleAccess ?? NO_MODULES_ACCESS;

  const [tasks, shoppingItems, suggestions, workout, money, calendar, focus, yesterdayReflection, routinesDueToday] =
    await Promise.all([
      access.tasks ? getTasks() : Promise.resolve([]),
      access.shopping ? getShoppingItems() : Promise.resolve([]),
      access.shopping ? getStapleSuggestions() : Promise.resolve([]),
      access.workout ? getWorkoutDashboardSummary() : Promise.resolve({ currentStreak: 0, loggedToday: false }),
      access.money ? getFinanceDashboardSummary() : Promise.resolve({ safeToSpendCents: 0, overCount: 0 }),
      access.calendar
        ? getCalendarDashboardSummary()
        : Promise.resolve({ nextEventTitle: null, nextEventTime: null, remindersDueToday: 0 }),
      access.calendar ? getTodayFocus() : Promise.resolve({ source: "auto" as const, goals: [] }),
      access.calendar ? getYesterdayReflection() : Promise.resolve(null),
      access.tasks ? getRoutinesDueToday() : Promise.resolve([]),
    ]);

  const name = profile?.displayName?.split(" ")[0] ?? "there";
  const uncheckedShopping = shoppingItems.filter((i) => !i.checked).length;
  const isEvening = isEveningPlanningTime();

  const today = todayInAppTimezone();
  const [y, m, d] = today.split("-").map(Number);
  const todayStartUtc = zonedTimeToUtc({ year: y, month: m, day: d, hour: 0, minute: 0, second: 0 });
  const overdueTasks = tasks.filter((t) => t.due_at && new Date(t.due_at) < todayStartUtc);
  const overdueIds = new Set(overdueTasks.map((t) => t.id));
  const dueTodayTasks = tasks.filter((t) => !overdueIds.has(t.id) && (t.horizon === "now" || t.horizon === "today"));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <SunriseIllustration className="size-9 shrink-0 text-primary" />
        <div>
          <p className="text-sm text-muted-foreground">{todayInAppTimezone()}</p>
          <h1 className="font-heading text-2xl font-semibold">Good to see you, {name}.</h1>
        </div>
      </div>

      <DashboardGrid>
        <DashboardWidget
          title="Your AI briefing"
          icon={<Sparkles className="size-4" />}
          comingInPhase={7}
          className="sm:col-span-2 border-accent/40 bg-accent/5"
        >
          Once every module below is live, this card becomes a one-paragraph
          morning summary — tasks due, budget pulse, workout streak, weather,
          and news — written fresh each day.
        </DashboardWidget>

        {(access.tasks || access.calendar) && (
          <TodayTimeline
            isEvening={isEvening}
            dueTodayTasks={dueTodayTasks}
            overdueTasks={overdueTasks}
            routinesDueToday={routinesDueToday}
            nextEventTitle={calendar.nextEventTitle}
            nextEventTime={calendar.nextEventTime}
            focus={focus}
            yesterdayReflection={yesterdayReflection}
            openTasks={tasks}
          />
        )}

        {access.shopping && (
          <DashboardWidget title="Shopping" icon={<ShoppingCart className="size-4" />} href="/shopping">
            <div className="tabular text-2xl font-semibold">{uncheckedShopping}</div>
            <p className="text-muted-foreground">
              {suggestions.length > 0
                ? `on your list · ${suggestions.length} running low`
                : "on your list"}
            </p>
          </DashboardWidget>
        )}

        {access.money && (
          <DashboardWidget title="Money" icon={<Wallet className="size-4" />} href="/money">
            <div className="tabular text-2xl font-semibold">{formatCents(money.safeToSpendCents)}</div>
            <p className="text-muted-foreground">
              safe to spend
              {money.overCount > 0 && ` · ${money.overCount} budget${money.overCount > 1 ? "s" : ""} over`}
            </p>
          </DashboardWidget>
        )}

        {access.workout && (
          <DashboardWidget title="Workout" icon={<Dumbbell className="size-4" />} href="/workout">
            <div className="flex items-center gap-1.5">
              <Flame className="size-4 text-accent" />
              <span className="tabular text-2xl font-semibold">{workout.currentStreak}</span>
            </div>
            <p className="text-muted-foreground">
              {workout.loggedToday ? "Logged today" : "Not logged yet today"}
            </p>
          </DashboardWidget>
        )}

        <DashboardWidget title="Journal" icon={<BookImage className="size-4" />} comingInPhase={6}>
          A nudge to post today&apos;s photo will live here.
        </DashboardWidget>

        <DashboardWidget title="Weather" icon={<CloudSun className="size-4" />} comingInPhase={7}>
          Today&apos;s conditions for Winnipeg.
        </DashboardWidget>

        <DashboardWidget title="World news" icon={<Newspaper className="size-4" />} comingInPhase={7}>
          A handful of top headlines.
        </DashboardWidget>

        <DashboardWidget title="Local news" icon={<MapPin className="size-4" />} comingInPhase={7}>
          Headlines for a region you choose in Settings.
        </DashboardWidget>
      </DashboardGrid>
    </div>
  );
}
