import { test } from "node:test";
import assert from "node:assert/strict";

import { nextReminderState, snoozeTargetFor } from "../src/lib/reminders/anchor.ts";
import type { ReminderAnchorRow } from "../src/lib/reminders/anchor.ts";
import { utcToZonedParts, APP_TIMEZONE } from "../src/lib/time.ts";
import {
  DEFAULT_MORNING_HOUR,
  morningHourFor,
  snoozeUntilUtc,
} from "../src/lib/reminders/snooze.ts";
import { DEFAULT_PREFERENCES } from "../src/lib/preferences.ts";
import type { NotificationPreferences } from "../src/lib/preferences.ts";

/**
 * Reminder anchoring — "snooze moves this occurrence, never the series".
 *
 * Same charter as money-and-units.test.mts and streaks-and-recurrence.test.mts:
 * every case here is a bug that WAS REAL in this codebase, not a coverage
 * exercise. Two of them shipped together, both caused by the same thing —
 * `reminders.remind_at` is a MUTABLE next-fire pointer (migration 0011), snooze
 * writes straight to it, and every site that advanced a repeating reminder used
 * to step from that pointer:
 *
 *  1. THE DRIFT. Snooze a daily 07:00 nudge by an hour and you got it at 08:05
 *     today and at 08:05 tomorrow — and 09:05 the day after that if you snoozed
 *     again. The repeat PATTERN survived (the reminder carries a copy of its
 *     parent's rrule) but the TIME OF DAY only ever lived on the parent row, so
 *     it was lost the moment the pointer moved.
 *
 *  2. THE EATEN OCCURRENCE. The dispatcher advances remind_at AFTER sending the
 *     push, so a notification's Snooze button lands on a row already pointing at
 *     the NEXT real occurrence and overwrites it. Stepping from the snoozed
 *     pointer skipped that occurrence permanently.
 *
 * nextReminderState fixes both by recomputing from the parent (routine rrule +
 * time_of_day, or task due_at minus notify_offset_minutes) instead of stepping
 * from wherever the pointer happens to be sitting.
 *
 * A third bug was found BY these tests rather than before them: an rrule that
 * wouldn't parse threw out of nextReminderState entirely, so one corrupt row
 * would have stopped the dispatcher sending to any row after it. It now goes
 * quiet, reported as `from: "unreadable"` — see section 8.
 *
 * Fixture dates are real 2026 dates, verified against the calendar:
 * 2026-08-26 and 2026-09-02 are Wednesdays; 2026-09-04 is a Friday. Timezone
 * expectations assume APP_TIMEZONE is America/Winnipeg, where DST runs from
 * Sun 8 Mar 2026 to Sun 1 Nov 2026 — CDT (UTC-5) inside that, CST (UTC-6)
 * outside it. So 07:00 local is 12:00Z in September and 13:00Z in November.
 *
 * Every timing assertion checks BOTH the exact instant and the wall-clock time
 * it lands on in the app timezone. The instant alone would happily pass a
 * reminder that had silently slid an hour across a DST boundary.
 */

/** The zoned wall clock a stored instant actually shows up as on Alan's phone. */
function wallClock(iso: string | null) {
  assert.ok(iso, "expected an instant, got null");
  return utcToZonedParts(new Date(iso), APP_TIMEZONE);
}

/** Hours between two instants — how DST shows itself in a "daily" reminder. */
function hoursBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 3_600_000;
}

// A routine reminder: "every day at 07:00" — the shape the get_reminder_anchors
// RPC (migration 0039) returns. The reminder's own rrule is a copy of the
// routine's; only the routine knows the time of day.
const DAILY_0700: ReminderAnchorRow = {
  rrule: "RRULE:FREQ=DAILY",
  remind_at: "2026-09-02T12:00:00Z", // Wed 2 Sep, 07:00 Winnipeg (CDT)
  linked_task_id: null,
  linked_routine_id: "routine-1",
  routine_rrule: "RRULE:FREQ=DAILY",
  routine_time_of_day: "07:00:00",
};

// A task reminder: a weekly Wednesday task, nudged some minutes before due.
const WEEKLY_TASK: ReminderAnchorRow = {
  rrule: "RRULE:FREQ=WEEKLY;BYDAY=WE",
  remind_at: "2026-08-26T22:00:00Z",
  linked_task_id: "task-1",
  linked_routine_id: null,
  task_due_at: "2026-08-26T23:00:00Z", // Wed 26 Aug, 18:00 Winnipeg
  task_notify_offset_minutes: 60,
};

