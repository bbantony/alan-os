import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nextReminderState, type ReminderAnchorRow } from "@/lib/reminders/anchor";
import { sendPush, type PushSubscriptionRow } from "@/lib/push/send";
import { createActionToken } from "@/lib/reminders/action-token";
import { isQuietHour, resolvePreferences } from "@/lib/preferences";
import { APP_TIMEZONE, hourInTimezone, todayInAppTimezone } from "@/lib/time";

interface BillRow {
  id: string;
  user_id: string;
  name: string;
  amount_cents: number;
  next_date: string;
}

// What `claim_due_reminders` hands back (migration 0012) — a whole reminders
// row. `.rpc()` is untyped in this project, so the fields this route actually
// reads are named here rather than left as `any`.
interface ClaimedReminder {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  remind_at: string;
  rrule: string | null;
  linked_task_id: string | null;
  linked_routine_id: string | null;
}

// What `get_reminder_anchors` hands back (migration 0039).
interface AnchorRow {
  reminder_id: string;
  routine_rrule: string | null;
  routine_time_of_day: string | null;
  // The routine's start date (migration 0040) — what an "every N days" rule
  // counts from, without which the series re-anchors onto the wrong days.
  routine_created_at: string | null;
  task_due_at: string | null;
  task_notify_offset_minutes: number | null;
}

