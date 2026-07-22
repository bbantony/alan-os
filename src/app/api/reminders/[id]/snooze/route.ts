import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyActionToken } from "@/lib/reminders/action-token";

// Same token-based auth as the complete route — see that file's comment.
// Fixed 1h snooze to match the push notification's action button label
// exactly (richer snooze presets are available in-app instead).
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
  const oneHourFromNow = new Date(Date.now() + 60 * 60000).toISOString();

  await supabase.rpc("advance_reminder", {
    secret,
    reminder_id: id,
    new_remind_at: oneHourFromNow,
    new_status: "active",
  });

  return NextResponse.json({ ok: true });
}
