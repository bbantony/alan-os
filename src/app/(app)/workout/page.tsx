import { getCurrentProfile } from "@/lib/supabase/profile";
import { computeStreak } from "@/lib/workout/streaks";
import { todayInAppTimezone } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";
import { getFeed, getLastResistanceSession, getLeaderboard, getTemplates, getWeightUnit } from "./actions";
import {
  getDraft,
  getMuscleGroupRecency,
  getMySessions,
  getRecords,
  getThisWeek,
} from "./personal-actions";
import { WorkoutShell } from "./workout-shell";

export default async function WorkoutPage() {
  const profile = await getCurrentProfile();

  const [
    draft, week, sessions, records, templates, lastSession, recency,
    feed, leaderboard, weightUnit,
  ] = await Promise.all([
    getDraft(),
    getThisWeek(),
    getMySessions(8),
    getRecords(8),
    getTemplates(),
    getLastResistanceSession(),
    getMuscleGroupRecency(),
    getFeed(),
    getLeaderboard(),
    getWeightUnit(),
  ]);

  // Your own streak, computed from your own dates. It used to be read out of
  // the crew leaderboard, which meant the number on your own screen depended on
  // a crew-wide query — and was rendered with the unit "wk" while counting
  // consecutive days.
  const supabase = await createClient();
  const { data: myDates } = await supabase
    .from("workouts")
    .select("workout_date")
    .eq("user_id", profile?.id ?? "");
  const streak = computeStreak(
    [...new Set(((myDates as { workout_date: string }[]) ?? []).map((w) => w.workout_date))],
    todayInAppTimezone()
  );

  return (
    <WorkoutShell
      draft={draft}
      week={week}
      sessions={sessions}
      records={records}
      templates={templates}
      lastSession={lastSession}
      lastTrainedByGroup={recency.lastTrainedByGroup}
      today={recency.today}
      streakDays={streak.current}
      initialFeed={feed}
      initialLeaderboard={leaderboard}
      currentUserId={profile?.id ?? ""}
      weightUnit={weightUnit}
      isOwner={profile?.role === "owner"}
    />
  );
}
