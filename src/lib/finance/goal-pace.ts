// Turning a savings goal into something that actually happens.
//
// A goal with a target and a deadline is a wish until it's a number per week
// and something that puts that number aside. This is the arithmetic half;
// `goal-actions.ts` is the half that offers to set it up.
//
// Pure, no database — the maths people will check against their own head.

export interface GoalPace {
  /** Whole weeks left, at least 1 — you can't save over zero weeks. */
  weeksLeft: number;
  remainingCents: number;
  /** What you'd need to put aside each week to land on the deadline. */
  perWeekCents: number;
  perMonthCents: number;
  /** True when the deadline has passed or is today. */
  overdue: boolean;
  /** True when there's nothing left to save. */
  reached: boolean;
}

export function goalPace(input: {
  targetCents: number;
  savedCents: number;
  deadline: string | null;
  today: string;
}): GoalPace | null {
  // No deadline, no pace. "Save £3,000 eventually" has no per-week answer, and
  // inventing one by picking a horizon would be the app deciding something the
  // person deliberately left open.
  if (!input.deadline) return null;

  const remainingCents = Math.max(0, input.targetCents - input.savedCents);
  const days = Math.round(
    (new Date(`${input.deadline}T00:00:00Z`).getTime() -
      new Date(`${input.today}T00:00:00Z`).getTime()) /
      86400000
  );

  const reached = remainingCents === 0;
  const overdue = days <= 0;
  // Clamped to one week rather than zero: a deadline that's passed still wants
  // a sensible "you'd need this much" figure instead of a division by zero.
  const weeksLeft = Math.max(1, Math.ceil(days / 7));

  return {
    weeksLeft,
    remainingCents,
    perWeekCents: reached ? 0 : Math.ceil(remainingCents / weeksLeft),
    // 52/12 weeks in a month, not 4 — using 4 quietly overstates what's needed
    // by about 8%, which over a year is a month's worth of saving.
    perMonthCents: reached ? 0 : Math.ceil((remainingCents / weeksLeft) * (52 / 12)),
    overdue,
    reached,
  };
}
