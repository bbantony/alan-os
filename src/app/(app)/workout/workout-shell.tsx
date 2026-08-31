"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader, HeaderFact } from "@/components/ui/page-header";
import type { FeedWorkout, MuscleGroup, WeightUnit, WorkoutTemplate } from "@/lib/workout/types";
import type { LeaderboardEntry } from "./actions";
import type { RecordEntry, SessionSummary, WeekDay, WorkoutDraft } from "./personal-actions";
import { WorkoutHome } from "./workout-home";
import { YouView } from "./you-view";
import { CrewView } from "./crew-view";

type View = "home" | "history" | "crew";

/**
 * Workout, log-first.
 *
 * HISTORY OF THIS SCREEN, because it has now turned twice. It first opened on
 * the crew feed with your own training behind a filter called "Mine". That was
 * inverted so your own sessions became the default tab. Alan's verdict on the
 * result: "I still don't like the way workouts are laid out. I want things to
 * be very simple." Shown three drawn options, he chose the log-first one.
 *
 * So the default view is now a single decision — Start, this week, last time —
 * and the two tabs became three views where two of them are links you take
 * deliberately rather than tabs competing for the first glance. Everything that
 * used to be on the You tab is still in History; nothing was deleted.
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
  const [view, setView] = useState<View>("home");
  const [feed, setFeed] = useState(initialFeed);
  const [leaderboard, setLeaderboard] = useState(initialLeaderboard);

  const sessionsThisWeek = week.filter((d) => d.trained).length;
  const crewSessionsThisWeek = leaderboard.reduce((n, e) => n + e.workoutsThisWeek, 0);

  return (
    <div>
      <PageHeader
        eyebrow={
          view === "home" ? "Your training" : view === "history" ? "Workout" : "Workout"
        }
        title={view === "home" ? "Workout" : view === "history" ? "History" : "Crew"}
        meta={
          view === "home" ? (
            <>
              {/* Was labelled "wk" while showing a count of consecutive DAYS —
                  computeStreak (src/lib/streaks.ts) counts calendar days, so a
                  5-day streak read as "5 wk". */}
              <HeaderFact>
                {streakDays} day{streakDays === 1 ? "" : "s"} streak
              </HeaderFact>
              <HeaderFact>{sessionsThisWeek} this week</HeaderFact>
              {draft && <HeaderFact tone="alert">Session in progress</HeaderFact>}
            </>
          ) : null
        }
        actions={
          view === "home" ? (
            isOwner ? (
              <Link href="/settings/admin" aria-label="Manage users and crews">
                <Button variant="outline" size="icon" aria-label="Manage users and crews">
                  <UserPlus className="size-4" />
                </Button>
              </Link>
            ) : null
          ) : (
            <Button variant="outline" onClick={() => setView("home")}>
              <ArrowLeft className="size-4" strokeWidth={3} />
              Back
            </Button>
          )
        }
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        {view === "home" && (
          <WorkoutHome
            draft={draft}
            week={week}
            sessions={sessions}
            today={today}
            weightUnit={weightUnit}
            crewSessionsThisWeek={crewSessionsThisWeek}
            onShowHistory={() => setView("history")}
            onShowCrew={() => setView("crew")}
          />
        )}

        {view === "history" && (
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
            onShowCrew={() => setView("crew")}
          />
        )}

        {view === "crew" && (
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