// ---------------------------------------------------------------------------
// 1. The drift: a snooze must not re-anchor the series
// ---------------------------------------------------------------------------

test("a daily 07:00 routine nudge snoozed to 08:05 comes back at 07:00 tomorrow, not 08:05", () => {
  // The row is mid-snooze: remind_at has been dragged to 08:05 local. The old
  // code stepped from that pointer and returned Thu 3 Sep at 08:05 — the time
  // of day permanently moved by one snooze, and again by every later one.
  const snoozedPointer = "2026-09-02T13:05:00Z"; // Wed 2 Sep, 08:05 Winnipeg
  const now = new Date(snoozedPointer);

  const next = nextReminderState({ ...DAILY_0700, remind_at: snoozedPointer }, now);

  assert.equal(next.remindAt, "2026-09-03T12:00:00.000Z");
  assert.equal(next.status, "active");
  assert.equal(next.from, "routine");

  const at = wallClock(next.remindAt);
  assert.equal(at.hour, 7);
  assert.equal(at.minute, 0);
  assert.equal(at.day, 3); // Thu 3 Sep

  // Exactly what the old stepping behaviour produced, pinned as forbidden.
  assert.notEqual(next.remindAt, "2026-09-03T13:05:00.000Z");
});

test("snoozing twice in a row still doesn't compound the drift", () => {
  // Second snooze: the pointer is now 09:05 local. Recomputing from the routine
  // ignores it completely, so the series never walks forward an hour a day.
  const twiceSnoozed = "2026-09-02T14:05:00Z"; // 09:05 Winnipeg
  const next = nextReminderState({ ...DAILY_0700, remind_at: twiceSnoozed }, new Date(twiceSnoozed));

  assert.equal(next.remindAt, "2026-09-03T12:00:00.000Z");
  assert.equal(wallClock(next.remindAt).hour, 7);
});

test("a routine slot still ahead of us today is kept, not skipped to tomorrow", () => {
  // 05:30 local on Wednesday: today's 07:00 hasn't happened yet, so that is the
  // answer. Blindly stepping one occurrence would have lost today entirely.
  const now = new Date("2026-09-02T10:30:00Z"); // 05:30 Winnipeg
  const next = nextReminderState({ ...DAILY_0700, remind_at: "2026-09-01T12:00:00Z" }, now);

  assert.equal(next.remindAt, "2026-09-02T12:00:00.000Z");
  const at = wallClock(next.remindAt);
  assert.equal(at.day, 2);
  assert.equal(at.hour, 7);
});

// ---------------------------------------------------------------------------
// 2. The eaten occurrence: the dispatcher advances before the snooze lands
// ---------------------------------------------------------------------------

test("a snooze that overwrites tomorrow's pointer doesn't delete tomorrow's 07:00", () => {
  // The real sequence, step by step:
  //   07:00 Wed  push sent, dispatcher advances remind_at to Thu 07:00.
  //   08:05 Wed  Alan taps "Snooze 1 hour" on the notification still on screen.
  const pointerAfterDispatch = "2026-09-03T12:00:00Z"; // Thu 3 Sep, 07:00 local
  const tapped = new Date("2026-09-02T13:05:00Z"); // 08:05 Wed
  const requested = new Date("2026-09-02T14:05:00Z"); // +1 hour

  // The snooze target wins here — tomorrow morning is not "sooner than an hour
  // from now", so there is nothing nearer to protect. The row now points at a
  // one-off catch-up and tomorrow's real occurrence has been overwritten.
  const target = snoozeTargetFor(
    { rrule: DAILY_0700.rrule, remind_at: pointerAfterDispatch },
    requested,
    tapped
  );
  assert.equal(target.toISOString(), "2026-09-02T14:05:00.000Z");

  // ...and this is the repair. When the snoozed copy fires at 09:05, the next
  // state is recomputed from the routine, which puts Thu 07:00 back.
  const next = nextReminderState(
    { ...DAILY_0700, remind_at: target.toISOString() },
    new Date("2026-09-02T14:05:00Z")
  );

  assert.equal(next.remindAt, "2026-09-03T12:00:00.000Z");
  assert.equal(next.from, "routine");
  const at = wallClock(next.remindAt);
  assert.equal(at.day, 3);
  assert.equal(at.hour, 7);

  // The old code stepped from the snoozed pointer and produced Thu 09:05:
  // tomorrow's 07:00 gone for good AND the time of day moved. Both forbidden.
  assert.notEqual(next.remindAt, "2026-09-03T14:05:00.000Z");
});

