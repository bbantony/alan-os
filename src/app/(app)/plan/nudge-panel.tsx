"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlarmClock, Bell, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel, PanelHead, PanelEmpty } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { listItemVariants, LIST_ITEM_TRANSITION, MECHANICAL } from "@/lib/motion";
import { describeNudge } from "@/lib/tasks/nudge";
import { describeRRule } from "@/lib/reminders/rrule";
import {
  SNOOZE_PRESETS,
  describeLanding,
  describeSnooze,
  snoozeUntilUtc,
  type SnoozePreset,
} from "@/lib/reminders/snooze";
import type { NotificationPreferences } from "@/lib/preferences";
import {
  addDaysToDateString,
  formatInAppTimezone,
  todayInAppTimezone,
  utcToZonedParts,
} from "@/lib/time";
import {
  completeReminder,
  snoozeReminder,
  type UpcomingReminder,
  type UpcomingReminders,
} from "@/app/(app)/reminders/actions";

/**
 * The nudges, on a screen at last.
 *
 * A reminder has always been a DERIVED row — a task's due time minus its chosen
 * offset, or a routine's time of day — written only so the cron dispatcher had
 * something to claim. It fired at you and that was the entire interface: no
 * list of what was coming, and a single one-hour Snooze button that existed
 * only on the notification itself.
 *
 * So this panel does two things and deliberately not a third. It shows what is
 * aimed at you (late ones first, because a late nudge is the one thing that
 * must never be tucked away), and it offers the two answers you can give a
 * nudge: push it back, or silence it. Creating and moving a nudge still belongs
 * to the task and routine forms, where the offset it is derived from lives —
 * see the header comment in reminders/actions.ts.
 *
 * "Done" here silences the nudge and does NOT tick the task off. Two screens
 * that can both complete a task, one of them without ever showing what is being
 * agreed to, is how something gets ticked off by accident.
 */
