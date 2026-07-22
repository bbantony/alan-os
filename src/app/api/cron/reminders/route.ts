import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nextOccurrenceUtc } from "@/lib/reminders/rrule";
import { sendPush, type PushSubscriptionRow } from "@/lib/push/send";
import { createActionToken } from "@/lib/reminders/action-token";
import { createEvent as gcalCreateEvent } from "@/lib/gcal/client";

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

  let pushed = 0;
  let mirrored = 0;

  for (const reminder of dueReminders ?? []) {
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
        url: "/calendar?tab=reminders",
      },
      async (subscriptionId) => {
        await supabase.rpc("delete_push_subscription_admin", { secret, subscription_id: subscriptionId });
      }
    );
    pushed += result.sent;

    // Mirror to GCal on first fire only (a gcal_event_id already present
    // means it was created when the reminder was made, or on a prior fire).
    let gcalEventId: string | null = null;
    if (reminder.mirror_to_gcal && !reminder.gcal_event_id) {
      const { data: connections } = await supabase.rpc("get_gcal_connection_for_user", {
        secret,
        target_user: reminder.user_id,
      });
      const connection = connections?.[0];
      if (connection) {
        try {
          const start = new Date(reminder.remind_at);
          const end = new Date(start.getTime() + 15 * 60000);
          const event = await gcalCreateEvent(connection.refresh_token_encrypted, connection.calendar_id, {
            title: reminder.title,
            startIso: start.toISOString(),
            endIso: end.toISOString(),
            reminderMinutesBefore: 0,
          });
          gcalEventId = event.id;
          mirrored += 1;
        } catch {
          // Push already went out — a GCal mirror failure isn't fatal.
        }
      }
    }

    let nextRemindAt = reminder.remind_at as string;
    let nextStatus: "active" | "done" = "done";
    if (reminder.rrule) {
      const next = nextOccurrenceUtc(reminder.rrule, new Date(reminder.remind_at));
      if (next) {
        nextRemindAt = next.toISOString();
        nextStatus = "active";
      }
    }

    await supabase.rpc("advance_reminder", {
      secret,
      reminder_id: reminder.id,
      new_remind_at: nextRemindAt,
      new_status: nextStatus,
      new_gcal_event_id: gcalEventId,
    });
  }

  return NextResponse.json({ claimed: dueReminders?.length ?? 0, pushed, mirrored });
}