// ---------------------------------------------------------------------------
// 3. snoozeTargetFor: never write past a nearer real occurrence
// ---------------------------------------------------------------------------

test("a genuine occurrence due sooner than the snooze target survives the snooze", () => {
  // 06:05 local, next real fire 07:00 (55 minutes away). "Remind me in an hour"
  // would land at 07:05 — an hour of quiet bought by deleting the 07:00.
  const kept = snoozeTargetFor(
    { rrule: "RRULE:FREQ=DAILY", remind_at: "2026-09-02T12:00:00Z" },
    new Date("2026-09-02T12:05:00Z"),
    new Date("2026-09-02T11:05:00Z")
  );
  assert.equal(kept.toISOString(), "2026-09-02T12:00:00.000Z");
  assert.equal(wallClock(kept.toISOString()).hour, 7);
});

test("a pointer already in the past is not 'nearer' — the snooze target wins", () => {
  // The overdue pointer is what fired in the first place; keeping it would mean
  // snooze did nothing at all and the reminder re-fired on the very next tick.
  const moved = snoozeTargetFor(
    { rrule: "RRULE:FREQ=DAILY", remind_at: "2026-09-02T10:00:00Z" },
    new Date("2026-09-02T12:05:00Z"),
    new Date("2026-09-02T11:05:00Z")
  );
  assert.equal(moved.toISOString(), "2026-09-02T12:05:00.000Z");
});

test("a one-off has no series to protect, so the snooze target always wins", () => {
  const moved = snoozeTargetFor(
    { rrule: null, remind_at: "2026-09-02T12:00:00Z" },
    new Date("2026-09-02T12:05:00Z"),
    new Date("2026-09-02T11:05:00Z")
  );
  assert.equal(moved.toISOString(), "2026-09-02T12:05:00.000Z");
});

test("an unreadable pointer can't block a snooze", () => {
  const moved = snoozeTargetFor(
    { rrule: "RRULE:FREQ=DAILY", remind_at: "not-a-timestamp" },
    new Date("2026-09-02T12:05:00Z"),
    new Date("2026-09-02T11:05:00Z")
  );
  assert.equal(moved.toISOString(), "2026-09-02T12:05:00.000Z");
});

// ---------------------------------------------------------------------------
// 4. Task-linked anchor: due_at minus the nudge offset
// ---------------------------------------------------------------------------

test("a task nudge already in the future is used as-is, not stepped a week on", () => {
  // completeTask rolls due_at forward, so a task anchor is usually ALREADY the
  // next occurrence. Stepping it again would silently skip a whole cycle.
  const next = nextReminderState(
    {
      ...WEEKLY_TASK,
      task_due_at: "2026-09-04T23:00:00Z", // Fri 4 Sep, 18:00 Winnipeg
      task_notify_offset_minutes: 30,
    },
    new Date("2026-09-02T12:00:00Z")
  );

  assert.equal(next.remindAt, "2026-09-04T22:30:00.000Z");
  assert.equal(next.from, "task");
  const at = wallClock(next.remindAt);
  assert.equal(at.day, 4);
  assert.equal(at.hour, 17);
  assert.equal(at.minute, 30); // 30 minutes before 18:00
});

test("a task nudge that's already behind us rolls forward to the next occurrence", () => {
  // Due last Wednesday at 18:00, nudge an hour before = 17:00. It is now the
  // following Wednesday lunchtime, so the answer is today at 17:00.
  const next = nextReminderState(WEEKLY_TASK, new Date("2026-09-02T12:00:00Z"));

  assert.equal(next.remindAt, "2026-09-02T22:00:00.000Z");
  assert.equal(next.from, "task");
  const at = wallClock(next.remindAt);
  assert.equal(at.day, 2);
  assert.equal(at.hour, 17);
});

test("a zero-minute offset means 'at the time', not 'no nudge'", () => {
  // 0 is falsy; treating it as absent would drop the anchor and fall back to
  // stepping the pointer, quietly losing the task's real due time.
  const next = nextReminderState(
    { ...WEEKLY_TASK, task_notify_offset_minutes: 0 },
    new Date("2026-09-02T12:00:00Z")
  );

  assert.equal(next.remindAt, "2026-09-02T23:00:00.000Z");
  assert.equal(next.from, "task");
  assert.equal(wallClock(next.remindAt).hour, 18); // exactly when it's due
});

// ---------------------------------------------------------------------------
// 5. Orphans (migration 0022's invariant)
// ---------------------------------------------------------------------------

