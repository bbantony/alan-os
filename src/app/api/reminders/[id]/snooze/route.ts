import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyActionToken } from "@/lib/reminders/action-token";
import { snoozeTargetFor, type ReminderAnchorRow } from "@/lib/reminders/anchor";

interface AnchorRow extends ReminderAnchorRow {
  reminder_id: string;
  user_id: string;
}

// Same token-based auth as the complete route — see that file's comment.
// Fixed 1h snooze to match the push notification's action button label
// exactly (richer snooze presets are available in-app instead).
//
// SNOOZING MOVES ONLY THIS OCCURRENCE, NEVER THE SERIES. This used to write
// `now + 1h` into remind_at unconditionally, which broke that promise twice
// over. The dispatcher advances remind_at AFTER it sends the push, so by the
// time this button is tapped the row already points at the NEXT genuine
// occurrence — overwriting it ate that occurrence outright, and the series was
// then stepped from the snoozed time forever after, so a daily 07:00 nudge
// became a daily 08:05 one. The second half of that is fixed where reminders
// are advanced (lib/reminders/anchor.ts recomputes from the parent's own
// schedule, so this row lands back on its real times after the snooze fires).
// The first half is fixed here: never push remind_at PAST a real occurrence
// that is already closer than the snooze.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 401 });

  const verified = verifyActionToken(token);
  if (!verified || verified.reminderId !== id) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "server misconfigured" }, { status: 500 });

  const supabase = await createClient();

  const { data: rows } = await supabase.rpc("get_reminder_anchors", {
    secret,
    target_reminders: [id],
  });
  const reminder = ((rows as AnchorRow[] | null) ?? [])[0];
  // The ownership check the complete route always had and this one did not: a
  // valid token for reminder X must belong to the account reminder X does.
  if (!reminder || reminder.user_id !== verified.userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Migration 0022's invariant: a reminder attached to neither a task nor a
  // routine must not exist, because nothing can trace it back or turn it off.
  // Snoozing sets status back to 'active', so refusing here is what stops this
  // route resurrecting one.
  if (!reminder.linked_task_id && !reminder.linked_routine_id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const now = new Date();
  const until = snoozeTargetFor(reminder, new Date(now.getTime() + 60 * 60000), now);

  await supabase.rpc("advance_reminder", {
    secret,
    reminder_id: id,
    new_remind_at: until.toISOString(),
    // 'active' on purpose, including for a one-off that already flipped to
    // 'done' when it fired — snoozing means "ask me again", so it has to come
    // back. The series is unharmed either way: it is recomputed from the
    // parent next time round.
    new_status: "active",
  });

  return NextResponse.json({ ok: true });
}
