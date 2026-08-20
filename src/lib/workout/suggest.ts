import { MUSCLE_GROUP_LABELS, type MuscleGroup } from "./types";

// "What should I train today?" — answered by neglect, not by a programme.
//
// Alan trains to a rough plan rather than a fixed split, and asked for the app
// to suggest rather than dictate. So this doesn't own a schedule, doesn't know
// what week it is, and can't be wrong about a routine it was never told about.
// It answers one narrow question from what actually happened: which muscle
// group has gone longest without being trained.
//
// Pure functions on plain dates — no database, no timezone reasoning (a
// training day is a calendar day), so the ranking can be checked on its own.

/** Groups a suggestion will actually name. `other` is excluded — see below. */
const SUGGESTABLE: MuscleGroup[] = ["chest", "back", "shoulders", "arms", "legs", "core"];

export interface GroupRecency {
  group: MuscleGroup;
  /** YYYY-MM-DD of the last session touching this group, or null for never. */
  lastTrained: string | null;
  /** Days since, or null when never trained. */
  daysSince: number | null;
}

export interface Suggestion {
  group: MuscleGroup;
  label: string;
  /** The line shown under the heading. */
  reason: string;
  daysSince: number | null;
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000
  );
}

/**
 * Ranks every muscle group by how long it's been neglected, longest first.
 *
 * A group never trained at all sorts above one trained a month ago: "you've
 * never done this" is a stronger reason to do it than "it's been a while". The
 * order within never-trained groups follows SUGGESTABLE, which is a stable,
 * deliberate order rather than whatever the database happened to return —
 * otherwise the suggestion would flicker between equally-neglected groups on
 * every page load, which reads as the app being indecisive.
 */
export function rankByNeglect(
  lastTrainedByGroup: Partial<Record<MuscleGroup, string>>,
  today: string
): GroupRecency[] {
  return SUGGESTABLE.map((group) => {
    const lastTrained = lastTrainedByGroup[group] ?? null;
    return {
      group,
      lastTrained,
      daysSince: lastTrained ? daysBetween(lastTrained, today) : null,
    };
  }).sort((a, b) => {
    if (a.daysSince === null && b.daysSince === null) {
      return SUGGESTABLE.indexOf(a.group) - SUGGESTABLE.indexOf(b.group);
    }
    if (a.daysSince === null) return -1;
    if (b.daysSince === null) return 1;
    return b.daysSince - a.daysSince;
  });
}

/**
 * The one group to lead with, phrased for a person.
 *
 * Returns null when there is no training history at all — with nothing logged,
 * every group is equally neglected and picking one would be inventing advice.
 * The screen shows a "log your first session" prompt in that case instead.
 */
export function suggestNextGroup(
  lastTrainedByGroup: Partial<Record<MuscleGroup, string>>,
  today: string
): Suggestion | null {
  const trainedAnything = Object.keys(lastTrainedByGroup).length > 0;
  if (!trainedAnything) return null;

  const [top] = rankByNeglect(lastTrainedByGroup, today);
  if (!top) return null;

  const label = MUSCLE_GROUP_LABELS[top.group];
  if (top.daysSince === null) {
    return { group: top.group, label, reason: "You haven't trained this yet", daysSince: null };
  }
  if (top.daysSince === 0) {
    return { group: top.group, label, reason: "Trained today — you're on top of it", daysSince: 0 };
  }
  if (top.daysSince === 1) {
    return { group: top.group, label, reason: "Trained yesterday", daysSince: 1 };
  }
  return {
    group: top.group,
    label,
    reason: `${top.daysSince} days since you trained this`,
    daysSince: top.daysSince,
  };
}