test("a reminder linked to neither a task nor a routine is retired, never rescheduled", () => {
  // The point of 0022: an orphan has nothing left to trace it back to, so it
  // fires forever with no way to turn it off from any screen in the app. Its
  // own rrule is deliberately ignored here.
  const next = nextReminderState(
    {
      rrule: "RRULE:FREQ=DAILY",
      remind_at: "2026-09-02T12:00:00Z",
      linked_task_id: null,
      linked_routine_id: null,
      routine_rrule: "RRULE:FREQ=DAILY",
      routine_time_of_day: "07:00:00",
    },
    new Date("2026-09-02T13:00:00Z")
  );

  assert.deepEqual(next, { remindAt: null, status: "done", from: "orphan" });
  assert.equal(next.remindAt, null); // above all: no future instant, ever
});

// ---------------------------------------------------------------------------
// 6. One-offs
// ---------------------------------------------------------------------------

test("a one-off reminder is finished the moment it fires", () => {
  const next = nextReminderState({ ...DAILY_0700, rrule: null }, new Date("2026-09-02T13:00:00Z"));
  assert.deepEqual(next, { remindAt: null, status: "done", from: "one_off" });
});

// ---------------------------------------------------------------------------
// 7. Rules that have run out, and the fallback when a parent has no anchor
// ---------------------------------------------------------------------------

// A routine that has lost its time of day: the parent still exists, so this is
// not an orphan, but there is no wall clock to anchor to. The fallback rolls
// forward from the pointer instead.
const NO_TIME_OF_DAY: ReminderAnchorRow = {
  ...DAILY_0700,
  routine_time_of_day: null,
};

test("a COUNT rule that has run out retires the reminder instead of looping", () => {
  const next = nextReminderState(
    { ...NO_TIME_OF_DAY, rrule: "RRULE:FREQ=DAILY;COUNT=1" },
    new Date("2026-09-02T13:00:00Z")
  );
  assert.deepEqual(next, { remindAt: null, status: "done", from: "exhausted" });
});

test("an UNTIL rule that has expired retires the reminder too", () => {
  const next = nextReminderState(
    { ...NO_TIME_OF_DAY, rrule: "RRULE:FREQ=DAILY;UNTIL=20260902T235959Z" },
    new Date("2026-09-02T13:00:00Z")
  );
  assert.deepEqual(next, { remindAt: null, status: "done", from: "exhausted" });
});

test("a reminder recovered after a week of downtime jumps to the next real slot, not a week of catch-ups", () => {
  // Pointer a week stale. Rolling forward (rather than stepping once) is what
  // stops the dispatcher firing seven backdated copies on the tick after the
  // pinger comes back up.
  const next = nextReminderState(
    { ...NO_TIME_OF_DAY, remind_at: "2026-08-26T12:00:00Z" },
    new Date("2026-09-02T13:00:00Z")
  );

  assert.equal(next.remindAt, "2026-09-03T12:00:00.000Z");
  assert.equal(next.status, "active");
  assert.equal(next.from, "fallback");
  assert.equal(wallClock(next.remindAt).hour, 7);
});

// ---------------------------------------------------------------------------
// 8. Bad data must not take a whole dispatch batch down
// ---------------------------------------------------------------------------

test("a routine with an unreadable rrule falls back instead of throwing", () => {
  // The dispatcher walks every due reminder in one loop, so an exception on row
  // 3 means rows 4..n never get sent. Here only the PARENT's rule is unusable
  // and the reminder's own copy is still fine, so there is a real schedule left
  // to fall back to. When BOTH are unreadable — the commoner shape, since a
  // reminder's rrule is only ever a copy of its parent's — there is nothing to
  // fall back to and it goes quiet instead. That is the next test.
  const row: ReminderAnchorRow = { ...DAILY_0700, routine_rrule: "RRULE:FREQ=NONSENSE" };
  const now = new Date("2026-09-02T13:05:00Z");

  assert.doesNotThrow(() => nextReminderState(row, now));

  const next = nextReminderState(row, now);
  assert.equal(next.remindAt, "2026-09-03T12:00:00.000Z");
  assert.equal(next.status, "active");
  assert.equal(next.from, "fallback"); // parent unusable, so: step the pointer
  assert.equal(wallClock(next.remindAt).hour, 7);
});

