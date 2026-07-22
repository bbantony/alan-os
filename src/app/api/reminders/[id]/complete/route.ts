import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyActionToken } from "@/lib/reminders/action-token";
import { nextOccurrenceUtc } from "@/lib/reminders/rrule";

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
  const { data: rows } = await supabase.rpc("get_reminder_admin", { secret, target_reminder: id });
  const reminder = rows?.[0];
  if (!reminder || reminder.user_id !== verified.userId) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
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
    reminder_id: id,
    new_remind_at: nextRemindAt,
    new_status: nextStatus,
  });

  return NextResponse.json({ ok: true });
}
