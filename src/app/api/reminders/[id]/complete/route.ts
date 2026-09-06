import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyActionToken } from "@/lib/reminders/action-token";
import { nextReminderState, type ReminderAnchorRow } from "@/lib/reminders/anchor";

// What `get_reminder_anchors` hands back (migration 0039): the reminder plus
// the scheduling fields of whichever parent it hangs off.
interface AnchorRow extends ReminderAnchorRow {
  reminder_id: string;
  user_id: string;
}

// Reached from the OS notification's "Done" action button — the service
// worker fetches this with no guarantee of a live session (a dormant PWA's
// Supabase session may well be expired by the time a reminder fires), so
// auth here is entirely the signed token, not cookies. See
// src/lib/reminders/action-token.ts for why.
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
  // Was `get_reminder_admin`, which returns the reminder row and nothing else.
  // That was the bug: a repeating reminder was then advanced with
  // nextOccurrenceUtc(rrule, remind_at), stepping from a pointer that snooze
  // rewrites, so one snooze re-anchored the series for good. The next
  // occurrence now comes from the parent's own schedule instead, which this
  // session-less route cannot read any other way (tasks and routines are both
  // `auth.uid() = user_id` RLS).
  const { data: rows } = await supabase.rpc("get_reminder_anchors", {
    secret,
    target_reminders: [id],
  });
  const reminder = ((rows as AnchorRow[] | null) ?? [])[0];
  if (!reminder || reminder.user_id !== verified.userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // SNOOZING MOVES ONLY THIS OCCURRENCE, NEVER THE SERIES — so "Done" on a
  // repeating reminder that was snoozed earlier puts it back on the schedule
  // its routine or task actually asks for, not on the snoozed time. A reminder
  // linked to neither is retired rather than advanced (migration 0022).
  const next = nextReminderState(reminder);

  await supabase.rpc("advance_reminder", {
    secret,
    reminder_id: id,
    // null leaves remind_at alone; advance_reminder coalesces it (0012).
    new_remind_at: next.remindAt,
    new_status: next.status,
  });

  return NextResponse.json({ ok: true });
}