test("a reminder whose own rule is unreadable too goes quiet instead of throwing", () => {
  // THE REALISTIC BROKEN ROW. `reminders.rrule` is only ever a copy of its
  // parent's, so a rule the parent can't parse is a rule the reminder can't
  // parse either. Both guards are needed: the parent parse fails, and then the
  // fallback re-parses the identical string. Unguarded, that second parse threw
  // straight out of nextReminderState and took every later row in the batch
  // with it — the one failure this helper exists to make impossible.
  const row: ReminderAnchorRow = {
    ...DAILY_0700,
    rrule: "RRULE:FREQ=NONSENSE",
    routine_rrule: "RRULE:FREQ=NONSENSE",
  };
  const now = new Date("2026-09-02T13:05:00Z");

  assert.doesNotThrow(() => nextReminderState(row, now));

  // Retired, not left active: advance_reminder coalesces a null remind_at (it
  // leaves the column alone), so an unschedulable reminder kept active would
  // hold a past pointer and re-fire on every single tick, forever.
  assert.deepEqual(nextReminderState(row, now), {
    remindAt: null,
    status: "done",
    from: "unreadable",
  });

  // Deliberately NOT "exhausted". Both stop the reminder, but a finished series
  // and a broken one need to stay tellable apart — by a reader now, or by a
  // repair script later.
  assert.notEqual(nextReminderState(row, now).from, "exhausted");
});

test("a task reminder with an unreadable rule goes quiet the same way", () => {
  // Task-linked rows land in the same place for the same reason: the anchor is
  // behind us, so advancing the series needs the rrule, which won't parse.
  const row: ReminderAnchorRow = { ...WEEKLY_TASK, rrule: "RRULE:FREQ=NONSENSE" };
  const now = new Date("2026-09-02T12:00:00Z");

  assert.doesNotThrow(() => nextReminderState(row, now));
  assert.deepEqual(nextReminderState(row, now), {
    remindAt: null,
    status: "done",
    from: "unreadable",
  });
});

test("an unreadable rule costs nothing while the task's own nudge is still ahead", () => {
  // The guard isn't over-eager. A task anchor already in the future is used
  // directly and the rrule is never parsed at all, so a broken rule only bites
  // once the series actually needs advancing.
  const next = nextReminderState(
    {
      ...WEEKLY_TASK,
      rrule: "RRULE:FREQ=NONSENSE",
      task_due_at: "2026-09-04T23:00:00Z", // Fri 4 Sep, 18:00 Winnipeg
      task_notify_offset_minutes: 30,
    },
    new Date("2026-09-02T12:00:00Z")
  );

  assert.equal(next.remindAt, "2026-09-04T22:30:00.000Z");
  assert.equal(next.from, "task");
  assert.equal(wallClock(next.remindAt).hour, 17);
});

test("a garbage routine time of day silently becomes midnight — known soft failure", () => {
  // PINNING CURRENT BEHAVIOUR, NOT BLESSING IT. firstReminderInstant does
  // `hh || 0` on the parsed hour, so an unreadable "HH:MM:SS" degrades to 00:00
  // instead of raising. The reminder then fires on all the right days at
  // midnight — wrong, but plausible enough that nobody would read it as
  // corruption. Seen and considered during the Wave 1B test pass and left
  // alone deliberately: the column is written by a time picker, so a bad value
  // shouldn't be able to reach it. If one ever does, this says what happens.
  const next = nextReminderState(
    { ...DAILY_0700, routine_time_of_day: "banana" },
    new Date("2026-09-02T13:05:00Z")
  );

  assert.equal(next.remindAt, "2026-09-03T05:00:00.000Z");
  assert.equal(next.status, "active");
  assert.equal(next.from, "routine");
  const at = wallClock(next.remindAt);
  assert.equal(at.day, 3);
  assert.equal(at.hour, 0);
  assert.equal(at.minute, 0);
});

// ---------------------------------------------------------------------------
// 9. DST: the wall clock is what's promised, not the instant
// ---------------------------------------------------------------------------

test("a daily 07:00 reminder crossing into CST still fires at 07:00, not 06:00", () => {
  // Sat 31 Oct is CDT (07:00 = 12:00Z); Sun 1 Nov 2026 the clocks go back, so
  // 07:00 is 13:00Z. Carrying the old offset over would have fired at 06:00 —
  // and kept doing it until March.
  const lastFire = "2026-10-31T12:00:00Z";
  const next = nextReminderState(
    { ...DAILY_0700, remind_at: lastFire },
    new Date("2026-10-31T12:30:00Z")
  );

  assert.equal(next.remindAt, "2026-11-01T13:00:00.000Z");
  const at = wallClock(next.remindAt);
  assert.equal(at.month, 11);
  assert.equal(at.day, 1);
  assert.equal(at.hour, 7);
  assert.equal(at.minute, 0);
  // The "daily" gap really is 25 hours here. That is the whole point: the app
  // keeps the wall clock, not a fixed 24-hour interval.
  assert.equal(hoursBetween(lastFire, next.remindAt!), 25);
});

