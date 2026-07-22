import {
  Sparkles,
  ListChecks,
  ShoppingCart,
  Wallet,
  Dumbbell,
  Flame,
  CalendarDays,
  BookImage,
  CloudSun,
  Newspaper,
  MapPin,
} from "lucide-react";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getTasks, getWeeklyDoneCount } from "@/app/(app)/tasks/actions";
import { getShoppingItems, getStapleSuggestions } from "@/app/(app)/shopping/actions";
import { getWorkoutDashboardSummary } from "@/app/(app)/workout/actions";
import { todayInAppTimezone } from "@/lib/time";
import { DashboardWidget } from "@/components/dashboard/widget";
import { SunriseIllustration } from "@/components/illustrations";

export default async function TodayPage() {
  const [profile, tasks, weeklyDoneCount, shoppingItems, suggestions, workout] = await Promise.all([
    getCurrentProfile(),
    getTasks(),
    getWeeklyDoneCount(),
    getShoppingItems(),
    getStapleSuggestions(),
    getWorkoutDashboardSummary(),
  ]);

  const name = profile?.displayName?.split(" ")[0] ?? "there";
  const dueToday = tasks.filter((t) => t.horizon === "today").length;
  const uncheckedShopping = shoppingItems.filter((i) => !i.checked).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <SunriseIllustration className="size-9 shrink-0 text-primary" />
        <div>
          <p className="text-sm text-muted-foreground">{todayInAppTimezone()}</p>
          <h1 className="font-heading text-2xl font-semibold">Good to see you, {name}.</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DashboardWidget
          title="Your AI briefing"
          icon={Sparkles}
          comingInPhase={7}
          className="sm:col-span-2 border-accent/40 bg-accent/5"
        >
          Once every module below is live, this card becomes a one-paragraph
          morning summary — tasks due, budget pulse, workout streak, weather,
          and news — written fresh each day.
        </DashboardWidget>

        <DashboardWidget title="Tasks" icon={ListChecks} href="/tasks">
          <div className="tabular text-2xl font-semibold">{dueToday}</div>
          <p className="text-muted-foreground">due today · {weeklyDoneCount} done this week</p>
        </DashboardWidget>

        <DashboardWidget title="Shopping" icon={ShoppingCart} href="/shopping">
          <div className="tabular text-2xl font-semibold">{uncheckedShopping}</div>
          <p className="text-muted-foreground">
            {suggestions.length > 0
              ? `on your list · ${suggestions.length} running low`
              : "on your list"}
          </p>
        </DashboardWidget>

        <DashboardWidget title="Money" icon={Wallet} comingInPhase={4}>
          Budget pulse and &ldquo;safe to spend&rdquo; will live here.
        </DashboardWidget>

        <DashboardWidget title="Workout" icon={Dumbbell} href="/workout">
          <div className="flex items-center gap-1.5">
            <Flame className="size-4 text-accent" />
            <span className="tabular text-2xl font-semibold">{workout.currentStreak}</span>
          </div>
          <p className="text-muted-foreground">
            {workout.loggedToday ? "Logged today" : "Not logged yet today"}
          </p>
        </DashboardWidget>

        <DashboardWidget title="Calendar & Reminders" icon={CalendarDays} comingInPhase={3}>
          Your next event and reminders due today will live here.
        </DashboardWidget>

        <DashboardWidget title="Journal" icon={BookImage} comingInPhase={6}>
          A nudge to post today&apos;s photo will live here.
        </DashboardWidget>

        <DashboardWidget title="Weather" icon={CloudSun} comingInPhase={7}>
          Today&apos;s conditions for Winnipeg.
        </DashboardWidget>

        <DashboardWidget title="World news" icon={Newspaper} comingInPhase={7}>
          A handful of top headlines.
        </DashboardWidget>

        <DashboardWidget title="Local news" icon={MapPin} comingInPhase={7}>
          Headlines for a region you choose in Settings.
        </DashboardWidget>
      </div>
    </div>
  );
}
