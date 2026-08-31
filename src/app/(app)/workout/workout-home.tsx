"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Dumbbell, Footprints, Play, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Micro } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { fadeInUpVariants, staggerContainerVariants } from "@/lib/motion";
import { formatDuration } from "@/lib/workout/format";
import type { WeightUnit } from "@/lib/workout/types";
import { clearDraft, type SessionSummary, type WeekDay, type WorkoutDraft } from "./personal-actions";

/**
 * Workout, log-first.
 *
 * Alan's words: "I want things to be very simple with workouts", chosen from a
 * set of drawn options as "one big Start, this week, last session — everything
 * else one tap away, not in the way".
 *
 * So this screen answers exactly one question — *am I training today or not* —
 * and puts the answer under your thumb. What used to be here (records,
 * templates, the next-up chooser, the recent list, a crew teaser) is not
 * deleted; it moved behind History and Crew, one tap each. The rule for
 * anything added here later: if it doesn't help you decide to start, or tell
 * you what you did last, it belongs behind a link.
 */

function daysAgoLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return "today";
  const then = new Date(`${iso}T00:00:00Z`).getTime();
  const now = new Date(`${todayIso}T00:00:00Z`).getTime();
  const days = Math.round((now - then) / 86400000);
  if (days === 1) return "yesterday";
  if (days < 0) return "scheduled";
  return `${days} days ago`;
}

export function WorkoutHome({
  draft,
  week,
  sessions,
  today,
  weightUnit,
  crewSessionsThisWeek,
  onShowHistory,
  onShowCrew,
}: {
  draft: WorkoutDraft | null;
  week: WeekDay[];
  sessions: SessionSummary[];
  today: string;
  weightUnit: WeightUnit;
  crewSessionsThisWeek: number;
  onShowHistory: () => void;
  onShowCrew: () => void;
}) {
  const lastSession = sessions[0] ?? null;
  const trainedThisWeek = week.filter((d) => d.trained).length;
  // `exercises` is optional on DraftPayload — a draft can exist with only a
  // type chosen and nothing logged yet.
  const draftExerciseCount = draft?.payload.exercises?.length ?? 0;

  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-4"
    >
      {/* ---------------- The one decision ----------------
          A draft turns Start into Resume and says how far in you are, because
          the worst outcome on this screen is starting a second session on top
          of one you forgot to finish. */}
      <motion.div variants={fadeInUpVariants}>
        <Link href="/workout/new" className="block">
          <Button block size="lg" className="h-20 text-lg">
            <Play className="size-5" strokeWidth={3} />
            {draft ? "Resume session" : "Start a session"}
          </Button>
        </Link>

        {draft && (
          <div className="mt-2 flex items-center justify-between gap-3 border-2 border-rule bg-muted px-3 py-2">
            <Micro>
              {draftExerciseCount} exercise{draftExerciseCount === 1 ? "" : "s"} in progress
            </Micro>
            <button
              type="button"
              onClick={async () => {
                await clearDraft();
                toast.success("Unfinished session discarded");
              }}
              className="tap-press flex items-center gap-1.5 p-2 -m-2 text-muted-foreground transition-colors hover:text-destructive"
              aria-label="Discard the unfinished session"
            >
              <Trash2 className="size-4" strokeWidth={2.5} />
              <Micro>Discard</Micro>
            </button>
          </div>
        )}
      </motion.div>

      {/* ---------------- This week ---------------- */}
      <motion.div variants={fadeInUpVariants}>
        <Panel>
          <PanelHead
            title="This week"
            count={`${trainedThisWeek} session${trainedThisWeek === 1 ? "" : "s"}`}
          />
          <div className="grid grid-cols-7 gap-px bg-hairline">
            {week.map((day) => (
              <div
                key={day.date}
                className={cn(
                  "flex flex-col items-center gap-1.5 bg-surface py-2.5",
                  day.isFuture && "opacity-40"
                )}
              >
                <span
                  className={cn(
                    "micro-sm",
                    day.isToday ? "font-bold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {day.letter}
                </span>
                {/* A trained day is a filled block; a run gets the accent so a
                    week of lifting and a week of running don't look identical. */}
                <span
                  className={cn(
                    "flex size-6 items-center justify-center border-2",
                    day.trained
                      ? day.hasRun
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-rule bg-foreground text-background"
                      : day.isToday
                        ? "border-rule bg-surface"
                        : "border-hairline bg-muted"
                  )}
                >
                  {day.trained &&
                    (day.hasRun ? (
                      <Footprints className="size-3" strokeWidth={3} />
                    ) : (
                      <Dumbbell className="size-3" strokeWidth={3} />
                    ))}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </motion.div>

      {/* ---------------- Last time ----------------
          Not a list. One session, because the useful question standing at the
          rack is "what did I do last time", and a list of eight answers it
          worse than one does. */}
      <motion.div variants={fadeInUpVariants}>
        <Panel>
          <PanelHead title="Last time" />
          {lastSession ? (
            <Link
              href="/workout/new?repeat=1"
              className="tap-press block px-3 py-3 transition-colors hover:bg-muted"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="display-sm capitalize">{lastSession.type}</span>
                <Micro>{daysAgoLabel(lastSession.workout_date, today)}</Micro>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {lastSession.run
                  ? `${lastSession.run.distance_km} km · ${formatDuration(
                      lastSession.run.duration_seconds
                    )}`
                  : `${lastSession.exerciseCount} exercise${
                      lastSession.exerciseCount === 1 ? "" : "s"
                    } · ${lastSession.setCount} set${lastSession.setCount === 1 ? "" : "s"}`}
              </p>
              {lastSession.notes && (
                <p className="mt-1 truncate text-sm text-muted-foreground">{lastSession.notes}</p>
              )}
              <p className="mt-2">
                <Micro>Tap to do it again</Micro>
              </p>
            </Link>
          ) : (
            <div className="px-3 py-4">
              <p className="text-sm text-muted-foreground">
                Nothing logged yet. Your first session will show up here.
              </p>
            </div>
          )}
        </Panel>
      </motion.div>

      {/* ---------------- Everywhere else ----------------
          Two rows, deliberately plain. This is the "not in the way" half of the
          decision: they exist, they're one tap, and they don't compete with the
          Start button for attention. */}
      <motion.div variants={fadeInUpVariants}>
        <Panel>
          <button
            type="button"
            onClick={onShowHistory}
            className="tap-press flex w-full items-center gap-3 border-b border-hairline px-3 py-3 text-left transition-colors hover:bg-muted"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">History &amp; records</span>
              <Micro className="block">
                {sessions.length > 0
                  ? `${sessions.length} recent session${sessions.length === 1 ? "" : "s"}, and your bests`
                  : "Everything you've logged"}
              </Micro>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={onShowCrew}
            className="tap-press flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Crew</span>
              <Micro className="block">
                {crewSessionsThisWeek > 0
                  ? `${crewSessionsThisWeek} session${
                      crewSessionsThisWeek === 1 ? "" : "s"
                    } between everyone this week`
                  : "Nobody's trained this week yet"}
              </Micro>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </Panel>
      </motion.div>

      {/* Kept out of the way but not lost: the unit is the one thing that
          changes what every number above means. */}
      <p className="px-1">
        <Micro>Weights shown in {weightUnit}. Change it in Settings &rarr; Workout.</Micro>
      </p>
    </motion.div>
  );
}