test("and crossing into CDT it fires at 07:00 too, not 08:00", () => {
  // Sat 7 Mar is CST (07:00 = 13:00Z); Sun 8 Mar 2026 the clocks go forward, so
  // 07:00 is 12:00Z and the gap is 23 hours.
  const lastFire = "2026-03-07T13:00:00Z";
  const next = nextReminderState(
    { ...DAILY_0700, remind_at: lastFire },
    new Date("2026-03-07T13:30:00Z")
  );

  assert.equal(next.remindAt, "2026-03-08T12:00:00.000Z");
  const at = wallClock(next.remindAt);
  assert.equal(at.month, 3);
  assert.equal(at.day, 8);
  assert.equal(at.hour, 7);
  assert.equal(hoursBetween(lastFire, next.remindAt!), 23);
});

// ---------------------------------------------------------------------------
// 10. "In the morning" — which morning, and at what hour
// ---------------------------------------------------------------------------
//
// The morning preset is the only snooze choice that isn't plain arithmetic, and
// it had a real bug in it: `morningHourFor` returned `Math.max(8, quietHoursEnd)`
// whenever quiet hours were on, which silently assumed every quiet window runs
// overnight. Settings offers both ends as free 0-23 choices, so a window of
// 13:00-18:00 turned "in the morning" into 18:00 — the evening. 8am is nowhere
// near that window and never needed moving.
//
// The rule is now: defer past the window ONLY when 8am is genuinely inside it,
// asked of `isQuietHour` (the same function the dispatcher holds against) so
// the wrap past midnight is handled in exactly one place.

/** Alan's shipped defaults, with the notification bits overridable per case. */
function prefsWith(overrides: Partial<NotificationPreferences>): NotificationPreferences {
  return { ...DEFAULT_PREFERENCES.notifications, ...overrides };
}

test("no quiet hours at all means the morning is 8am", () => {
  assert.equal(morningHourFor(prefsWith({ quietHoursEnabled: false })), DEFAULT_MORNING_HOUR);
  // Even with a window configured — switched off is switched off.
  assert.equal(
    morningHourFor(prefsWith({ quietHoursEnabled: false, quietHoursStart: 13, quietHoursEnd: 18 })),
    8
  );
});

test("an overnight window that runs past 8am pushes the morning to when sound is allowed again", () => {
  // 22:00-09:00. 8am is inside it, so a nudge scheduled for 8am would be HELD
  // by the dispatcher and arrive at 9 anyway. Better to say 9 and mean it.
  const prefs = prefsWith({ quietHoursStart: 22, quietHoursEnd: 9 });
  assert.equal(morningHourFor(prefs), 9);
});

test("Alan's own 22:00-07:00 window leaves the morning at 8am", () => {
  assert.equal(morningHourFor(DEFAULT_PREFERENCES.notifications), 8);
});

test("a DAYTIME quiet window doesn't drag the morning into the evening", () => {
  // THE BUG. 13:00-18:00 is a perfectly legal window and 8am is nowhere in it,
  // but the old Math.max(8, 18) made "in the morning" mean 18:00.
  const prefs = prefsWith({ quietHoursStart: 13, quietHoursEnd: 18 });
  assert.equal(morningHourFor(prefs), 8);
});

test("and the whole snooze lands next morning, not this evening", () => {
  // Same 13:00-18:00 window. 09:00 local on Wed 2 Sep 2026 (CDT, UTC-5) is past
  // the morning hour, so "in the morning" is tomorrow's — Thu 3 Sep at 08:00
  // local = 13:00Z. The old rule put it at 18:00 TODAY: the same day's evening,
  // nine hours away, from a button that says morning.
  const prefs = prefsWith({ quietHoursStart: 13, quietHoursEnd: 18 });
  const until = snoozeUntilUtc(
    "tomorrow_morning",
    prefs,
    APP_TIMEZONE,
    new Date("2026-09-02T14:00:00Z")
  );

  assert.equal(until.toISOString(), "2026-09-03T13:00:00.000Z");
  const at = wallClock(until.toISOString());
  assert.equal(at.day, 3);
  assert.equal(at.hour, 8);
});