// Hit by an external cron pinger (cron-job.org), not Vercel Cron — Vercel's
// Hobby plan caps native cron at once/day, too infrequent for reminders.
// This route has NO user session at all; every cross-user read/write below
// goes through the security-definer RPCs from migration 0012, each of which
// re-checks CRON_SECRET itself server-side (so knowing only the public
// Supabase anon key isn't enough to call them directly and bypass this
// route's own check below).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const { data: dueReminders, error } = await supabase.rpc("claim_due_reminders", { secret });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const claimed = (dueReminders as ClaimedReminder[] | null) ?? [];

  // THE PARENT SCHEDULES, FETCHED ONCE FOR THE WHOLE BATCH.
  //
  // A claimed row carries its own rrule and remind_at, but remind_at is a
  // MUTABLE pointer that snooze rewrites — advancing from it is exactly what
  // used to re-anchor an entire series (a daily 07:00 nudge snoozed an hour
  // became a daily 08:05 nudge forever). The true anchor lives on the parent
  // task or routine, and this route has no user session at all, so it cannot
  // read either table directly: both are `auth.uid() = user_id` RLS and would
  // silently return nothing, which looks identical to "the parent was deleted"
  // and would quietly keep the drift. Migration 0039 adds the secret-checked
  // lookup, batched so a morning full of reminders is still one round trip.
  //
  // AND IF THAT LOOKUP FAILS, IT SAYS SO. An empty `anchors` map is not an
  // error state on its own — a one-off reminder has no parent schedule to
  // return — so a failed call looks exactly like a batch of one-offs and
  // every reminder quietly falls through to the fallback that steps from
  // remind_at, which is the drift this whole fix exists to end. The run is NOT
  // aborted (sending reminders on a slightly wrong schedule beats not sending
  // them at all), but the failure is logged and reported in the response,
  // which is the only place anyone can ever see how this job went.
  const anchors = new Map<string, AnchorRow>();
  let anchorError: string | null = null;
  if (claimed.length > 0) {
    const { data: anchorRows, error: anchorsFailed } = await supabase.rpc("get_reminder_anchors", {
      secret,
      target_reminders: claimed.map((r) => r.id),
    });
    if (anchorsFailed) {
      anchorError = anchorsFailed.message;
      console.error("[cron/reminders] anchor lookup failed:", anchorsFailed.message);
    }
    for (const anchor of (anchorRows as AnchorRow[] | null) ?? []) {
      anchors.set(anchor.reminder_id, anchor);
    }
  }

  // SNOOZING MOVES ONLY THIS OCCURRENCE, NEVER THE SERIES. That is what this
  // recomputation is for, and it is the whole point of the fix: whatever a
  // snooze did to remind_at, the next occurrence is worked out afresh from the
  // routine's own rrule + time of day, or the task's due_at minus its nudge
  // offset. So a snoozed nudge fires once at the snoozed time and then lands
  // straight back on its real schedule — and the occurrence a snooze wrote
  // over (this route advances remind_at AFTER pushing, so the Snooze button on
  // the notification always overwrites the next real occurrence) is found
  // again rather than lost. One shared implementation, in lib/reminders/anchor.
  function nextStateFor(reminder: ClaimedReminder) {
    const anchor = anchors.get(reminder.id);
    const row: ReminderAnchorRow = {
      rrule: reminder.rrule,
      remind_at: reminder.remind_at,
      linked_task_id: reminder.linked_task_id,
      linked_routine_id: reminder.linked_routine_id,
      routine_rrule: anchor?.routine_rrule ?? null,
      routine_time_of_day: anchor?.routine_time_of_day ?? null,
      routine_created_at: anchor?.routine_created_at ?? null,
      task_due_at: anchor?.task_due_at ?? null,
      task_notify_offset_minutes: anchor?.task_notify_offset_minutes ?? null,
    };
    return nextReminderState(row);
  }

  let pushed = 0;
  let heldForQuietHours = 0;
  let suppressed = 0;

  // One lookup per user rather than per reminder — a morning batch is usually
  // several reminders belonging to the same person.
  const prefsCache = new Map<string, { prefs: ReturnType<typeof resolvePreferences>; timezone: string }>();
  async function prefsFor(userId: string) {
    const cached = prefsCache.get(userId);
    if (cached) return cached;
    const { data } = await supabase.rpc("get_notification_prefs_for_user", {
      secret,
      target_user: userId,
    });
    const row = (data as { preferences: unknown; timezone: string }[] | null)?.[0];
    const entry = {
      prefs: resolvePreferences(row?.preferences),
      timezone: row?.timezone || APP_TIMEZONE,
    };
    prefsCache.set(userId, entry);
    return entry;
  }

  for (const reminder of claimed) {
    const { prefs, timezone } = await prefsFor(reminder.user_id);
    const notifications = prefs.notifications;

    // QUIET HOURS: held, not dropped. The reminder is left exactly as it is —
    // not advanced — so the next tick after the window ends picks it up and
    // sends it. Advancing here would silently swallow anything due overnight,
    // which is the opposite of what "quiet hours" means.
    if (isQuietHour(hourInTimezone(new Date(), timezone), notifications)) {
      heldForQuietHours += 1;
      continue;
    }

    // TYPE SWITCHED OFF: advanced, not held. A reminder for a category you've
    // turned off must move on to its next occurrence, or it would sit at the
    // front of the queue being reconsidered on every tick forever.
    const isRoutine = Boolean(reminder.linked_routine_id);
    const wanted = isRoutine ? notifications.routineReminders : notifications.taskNudges;
    if (!wanted) {
      suppressed += 1;
      const skip = nextStateFor(reminder);
      await supabase.rpc("advance_reminder", {
        secret,
        reminder_id: reminder.id,
        // A null remind_at leaves the column alone — advance_reminder coalesces
        // it (0012), which is what a one-off finishing wants.
        new_remind_at: skip.remindAt,
        new_status: skip.status,
      });
      continue;
    }

    const { data: subs } = await supabase.rpc("get_push_subscriptions_for_user", {
      secret,
      target_user: reminder.user_id,
    });

    const actionToken = createActionToken(reminder.id, reminder.user_id);
    const result = await sendPush(
      (subs as PushSubscriptionRow[]) ?? [],
      {
        title: reminder.title,
        body: reminder.notes ?? "Reminder",
        reminderId: reminder.id,
        actionToken,
        // PINNED TO THE LIST VIEW, NOT JUST "/plan".
        //
        // sw.js promises that tapping the notification body opens "the
        // reminders list, where Done/Snooze exist as ordinary buttons" — the
        // fallback the whole design leans on, because iOS PWA action buttons
        // are unreliable. But the nudge panel renders only in Plan's LIST
        // view, and a bare /plan opens whatever `preferences.defaultPlanView`
        // says, so anyone defaulting to Calendar or Agenda tapped a reminder
        // and arrived at a screen with no nudges on it at all. Same pin the
        // launcher shortcut (manifest.json) and the capture sheet already use.
        url: "/plan?view=list",
      },
      async (subscriptionId) => {
        await supabase.rpc("delete_push_subscription_admin", { secret, subscription_id: subscriptionId });
      }
    );
    pushed += result.sent;

    // No GCal work here anymore — a reminder's calendar mirror is created
    // eagerly when it's made/edited (src/lib/gcal/sync.ts), as a real
    // recurring series when it repeats, so there's nothing left to do on
    // each individual fire.
    const next = nextStateFor(reminder);
    await supabase.rpc("advance_reminder", {
      secret,
      reminder_id: reminder.id,
      new_remind_at: next.remindAt,
      new_status: next.status,
    });
  }

  // ---------------------------------------------------------------------
  // Bills about to land
  // ---------------------------------------------------------------------
  //
  // Read straight from `recurring_transactions` rather than queued as a
  // reminder row — see migration 0031 for why (0022's orphan invariant).
  // `last_notified_date` stores which occurrence was mentioned, so a bill is
  // announced once and announced again next month.
  //
  // The lead time is per-account, but the claim query needs one number, so it
  // asks for the widest window anyone could want and each bill is then checked
  // against its own owner's setting.
  let billsPushed = 0;
  const { data: upcomingBills } = await supabase.rpc("claim_bills_to_notify", {
    secret,
    lead_days: 14,
  });

  for (const bill of (upcomingBills as BillRow[]) ?? []) {
    const { prefs, timezone } = await prefsFor(bill.user_id);
    const notifications = prefs.notifications;
    if (!notifications.billsDue) continue;
    if (isQuietHour(hourInTimezone(new Date(), timezone), notifications)) continue;

    const daysAway = Math.round(
      (new Date(`${bill.next_date}T00:00:00Z`).getTime() -
        new Date(`${todayInAppTimezone(timezone)}T00:00:00Z`).getTime()) /
        86400000
    );
    // Not yet inside this person's chosen warning window.
    if (daysAway > notifications.billLeadDays) continue;

    const { data: subs } = await supabase.rpc("get_push_subscriptions_for_user", {
      secret,
      target_user: bill.user_id,
    });

    const when = daysAway <= 0 ? "today" : daysAway === 1 ? "tomorrow" : `in ${daysAway} days`;
    const amount = (bill.amount_cents / 100).toFixed(2);
    const result = await sendPush(
      (subs as PushSubscriptionRow[]) ?? [],
      {
        title: `${bill.name} — ${when}`,
        body: `$${amount} is due to come out. Tap to see what that leaves you.`,
        url: "/money",
      },
      async (subscriptionId) => {
        await supabase.rpc("delete_push_subscription_admin", { secret, subscription_id: subscriptionId });
      }
    );
    billsPushed += result.sent;

    // Stamped whether or not a device took it: the alternative is retrying a
    // person with no registered devices on every tick, forever.
    await supabase.rpc("mark_bill_notified", {
      secret,
      bill_id: bill.id,
      occurrence: bill.next_date,
    });
  }

  return NextResponse.json({
    claimed: claimed.length,
    pushed,
    heldForQuietHours,
    suppressed,
    billsPushed,
    // Null on a healthy run. Anything else means every reminder in this batch
    // was rescheduled by the fallback rather than from its parent's real
    // schedule — they still went out, but their next times are suspect.
    anchorError,
  });
}
