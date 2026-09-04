"use client";

import { useEffect, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/empty-state";
import { Stat, StatStrip } from "@/components/ui/stat";
import { WorkoutIllustration } from "@/components/illustrations";
import { createClient } from "@/lib/supabase/client";
import { celebratePr } from "@/lib/workout/celebrate";
import type { FeedWorkout, WeightUnit } from "@/lib/workout/types";
import { getFeed, getLeaderboard, type LeaderboardEntry } from "./actions";
import { FeedCard } from "./feed-card";
import { Leaderboard } from "./leaderboard";

const REALTIME_TABLES = ["workouts", "workout_sets", "runs", "reactions", "prs"] as const;

/** One saved session inserts rows into several of these tables at once — wait
 *  for the burst to finish, then refetch once. */
const REFRESH_DEBOUNCE_MS = 1500;

type CrewTab = "feed" | "leaderboard";

/**
 * The crew, demoted from front page to tab.
 *
 * Everything that was here still is — realtime across five tables, reactions,
 * confetti when someone else sets a record, the leaderboard. What went is the
 * four-way filter: "Everyone / Mine / Others" made sense when this screen was
 * the only view of anything, and stopped making sense the moment your own
 * training got a tab of its own. What's left is Feed / Leaderboard.
 *
 * Feed state lives in the shell rather than here so that switching tabs doesn't
 * throw away what realtime has already fetched.
 */
export function CrewView({
  feed,
  leaderboard,
  onFeedChange,
  onLeaderboardChange,
  currentUserId,
  weightUnit,
}: {
  feed: FeedWorkout[];
  leaderboard: LeaderboardEntry[];
  onFeedChange: (feed: FeedWorkout[]) => void;
  onLeaderboardChange: (leaderboard: LeaderboardEntry[]) => void;
  currentUserId: string;
  weightUnit: WeightUnit;
}) {
  const [tab, setTab] = useState<CrewTab>("feed");

  useEffect(() => {
    const supabase = createClient();
    let channel = supabase.channel("workout-feed");

    // Trailing-edge debounce: every event just restarts the timer, so a
    // multi-set session that lands as nine inserts costs one refetch — and at
    // most one round of confetti, however many PRs the burst contained.
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let burstHadCrewPr = false;

    function scheduleRefresh() {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(async () => {
        refreshTimer = null;
        if (burstHadCrewPr) {
          burstHadCrewPr = false;
          celebratePr();
        }
        const [freshFeed, freshLeaderboard] = await Promise.all([getFeed(), getLeaderboard()]);
        onFeedChange(freshFeed);
        onLeaderboardChange(freshLeaderboard);
      }, REFRESH_DEBOUNCE_MS);
    }

    for (const table of REALTIME_TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          if (table === "prs" && payload.eventType === "INSERT") {
            const row = payload.new as { user_id?: string };
            if (row.user_id && row.user_id !== currentUserId) burstHadCrewPr = true;
          }
          scheduleRefresh();
        }
      );
    }

    channel.subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
    // The callbacks are setState functions from the shell and stable across
    // renders; re-subscribing on every render would tear down and rebuild the
    // realtime channel constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const sessionsThisWeek = leaderboard.reduce((n, e) => n + e.workoutsThisWeek, 0);
  const activeMembers = leaderboard.filter((e) => e.workoutsThisWeek > 0).length;

  return (
    <div className="flex flex-col gap-4">
      <StatStrip columns={3}>
        <Stat label="Sessions this week" value={sessionsThisWeek} sub="across the crew" />
        <Stat
          label="Training"
          value={activeMembers}
          sub={`of ${leaderboard.length} ${leaderboard.length === 1 ? "member" : "members"}`}
        />
        <Stat
          label="Top streak"
          value={leaderboard[0]?.currentStreak ?? 0}
          unit="days"
          sub={leaderboard[0]?.profile.display_name ?? "nobody yet"}
        />
      </StatStrip>

      <Segmented
        options={[
          { value: "feed", label: "Feed" },
          { value: "leaderboard", label: "Leaderboard" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "leaderboard" ? (
        <Leaderboard entries={leaderboard} currentUserId={currentUserId} />
      ) : feed.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description="Once someone in your crew logs a workout, it'll show up here."
          icon={<WorkoutIllustration className="size-8" />}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {feed.map((item) => (
            <FeedCard
              key={item.workout.id}
              feedItem={item}
              currentUserId={currentUserId}
              weightUnit={weightUnit}
              onDeleted={() => onFeedChange(feed.filter((f) => f.workout.id !== item.workout.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