test("snoozed at 2am, 'in the morning' is the morning a few hours away, not the one 30 hours away", () => {
  // 07:00Z on Wed 2 Sep is 02:00 local. The morning hasn't happened yet, so it
  // is TODAY's 08:00 local (13:00Z) — the label is "In the morning" rather than
  // "Tomorrow morning" precisely so this case can be honest.
  const until = snoozeUntilUtc(
    "tomorrow_morning",
    prefsWith({ quietHoursEnabled: false }),
    APP_TIMEZONE,
    new Date("2026-09-02T07:00:00Z")
  );

  assert.equal(until.toISOString(), "2026-09-02T13:00:00.000Z");
  const at = wallClock(until.toISOString());
  assert.equal(at.day, 2);
  assert.equal(at.hour, 8);
});

test("snoozed at 07:30 on an overnight window, it waits for the window to end today", () => {
  // 22:00-09:00, snoozed at 12:30Z = 07:30 local. The morning hour is 9 (inside
  // the window at 8), and 07:30 is before it, so this is a 90-minute wait for
  // today's 09:00 — not a day and a half.
  const until = snoozeUntilUtc(
    "tomorrow_morning",
    prefsWith({ quietHoursStart: 22, quietHoursEnd: 9 }),
    APP_TIMEZONE,
    new Date("2026-09-02T12:30:00Z")
  );

  assert.equal(until.toISOString(), "2026-09-02T14:00:00.000Z");
  const at = wallClock(until.toISOString());
  assert.equal(at.day, 2);
  assert.equal(at.hour, 9);
});

test("the minute presets stay plain arithmetic, quiet hours or not", () => {
  // Quiet hours are the dispatcher's business for these — a 10-minute snooze
  // means ten minutes, and the hold happens at send time if it has to.
  const now = new Date("2026-09-02T07:00:00Z");
  assert.equal(
    snoozeUntilUtc(10, DEFAULT_PREFERENCES.notifications, APP_TIMEZONE, now).toISOString(),
    "2026-09-02T07:10:00.000Z"
  );
  assert.equal(
    snoozeUntilUtc(240, DEFAULT_PREFERENCES.notifications, APP_TIMEZONE, now).toISOString(),
    "2026-09-02T11:00:00.000Z"
  );
});

// ---------------------------------------------------------------------------
// 11. "Every N days" counted from the right day (migration 0040)
// ---------------------------------------------------------------------------

/**
 * A repeat rule is only half a schedule. "Every 3 days" says nothing until you
 * say every 3 days FROM WHEN, and that start date is what picks Tue/Fri/Mon out
 * of the calendar rather than Wed/Sat/Tue. A routine has always answered it with
 * its own created_at — both the "is it due today" filter and the streak maths in
 * routines/actions.ts anchor there. The reminder side did not: it anchored on
 * TODAY, whatever today happened to be.
 *
 * That only shows up on rules that care where they started. Plain daily,
 * weekdays, weekly-on-a-named-day and monthly-on-a-date all produce the same
 * days from any start, so the two sides agreed by luck. FREQ=DAILY;INTERVAL=n —
 * what the routine form calls "every N days" — does not, and the disagreement
 * begins the moment a reminder is dealt with on a day the routine is not due,
 * which is exactly what an overnight snooze causes.
 *
 * Fixture calendar, verified: Tue 1 Sep 2026, Fri 4th, Sat 5th, Mon 7th, Tue 8th.
 */
const EVERY_3_DAYS_0700: ReminderAnchorRow = {
  rrule: "RRULE:FREQ=DAILY;INTERVAL=3",
  remind_at: "2026-09-05T13:05:00Z", // dragged to Sat 5 Sep, 08:05 Winnipeg
  linked_task_id: null,
  linked_routine_id: "routine-3",
  routine_rrule: "RRULE:FREQ=DAILY;INTERVAL=3",
  routine_time_of_day: "07:00:00",
  routine_created_at: "2026-09-01T15:20:00Z", // created Tue 1 Sep -> due 1, 4, 7, 10
};

test("an every-3-days routine snoozed onto a non-due day comes back on Mon 7th, not Tue 8th", () => {
  // The reminder fired on Fri 4 Sep (a true due day) and was snoozed overnight
  // into Sat 5th. Saturday is NOT a day this routine is due — so anchoring the
  // recomputation on "today" made Saturday day zero and put the next fire on
  // Tue 8 Sep, a day the routine itself would not tick off, and every later
  // recomputation kept the shift. With the routine's own start date supplied,
  // the series is counted from Tue 1 Sep where it always was.
  const now = new Date("2026-09-05T13:05:00Z"); // Sat 5 Sep, 08:05 Winnipeg
  const next = nextReminderState(EVERY_3_DAYS_0700, now);

  assert.equal(next.remindAt, "2026-09-07T12:00:00.000Z");
  assert.equal(next.status, "active");
  assert.equal(next.from, "routine");

  const at = wallClock(next.remindAt);
  assert.equal(at.day, 7); // Mon 7 Sep — a day the routine agrees is due
  assert.equal(at.hour, 7);
  assert.equal(at.minute, 0);
});