export function NudgePanel({
  initial,
  timeZone,
  notifications,
}: {
  initial: UpcomingReminders;
  /** The profile's timezone — every time on this panel renders in it. */
  timeZone?: string;
  /**
   * Only used to work out what the morning preset means *optimistically*, with
   * the same pure helper the server action uses (quiet hours can push the
   * morning later). The server still decides the time that gets stored, and
   * hands it back so the row can correct itself — see handleSnooze.
   */
  notifications: NotificationPreferences;
}) {
  // One flat, soonest-first list. `isOverdue` is what splits it back apart at
  // render time, so a snoozed row can move from "late" to "coming up" with no
  // bookkeeping beyond a re-sort.
  const [rows, setRows] = useState<UpcomingReminder[]>([...initial.overdue, ...initial.upcoming]);
  const [openSnooze, setOpenSnooze] = useState<string | null>(null);
  // A SET, NOT ONE ID. Two rows can be in flight at once on a slow connection,
  // and a single `busyId` meant the second tap overwrote the first: whichever
  // finished first then cleared the OTHER row's greying, and the row still
  // saving looked ready to tap again.
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());

  function setBusy(id: string, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const bySoonest = (a: UpcomingReminder, b: UpcomingReminder) =>
    a.remindAt.localeCompare(b.remindAt);

  /**
   * Moves one row to a new fire time and re-sorts.
   *
   * `isOverdue` is passed in rather than worked out here, and that is the whole
   * point. An earlier version stamped `false` on the grounds that every caller
   * moves a nudge forward — which is true of the two that snooze it, and false
   * of the two that put it BACK after a failed save. A nudge that was already
   * late, snoozed with no signal, was restored to its old time but marked
   * on-time: it left "Should already have gone off", lost its red, dropped out
   * of the late count, and sat quietly under "Coming up" reading yesterday.
   * The rollback meant to make the failure visible was hiding it instead.
   *
   * Reading the clock here would also be wrong for a different reason — it
   * would make the same render produce different answers at different moments.
   * So the caller says: a snooze lands in the future by definition, and a
   * rollback restores exactly the state the row had before it was touched.
   */
  function applyRemindAt(id: string, remindAt: string, isOverdue: boolean) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, remindAt, isOverdue } : r)).sort(bySoonest)
    );
  }

  /**
   * Puts ONE row back, and only that row.
   *
   * The rollback used to be `const previous = rows` / `setRows(previous)`,
   * which restored the whole list from a snapshot taken before the tap. Tap
   * Done on A, then Done on B while A is still saving, and A failing put B
   * back too — undoing something that had genuinely succeeded, on screen only,
   * so B looked alive again while the database said it was silenced.
   */
  function restoreRow(reminder: UpcomingReminder) {
    setRows((prev) =>
      (prev.some((r) => r.id === reminder.id) ? prev : [...prev, reminder]).sort(bySoonest)
    );
  }

  async function handleSnooze(reminder: UpcomingReminder, preset: SnoozePreset) {
    // Just this row's old state, not a copy of the list — see restoreRow.
    // The late flag travels with the time: restoring one without the other is
    // what quietly demoted an overdue nudge on a failed save.
    const previousRemindAt = reminder.remindAt;
    const previousOverdue = reminder.isOverdue;
    const guess = snoozeUntilUtc(preset, notifications, timeZone).toISOString();

    setBusy(reminder.id, true);
    setOpenSnooze(null);
    // A snooze always lands ahead of now, so the row stops being late.
    applyRemindAt(reminder.id, guess, false);

    // A dropped connection, a 500, or anything thrown server-side REJECTS the
    // call — it does not come back as `{ error }`, which is only ever a
    // database refusal. Without this the row kept a time that was never saved,
    // said nothing at all, and stayed greyed out with both its buttons dead
    // until the page was reloaded. `finally` is what guarantees the row comes
    // back to life on every path (same shape as money/quick-log-form.tsx and
    // today/today-console.tsx).
    let result: Awaited<ReturnType<typeof snoozeReminder>>;
    try {
      result = await snoozeReminder(reminder.id, preset);
    } catch {
      applyRemindAt(reminder.id, previousRemindAt, previousOverdue);
      toast.error("Couldn't snooze that — check your connection and try again.");
      return;
    } finally {
      setBusy(reminder.id, false);
    }

    // Put the row back exactly where it was if the save didn't land. A nudge
    // that looks snoozed but isn't will arrive anyway, which is worse than one
    // that is visibly still sitting there.
    if (result.error) {
      applyRemindAt(reminder.id, previousRemindAt, previousOverdue);
      toast.error(result.error);
      return;
    }

    // THE SERVER DECIDES THE TIME; THE GUESS ABOVE ONLY BUYS THE ANIMATION.
    //
    // They can differ honestly: a repeating nudge already pointing at a real
    // occurrence sooner than the snooze keeps that occurrence (snoozeTargetFor
    // in lib/reminders/anchor.ts), so tapping "4 hours" on one due in two
    // stores two. So whatever comes back wins, and it wins late rather than
    // slowly — the row still moves the instant you tap, then corrects itself
    // if it guessed wrong. The confirmation is built from the same value, so
    // the sentence can never name a time the database never held.
    const landed = result.remindAt ?? guess;
    if (landed !== guess) applyRemindAt(reminder.id, landed, false);

    // Lower-cased on the first letter only, not with toLowerCase(): the
    // sentence can now contain a real date ("Tue, Sep 15 at 9:00 a.m.") that
    // must keep its capitals.
    const sentence = describeSnooze(preset, landed, timeZone);
    toast.success(
      `${headlineFor(reminder)} — ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`
    );
  }

  async function handleDone(reminder: UpcomingReminder) {
    setBusy(reminder.id, true);
    setOpenSnooze(null);
    setRows((prev) => prev.filter((r) => r.id !== reminder.id));

    let result: Awaited<ReturnType<typeof completeReminder>>;
    try {
      result = await completeReminder(reminder.id);
    } catch {
      restoreRow(reminder);
      toast.error("Couldn't silence that — check your connection and try again.");
      return;
    } finally {
      setBusy(reminder.id, false);
    }

    if (result.error) {
      restoreRow(reminder);
      toast.error(result.error);
      return;
    }
    toast.success(doneSentence(reminder, result.remindAt, timeZone));
  }

  const overdue = rows.filter((r) => r.isOverdue);
  const upcoming = rows.filter((r) => !r.isOverdue);

  return (
    <Panel className={overdue.length > 0 ? "border-destructive" : undefined}>
      <PanelHead
        title="Upcoming nudges"
        count={rows.length > 0 ? rows.length : undefined}
        action={
          overdue.length > 0 ? (
            <Tag tone="alert" filled>
              {overdue.length} late
            </Tag>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <PanelEmpty>
          Nothing lined up. Reminders you set on a task or a routine show up here before they
          reach your phone.
        </PanelEmpty>
      ) : (
        <ul>
          {overdue.length > 0 && <GroupHead tone="alert">Should already have gone off</GroupHead>}
          <AnimatePresence initial={false}>
            {overdue.map((reminder) => (
              <NudgeRow
                key={reminder.id}
                reminder={reminder}
                timeZone={timeZone}
                busy={busyIds.has(reminder.id)}
                snoozeOpen={openSnooze === reminder.id}
                onToggleSnooze={() =>
                  setOpenSnooze((id) => (id === reminder.id ? null : reminder.id))
                }
                onSnooze={(preset) => handleSnooze(reminder, preset)}
                onDone={() => handleDone(reminder)}
              />
            ))}
          </AnimatePresence>

          {overdue.length > 0 && upcoming.length > 0 && <GroupHead>Coming up</GroupHead>}
          <AnimatePresence initial={false}>
            {upcoming.map((reminder) => (
              <NudgeRow
                key={reminder.id}
                reminder={reminder}
                timeZone={timeZone}
                busy={busyIds.has(reminder.id)}
                snoozeOpen={openSnooze === reminder.id}
                onToggleSnooze={() =>
                  setOpenSnooze((id) => (id === reminder.id ? null : reminder.id))
                }
                onSnooze={(preset) => handleSnooze(reminder, preset)}
                onDone={() => handleDone(reminder)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Panel>
  );
}

/**
 * The strip that separates late from coming-up. Alert tone comes from the
 * semantic tokens, never from the theme accent — "late" has to keep meaning
 * late when the palette changes.
 */
function GroupHead({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "alert";
}) {
  return (
    <li
      className={cn(
        "micro-sm border-b border-hairline px-3 py-1.5",
        tone === "alert"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted/40 text-muted-foreground"
      )}
    >
      {children}
    </li>
  );
}

function NudgeRow({
  reminder,
  timeZone,
  busy,
  snoozeOpen,
  onToggleSnooze,
  onSnooze,
  onDone,
}: {
  reminder: UpcomingReminder;
  timeZone?: string;
  busy: boolean;
  snoozeOpen: boolean;
  onToggleSnooze: () => void;
  onSnooze: (preset: SnoozePreset) => void;
  onDone: () => void;
}) {
  const headline = headlineFor(reminder);

  return (
    <motion.li
      layout
      variants={listItemVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={LIST_ITEM_TRANSITION}
      className={cn(
        "border-b border-hairline px-3 py-2.5 last:border-b-0",
        reminder.isOverdue && "bg-destructive/5",
        busy && "opacity-60"
      )}
    >
      <div className="flex items-start gap-3">
        <Bell
          className={cn(
            "mt-0.5 size-4 shrink-0",
            reminder.isOverdue ? "text-destructive" : "text-muted-foreground"
          )}
          strokeWidth={2.25}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{headline}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{detailFor(reminder)}</p>
          {reminder.notes && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground italic">{reminder.notes}</p>
          )}
        </div>
        <span
          className={cn(
            "micro-sm shrink-0 tabular",
            reminder.isOverdue ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {whenLabel(reminder.remindAt, timeZone)}
        </span>
      </div>

      {/* 44px floor on every control here, as a MIN-HEIGHT IN REM rather than
          `h-11`: Tailwind's spacing scale is multiplied by --density-scale, so
          h-11 quietly becomes 38px on the compact density — and a touch floor
          that shrinks isn't a floor. `.tap-reach` is the usual answer for a
          bordered button, but its invisible 44px band would overlap between
          the two rows of the snooze grid below and hand taps to the wrong
          preset, so these get real height instead. */}
      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-h-[2.75rem] px-3"
          disabled={busy}
          aria-expanded={snoozeOpen}
          aria-label={`Snooze the nudge for ${headline}`}
          onClick={onToggleSnooze}
        >
          <AlarmClock />
          Snooze
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="min-h-[2.75rem] px-3"
          disabled={busy}
          aria-label={`Silence the nudge for ${headline}`}
          onClick={onDone}
        >
          <Check />
          Done
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {snoozeOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={MECHANICAL}
            className="mt-2 grid grid-cols-2 gap-2"
          >
            {SNOOZE_PRESETS.map((preset) => (
              <Button
                key={String(preset.value)}
                variant="outline"
                size="sm"
                className="min-h-[2.75rem] px-2"
                disabled={busy}
                onClick={() => onSnooze(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

// ---------------------------------------------------------------------------
// Saying what a nudge is actually for
// ---------------------------------------------------------------------------

/**
 * The THING, not the nudge. A reminder's own title is usually a copy of the
 * task's, and on its own ("Passport") it says nothing about why the phone is
 * about to buzz — so the row leads with what it belongs to and explains the
 * timing underneath.
 */
function headlineFor(reminder: UpcomingReminder): string {
  return reminder.task?.title ?? reminder.routine?.title ?? reminder.title;
}

/**
 * What to say after Done — and specifically WHEN it comes back.
 *
 * The old sentence said a repeating nudge "comes round again (every day)" and
 * stopped there, which sounds like tomorrow and often isn't: silencing an
 * overdue repeating nudge reschedules it from its parent's own timetable, and
 * that can hand back a slot still ahead of us TODAY. "Every day" meaning "in
 * forty minutes" is exactly the kind of quiet surprise this panel exists to
 * avoid, so the server now returns the instant it stored and this names it.
 *
 * If no instant comes back the nudge is finished for good (a one-off), or
 * something older is answering — either way the wording drops the specifics
 * rather than inventing them.
 */
function doneSentence(
  reminder: UpcomingReminder,
  remindAt: string | undefined,
  timeZone?: string
): string {
  if (remindAt) {
    const repeat = reminder.rrule ? ` (${describeRRule(reminder.rrule)})` : "";
    return `Nudge silenced — back ${describeLanding(remindAt, timeZone)}${repeat}`;
  }
  if (reminder.rrule) {
    return `Nudge silenced — it comes round again (${describeRRule(reminder.rrule)})`;
  }
  return "Nudge silenced. The task itself is still open.";
}

function detailFor(reminder: UpcomingReminder): string {
  const parts: string[] = [];

  if (reminder.task) {
    parts.push(
      reminder.task.notifyOffsetMinutes === null
        ? "A reminder about this task"
        : describeNudge(reminder.task.notifyOffsetMinutes)
    );
  } else if (reminder.routine) {
    parts.push("Part of your routine");
  } else {
    // Shouldn't be possible — a reminder is cascaded away with the task or
    // routine it hangs off (migration 0022) — but if one ever does turn up it
    // still gets a sentence and a way to silence it, not an unexplained row.
    parts.push("A reminder on its own");
  }

  if (reminder.rrule) parts.push(`repeats ${describeRRule(reminder.rrule)}`);

  // The nudge's own title only earns a place when it says something the
  // headline doesn't.
  const headline = headlineFor(reminder);
  if (reminder.title && reminder.title !== headline) parts.unshift(`"${reminder.title}"`);

  return parts.join(" · ");
}

/**
 * "Today 3:45 PM", "Tomorrow 8:00 AM", "Mon, Sep 15, 9:00 AM" — in the
 * profile's timezone, never the device's and never a raw timestamp. `remindAt`
 * is a real instant, so it goes through the timestamp formatter; the bare-date
 * helper would be the wrong tool here.
 */
function whenLabel(remindAt: string, timeZone?: string): string {
  const time = formatInAppTimezone(remindAt, { hour: "numeric", minute: "2-digit" }, timeZone);
  const parts = utcToZonedParts(new Date(remindAt), timeZone);
  const dateStr = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const today = todayInAppTimezone(timeZone);

  if (dateStr === today) return `Today ${time}`;
  if (dateStr === addDaysToDateString(today, 1)) return `Tomorrow ${time}`;
  if (dateStr === addDaysToDateString(today, -1)) return `Yesterday ${time}`;

  return formatInAppTimezone(
    remindAt,
    { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
    timeZone
  );
}
