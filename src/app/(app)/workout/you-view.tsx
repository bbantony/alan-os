"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronRight,
  Dumbbell,
  Footprints,
  Play,
  Plus,
  RotateCcw,
  Trophy,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel, PanelHead, PanelRow, PanelEmpty } from "@/components/ui/panel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Micro, Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { fadeInUpVariants, staggerContainerVariants } from "@/lib/motion";
import { formatDuration, formatPace } from "@/lib/workout/format";
import { formatWeight } from "@/lib/workout/units";
import { PR_KIND_LABELS } from "@/lib/workout/pr";
import { suggestNextGroup } from "@/lib/workout/suggest";
import type { MuscleGroup, WeightUnit, WorkoutTemplate } from "@/lib/workout/types";
import { clearDraft, type RecordEntry, type SessionSummary, type WeekDay, type WorkoutDraft } from "./personal-actions";

/**
 * Your training, as the front page.
 *
 * The module used to open on the crew feed with your own sessions behind a
 * filter called "Mine" — so the first thing you saw when you opened Workout was
 * what other people had done. This is the other way round: what you've done
 * this week, what's been neglected, what you can start right now, and what your
 * records are. The crew is one tab away.
 *
 * Reading order is deliberate and matches how the question actually arrives:
 * am I mid-session → what has this week looked like → what should I do → what
 * have I been doing → what am I best at.
 */

