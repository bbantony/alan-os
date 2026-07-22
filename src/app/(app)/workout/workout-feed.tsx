"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Flame, Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/empty-state";
import { WorkoutIllustration } from "@/components/illustrations";
import { createClient } from "@/lib/supabase/client";
import { celebratePr } from "@/lib/workout/celebrate";
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

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="size-5 text-accent" />
          <span className="tabular font-heading text-xl font-semibold">{myStreak}</span>
          <span className="text-sm text-muted-foreground">day streak</span>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && (
            <Link href="/settings/admin">
              <Button variant="outline" size="icon" aria-label="Manage users and crews">
                <UserPlus className="size-4" />
              </Button>
            </Link>
          )}
          <Link href="/workout/new">
            <Button size="sm" className="gap-1.5">
              <Plus className="size-4" />
              New workout
            </Button>
          </Link>
        </div>
      </div>

      <Segmented
        className="mb-4"
        options={(Object.keys(VIEW_LABELS) as ViewMode[]).map((v) => ({ value: v, label: VIEW_LABELS[v] }))}
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
        <div className="space-y-3">
          {visibleFeed.map((item) => (
            <FeedCard
              key={item.workout.id}
              feedItem={item}
              currentUserId={currentUserId}
              weightUnit={weightUnit}
              onDeleted={() => setFeed((prev) => prev.filter((f) => f.workout.id !== item.workout.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
