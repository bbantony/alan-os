import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { encryptRefreshToken, exchangeCodeForTokens } from "@/lib/gcal/client";
import { backfillGcalSync } from "@/lib/gcal/sync";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gcal_oauth_state")?.value;
  cookieStore.delete("gcal_oauth_state");

  function fail(message: string) {
    return NextResponse.redirect(new URL(`/settings/calendar?error=${encodeURIComponent(message)}`, request.url));
  }

  if (oauthError) return fail("Google sign-in was cancelled.");
  if (!code || !state || state !== expectedState) {
    return fail("Something went wrong connecting Google Calendar — try again.");
  }

  try {
    const { refreshToken } = await exchangeCodeForTokens(code, url.host);
    await supabase.from("gcal_connections").upsert(
      {
        user_id: user.id,
        refresh_token_encrypted: encryptRefreshToken(refreshToken),
        calendar_id: "primary",
        sync_enabled: true,
      },
      { onConflict: "user_id" }
    );
    // So existing tasks/routines/reminders don't stay invisible on the
    // calendar until each one happens to be edited — one-time, idempotent.
    const backfill = await backfillGcalSync(supabase, user.id);
    if (backfill.failed > 0) {
      const note = `Connected, but ${backfill.failed} existing item(s) couldn't sync yet: ${backfill.firstError}`;
      return NextResponse.redirect(
        new URL(`/settings/calendar?connected=1&syncWarning=${encodeURIComponent(note)}`, request.url)
      );
    }
  } catch (err) {
    return fail((err as Error).message || "Could not connect Google Calendar.");
  }

  return NextResponse.redirect(new URL("/settings/calendar?connected=1", request.url));
}