function formatSessionDate(iso: string, todayIso: string): string {
  if (iso === todayIso) return "Today";
  const d = new Date(`${iso}T00:00:00Z`);
  const today = new Date(`${todayIso}T00:00:00Z`);
  const days = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (days === 1) return "Yesterday";
  if (days < 7) {
    return new Intl.DateTimeFormat("en-CA", { weekday: "long", timeZone: "UTC" }).format(d);
  }
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function formatElapsed(iso: string): string {
  const mins = minutesSince(iso);
  if (mins < 1) return "just started";
  if (mins < 60) return `${mins} min in`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m in`;
}

export function YouView({
  draft,
  week,
  sessions,
  records,
  templates,
  lastSession,
  lastTrainedByGroup,
  today,
  weightUnit,
  crewSessionsThisWeek,
  onShowCrew,
}: {
  draft: WorkoutDraft | null;
  week: WeekDay[];
  sessions: SessionSummary[];
  records: RecordEntry[];
  templates: WorkoutTemplate[];
  lastSession: { workoutDate: string; exerciseIds: string[] } | null;
  lastTrainedByGroup: Partial<Record<MuscleGroup, string>>;
  today: string;
  weightUnit: WeightUnit;
  crewSessionsThisWeek: number;
  onShowCrew: () => void;
}) {
  const router = useRouter();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const suggestion = suggestNextGroup(lastTrainedByGroup, today);
  const draftExerciseCount = draft?.payload.exercises?.length ?? 0;
  const draftSetCount =
    draft?.payload.exercises?.reduce((n, ex) => n + ex.sets.length, 0) ?? 0;

  async function handleDiscard() {
    setDiscarding(true);
    await clearDraft();
    setDiscarding(false);
    setConfirmDiscard(false);
    toast.success("Session discarded");
    router.refresh();
  }

  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-4"
    >
      {/* ---------------- Mid-session ----------------
          First on the screen when it applies, because if you're standing in a
          gym with a session half-logged, nothing else on this page matters.
          This is the payoff for persisting the draft at all. */}
      {draft && (
        <motion.div variants={fadeInUpVariants}>
          <Panel tone="raised" className="border-primary">
            <PanelHead
              title="Session in progress"
              count={`${draftSetCount} set${draftSetCount === 1 ? "" : "s"}`}
            />
            <div className="flex flex-col gap-3 px-3 py-3">
              <p className="text-sm">
                {draftExerciseCount > 0
                  ? `${draftExerciseCount} exercise${draftExerciseCount === 1 ? "" : "s"} so far`
                  : "Started, nothing logged yet"}
                <Micro className="ml-2">{formatElapsed(draft.startedAt)}</Micro>
              </p>
              <div className="flex gap-2">
                <Link href="/workout/new" className="flex-1">
                  <Button block>
                    <Play className="size-4" strokeWidth={3} />
                    Continue
                  </Button>
                </Link>
                <Button variant="outline" onClick={() => setConfirmDiscard(true)}>
                  Discard
                </Button>
              </div>
            </div>
          </Panel>
        </motion.div>
      )}

      {/* ---------------- This week ---------------- */}
      <motion.div variants={fadeInUpVariants}>
        <Panel>
          <PanelHead
            title="This week"
            count={`${week.filter((d) => d.trained).length} session${
              week.filter((d) => d.trained).length === 1 ? "" : "s"
            }`}
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

      {/* ---------------- Next up ----------------
          A suggestion drawn from what's been neglected, never a prescription:
          Alan trains to a rough plan and asked to be suggested to, not told.
          The three ways to start a session all live here now — they used to be
          buried one screen deeper, inside /workout/new. */}
      <motion.div variants={fadeInUpVariants}>
        <Panel>
          <PanelHead title="Next up" />

          {suggestion ? (
            <div className="flex items-center gap-3 border-b border-hairline px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="display-sm truncate">{suggestion.label}</p>
                <Micro className="mt-0.5 block">{suggestion.reason}</Micro>
              </div>
              <Link href={`/workout/new?muscle=${suggestion.group}`}>
                <Button>
                  <Plus className="size-4" strokeWidth={3} />
                  Start
                </Button>
              </Link>
            </div>
          ) : (
            <div className="border-b border-hairline px-3 py-3">
              <p className="text-sm">Nothing logged yet — start anywhere.</p>
              <Micro className="mt-0.5 block">
                Once you&rsquo;ve trained a few times this will point at whatever you&rsquo;ve
                been avoiding.
              </Micro>
            </div>
          )}

          {lastSession && (
            <PanelRow href="/workout/new?repeat=1">
              <span className="flex items-center gap-3">
                <RotateCcw className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">Repeat last session</span>
                  <Micro className="block truncate">
                    {lastSession.exerciseIds.length} exercises ·{" "}
                    {formatSessionDate(lastSession.workoutDate, today)}
                  </Micro>
                </span>
              </span>
            </PanelRow>
          )}

          {templates.map((t) => (
            <PanelRow key={t.id} href={`/workout/new?template=${t.id}`}>
              <span className="flex items-center gap-3">
                <Dumbbell className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{t.name}</span>
                  <Micro className="block truncate">{t.exercise_ids.length} exercises</Micro>
                </span>
              </span>
            </PanelRow>
          ))}

          <PanelRow href="/workout/new" last>
            <span className="flex items-center gap-3">
              <Plus className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.5} />
              <span className="text-sm font-semibold">Start from scratch</span>
            </span>
          </PanelRow>
        </Panel>
      </motion.div>

      {/* ---------------- Recent ---------------- */}
      <motion.div variants={fadeInUpVariants}>
        <Panel>
          <PanelHead title="Recent" count={sessions.length || undefined} />
          {sessions.length === 0 ? (
            <PanelEmpty>Nothing logged yet. Your sessions will build up here.</PanelEmpty>
          ) : (
            <ul>
              {sessions.map((s, i) => (
                <li
                  key={s.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5",
                    i > 0 && "border-t border-hairline"
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center border-2 border-rule">
                    {s.run ? (
                      <Footprints className="size-4" strokeWidth={2.5} />
                    ) : (
                      <Dumbbell className="size-4" strokeWidth={2.5} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {formatSessionDate(s.workout_date, today)}
                    </p>
                    <Micro className="block truncate">
                      {s.run
                        ? `${s.run.distance_km} km · ${formatDuration(s.run.duration_seconds)} · ${formatPace(
                            s.run.distance_km,
                            s.run.duration_seconds
                          )}`
                        : `${s.exerciseCount} exercise${s.exerciseCount === 1 ? "" : "s"} · ${s.setCount} set${
                            s.setCount === 1 ? "" : "s"
                          }`}
                    </Micro>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </motion.div>

      {/* ---------------- Records ----------------
          The prs table has been filling up since Phase 2 and has never been
          visible outside the instant a record was set. Every row is a door into
          that exercise's whole history. */}
      <motion.div variants={fadeInUpVariants}>
        <Panel>
          <PanelHead title="Records" count={records.length || undefined} />
          {records.length === 0 ? (
            <PanelEmpty>
              Log the same lift twice and the second one starts setting records.
            </PanelEmpty>
          ) : (
            <ul>
              {records.map((r, i) => (
                <li key={r.exerciseId} className={cn(i > 0 && "border-t border-hairline")}>
                  <Link
                    href={`/workout/exercise/${r.exerciseId}`}
                    className="tap-press flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted"
                  >
                    <Trophy className="size-4 shrink-0 text-accent" strokeWidth={2.5} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{r.exerciseName}</span>
                      <Micro className="block truncate">{PR_KIND_LABELS[r.kind]}</Micro>
                    </span>
                    <span className="stat shrink-0 text-base">
                      {r.kind === "volume"
                        ? `${Math.round(
                            weightUnit === "lbs" ? r.value * 2.2046226218 : r.value
                          ).toLocaleString()} ${weightUnit}`
                        : formatWeight(r.value, weightUnit)}
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      strokeWidth={2.5}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </motion.div>

      {/* ---------------- Crew ----------------
          One quiet row. The crew still exists, still has its feed and its
          leaderboard — it just isn't the first thing you see any more. */}
      <motion.div variants={fadeInUpVariants}>
        <Panel>
          <button
            type="button"
            onClick={onShowCrew}
            className="tap-press flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Crew</span>
              <Micro className="block">
                {crewSessionsThisWeek > 0
                  ? `${crewSessionsThisWeek} session${crewSessionsThisWeek === 1 ? "" : "s"} this week`
                  : "Nothing logged this week"}
              </Micro>
            </span>
            <Tag>Feed</Tag>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.5} />
          </button>
        </Panel>
      </motion.div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this session?"
        description="Everything logged in it so far goes. This can't be undone."
        detail={
          draftSetCount > 0
            ? `${draftSetCount} set${draftSetCount === 1 ? "" : "s"} will be lost.`
            : undefined
        }
        confirmLabel="Discard"
        pending={discarding}
        onConfirm={handleDiscard}
        onCancel={() => setConfirmDiscard(false)}
      />
    </motion.div>
  );
}
