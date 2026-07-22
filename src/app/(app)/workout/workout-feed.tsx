"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { WorkoutIllustration } from "@/components/illustrations";
import { createClient } from "@/lib/supabase/client";
import { celebratePr } from "@/lib/workout/celebrate";
import type { FeedWorkout, WeightUnit } from "@/lib/workout/types";
import { getFeed, getLeaderboard, type LeaderboardEntry } from "./actions";
import { FeedCard } from "./feed-card";
import { Leaderboard } from "./leaderboard";

const REALTIME_TABLES = ["workouts", "workout_sets", "runs", "reactions", "comments", "prs"] as const;

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
            <Link href="/workout/invite">
              <Button variant="outline" size="icon" aria-label="Invite crew">
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

      <Tabs defaultValue="feed">
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="feed" className="flex-1">
            Feed
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="flex-1">
            Leaderboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feed">
          {feed.length === 0 ? (
            <EmptyState
              title="No workouts yet"
              description="Log your first session and the crew will see it here."
              icon={<WorkoutIllustration className="size-8" />}
            />
          ) : (
            <div className="space-y-3">
              {feed.map((item) => (
                <FeedCard
                  key={item.workout.id}
                  feedItem={item}
                  currentUserId={currentUserId}
                  weightUnit={weightUnit}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="leaderboard">
          <Leaderboard entries={leaderboard} currentUserId={currentUserId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