test("without the routine's start date the same row still lands on the wrong day — which is the bug", () => {
  // PINNING THE FALLBACK, NOT BLESSING IT. `routine_created_at` arrives from
  // get_reminder_anchors (migration 0040); a row built without it keeps the old
  // today-anchored behaviour rather than throwing, so a dispatcher running
  // against a database where 0040 has not been applied yet still sends
  // reminders — on the old, slightly wrong days. This test is here so that if
  // the column ever silently stops being selected, the difference is visible
  // instead of showing up as a reminder quietly arriving a day late.
  const now = new Date("2026-09-05T13:05:00Z");
  const next = nextReminderState({ ...EVERY_3_DAYS_0700, routine_created_at: null }, now);

  assert.equal(next.remindAt, "2026-09-08T12:00:00.000Z");
  assert.equal(wallClock(next.remindAt).day, 8); // Tue 8th: counted from Saturday
});

test("on a true due day the morning's own slot is still used, not skipped to the next cycle", () => {
  // The start date must not make the rule stricter than it was. Woken at 06:00
  // on Mon 7 Sep — a due day whose 07:00 has not happened yet — the answer is
  // this morning, an hour away, not the 10th.
  const next = nextReminderState(
    { ...EVERY_3_DAYS_0700, remind_at: "2026-09-07T11:00:00Z" },
    new Date("2026-09-07T11:00:00Z") // Mon 7 Sep, 06:00 Winnipeg
  );

  assert.equal(next.remindAt, "2026-09-07T12:00:00.000Z");
  const at = wallClock(next.remindAt);
  assert.equal(at.day, 7);
  assert.equal(at.hour, 7);
});

test("a plain daily routine answers identically with or without a start date", () => {
  // The control. Daily ignores where it started, so supplying the start date
  // must change nothing at all — if this ever moves, the fix has leaked into
  // rules it has no business touching.
  const now = new Date("2026-09-02T13:05:00Z"); // Wed 2 Sep, 08:05 Winnipeg
  const anchored = nextReminderState(
    { ...DAILY_0700, routine_created_at: "2026-08-11T02:00:00Z" },
    now
  );
  const unanchored = nextReminderState(DAILY_0700, now);

  assert.equal(anchored.remindAt, "2026-09-03T12:00:00.000Z");
  assert.equal(anchored.remindAt, unanchored.remindAt);
  assert.equal(wallClock(anchored.remindAt).hour, 7);
});

test("a weekly-on-Wednesday routine answers identically with or without a start date", () => {
  // Second control, on a rule whose start date is a Tuesday: BYDAY names the
  // day outright, so Wednesday it is either way.
  const weekly = {
    ...DAILY_0700,
    rrule: "RRULE:FREQ=WEEKLY;BYDAY=WE",
    routine_rrule: "RRULE:FREQ=WEEKLY;BYDAY=WE",
  };
  const now = new Date("2026-09-02T13:05:00Z"); // Wed 2 Sep, after its 07:00
  const anchored = nextReminderState({ ...weekly, routine_created_at: "2026-08-11T02:00:00Z" }, now);
  const unanchored = nextReminderState(weekly, now);

  assert.equal(anchored.remindAt, "2026-09-09T12:00:00.000Z"); // Wed 9 Sep
  assert.equal(anchored.remindAt, unanchored.remindAt);
  assert.equal(wallClock(anchored.remindAt).hour, 7);
});

test("a start date does not reintroduce the DST slide", () => {
  // Section 9's case, run through the anchored path: Sun 1 Nov 2026 the clocks
  // go back, so 07:00 local is 13:00Z rather than 12:00Z. Carrying the old
  // offset over would fire at 06:00 and keep doing it until March.
  const next = nextReminderState(
    {
      ...DAILY_0700,
      remind_at: "2026-10-31T12:00:00Z",
      routine_created_at: "2026-08-11T02:00:00Z",
    },
    new Date("2026-10-31T12:30:00Z")
  );

  assert.equal(next.remindAt, "2026-11-01T13:00:00.000Z");
  const at = wallClock(next.remindAt);
  assert.equal(at.day, 1);
  assert.equal(at.hour, 7);
});
