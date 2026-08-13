import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nextOccurrenceUtc } from "@/lib/reminders/rrule";
import { sendPush, type PushSubscriptionRow } from "@/lib/push/send";
import { createActionToken } from "@/lib/reminders/action-token";

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

    // No GCal work here anymore — a reminder's calendar mirror is created
    // eagerly when it's made/edited (src/lib/gcal/sync.ts), as a real
    // recurring series when it repeats, so there's nothing left to do on
    // each individual fire.
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
    });
  }

  return NextResponse.json({ claimed: dueReminders?.length ?? 0, pushed });
}
