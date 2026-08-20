"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { PageHeader, HeaderFact } from "@/components/ui/page-header";
import type { FeedWorkout, MuscleGroup, WeightUnit, WorkoutTemplate } from "@/lib/workout/types";
import type { LeaderboardEntry } from "./actions";
import type { RecordEntry, SessionSummary, WeekDay, WorkoutDraft } from "./personal-actions";
import { YouView } from "./you-view";
import { CrewView } from "./crew-view";

type Tab = "you" | "crew";

/**
 * Workout, turned round.
 *
 * `/workout` used to open on the crew feed, with your own training as one
 * option in a four-way filter (Everyone / Mine / Others / Leaderboard). Your
 * own sessions are now the whole default tab, and the crew keeps everything it
 * had — feed, reactions, realtime, PR confetti, leaderboard — one tap away.
 *
 * "Mine" and "Others" are gone from the crew filter: once your training has its
 * own tab, a filter that hides everyone else from a feed of everyone else has
 * nothing left to do.
 */
export function WorkoutShell({
  draft,
  week,
  sessions,
  records,
  templates,
  lastSession,
  lastTrainedByGroup,
  today,
  streakDays,
  initialFeed,
  initialLeaderboard,
  currentUserId,
  weightUnit,
  isOwner,
}: {
  draft: WorkoutDraft | null;
  week: WeekDay[];
  sessions: SessionSummary[];
  records: RecordEntry[];
  templates: WorkoutTemplate[];
  lastSession: { workoutDate: string; exerciseIds: string[] } | null;
  lastTrainedByGroup: Partial<Record<MuscleGroup, string>>;
  today: string;
  streakDays: number;
  initialFeed: FeedWorkout[];
  initialLeaderboard: LeaderboardEntry[];
  currentUserId: string;
  weightUnit: WeightUnit;
  isOwner: boolean;
}) {
  const [tab, setTab] = useState<Tab>("you");
  const [feed, setFeed] = useState(initialFeed);
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard);

  const sessionsThisWeek = week.filter((d) => d.trained).length;
  const crewSessionsThisWeek = leaderboard.reduce((n, e) => n + e.workoutsThisWeek, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Your training"
        title="Workout"
        meta={
          <>
            {/* Was labelled "wk" while showing a count of consecutive DAYS —
                computeStreak (src/lib/streaks.ts) counts calendar days, so a
                5-day streak read as "5 wk". */}
            <HeaderFact>
              {streakDays} day{streakDays === 1 ? "" : "s"} streak
            </HeaderFact>
            <HeaderFact>
              {sessionsThisWeek} this week
            </HeaderFact>
            {draft && <HeaderFact tone="alert">Session in progress</HeaderFact>}
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
                {draft ? "Resume" : "Start"}
              </Button>
            </Link>
          </>
        }
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        <Segmented
          options={[
            { value: "you", label: "You" },
            { value: "crew", label: "Crew" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "you" ? (
          <YouView
            draft={draft}
            week={week}
            sessions={sessions}
            records={records}
            templates={templates}
            lastSession={lastSession}
            lastTrainedByGroup={lastTrainedByGroup}
            today={today}
            weightUnit={weightUnit}
            crewSessionsThisWeek={crewSessionsThisWeek}
            onShowCrew={() => setTab("crew")}
          />
        ) : (
          <CrewView
            feed={feed}
            leaderboard={leaderboard}
            onFeedChange={setFeed}
            onLeaderboardChange={setLeaderboard}
            currentUserId={currentUserId}
            weightUnit={weightUnit}
          />
        )}
      </div>
    </div>
  );
}
