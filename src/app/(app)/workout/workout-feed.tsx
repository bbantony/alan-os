"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/empty-state";
import { PageHeader, HeaderFact } from "@/components/ui/page-header";
import { Stat, StatStrip } from "@/components/ui/stat";
import { WorkoutIllustration } from "@/components/illustrations";
import { createClient } from "@/lib/supabase/client";
import { celebratePr } from "@/lib/workout/celebrate";
import { startOfWeek } from "@/lib/workout/streaks";
import type { FeedWorkout, WeightUnit } from "@/lib/workout/types";
import { getFeed, getLeaderboard, type LeaderboardEntry } from "./actions";
import { FeedCard } from "./feed-card";
import { Leaderboard } from "./leaderboard";

const REALTIME_TABLES = ["workouts", "workout_sets", "runs", "reactions", "prs"] as const;

type ViewMode = "all" | "mine" | "others" | "leaderboard";

const VIEW_LABELS: Record<ViewMode, string> = {
  all: "Everyone",
  mine: "Mine",
  others: "Others",
  leaderboard: "Leaderboard",
};

export function WorkoutFeed({
  initialFeed,
  initialLeaderboard,
  currentUserId,
  weightUnit,
  isOwner,
}: {
  initialFeed: FeedWorkout[];
  initialLeaderboard: LeaderboardEntry[];
  currentUserId: string;
  weightUnit: WeightUnit;
  isOwner: boolean;
}) {
  const [feed, setFeed] = useState(initialFeed);
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard);
  const [view, setView] = useState<ViewMode>("all");

  useEffect(() => {
    const supabase = createClient();
    let channel = supabase.channel("workout-feed");

    for (const table of REALTIME_TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          if (table === "prs" && payload.eventType === "INSERT") {
            const row = payload.new as { user_id?: string };
            if (row.user_id && row.user_id !== currentUserId) celebratePr();
          }
          refresh();
        }
      );
    }

    channel.subscribe();

    async function refresh() {
      const [freshFeed, freshLeaderboard] = await Promise.all([getFeed(), getLeaderboard()]);
      setFeed(freshFeed);
      setLeaderboard(freshLeaderboard);
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const myStreak = leaderboard.find((e) => e.profile.id === currentUserId)?.currentStreak ?? 0;

  const visibleFeed = useMemo(() => {
    if (view === "mine") return feed.filter((f) => f.workout.user_id === currentUserId);
    if (view === "others") return feed.filter((f) => f.workout.user_id !== currentUserId);
    return feed;
  }, [feed, view, currentUserId]);

  // Now that crews are real (not "everyone in the project"), this reflects
  // just your own crew's activity — feed is already crew-scoped by RLS.
  const weekStats = useMemo(() => {
    const weekStart = startOfWeek(new Date().toISOString().slice(0, 10));
    const thisWeek = feed.filter((f) => f.workout.workout_date >= weekStart);
    const activeMembers = new Set(thisWeek.map((f) => f.workout.user_id));
    return { sessions: thisWeek.length, members: activeMembers.size };
  }, [feed]);

  return (
    <div>
      <PageHeader
        eyebrow="Sessions, crew, streaks"
        title="Workout"
        meta={
          <>
            <HeaderFact>{feed.length} in the feed</HeaderFact>
            {weekStats.sessions > 0 && (
              <HeaderFact>
                {weekStats.sessions} session{weekStats.sessions === 1 ? "" : "s"} this week
              </HeaderFact>
            )}
          </>
        }
        actions={
          <>
            {isOwner && (
              <Link href="/settings/admin" aria-label="Manage users and crews">
                <Button variant="outline" size="icon" aria-label="Manage users and crews">
                  <UserPlus className="size-4" />
                </Button>
              </Link>
            )}
            <Link href="/workout/new">
              <Button>
                <Plus className="size-4" strokeWidth={3} />
                Log
              </Button>
            </Link>
          </>
        }
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        {/* Your streak and the crew's week, as readings rather than a caption.
            The streak is the single number this module exists to move, so it
            gets the biggest type on the screen. */}
        <StatStrip columns={3}>
          <Stat
            label="Your streak"
            value={myStreak}
            unit="wk"
            tone={myStreak > 0 ? "ok" : "default"}
            sub={myStreak > 0 ? "keep it alive" : "log one to start"}
          />
          <Stat
            label="Crew this week"
            value={weekStats.sessions}
            sub={
              weekStats.members > 1
                ? `across ${weekStats.members} people`
                : weekStats.sessions === 1
                  ? "session"
                  : "sessions"
            }
          />
          <Stat label="Crew size" value={leaderboard.length} sub="on the board" />
        </StatStrip>

        <Segmented
          options={(Object.keys(VIEW_LABELS) as ViewMode[]).map((v) => ({
            value: v,
            label: VIEW_LABELS[v],
          }))}
          value={view}
          onChange={setView}
        />

        {view === "leaderboard" ? (
          <Leaderboard entries={leaderboard} currentUserId={currentUserId} />
        ) : visibleFeed.length === 0 ? (
          <EmptyState
            title={view === "mine" ? "No workouts logged yet" : "No workouts here yet"}
            description={
              view === "mine"
                ? "Log your first session and it'll show up here."
                : "Once someone logs a workout, it'll show up here."
            }
            icon={<WorkoutIllustration className="size-8" />}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {visibleFeed.map((item) => (
              <FeedCard
                key={item.workout.id}
                feedItem={item}
                currentUserId={currentUserId}
                weightUnit={weightUnit}
                onDeleted={() =>
                  setFeed((prev) => prev.filter((f) => f.workout.id !== item.workout.id))
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
