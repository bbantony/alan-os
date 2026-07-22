import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getAuthUrl } from "@/lib/gcal/client";

// Runs inside the owner's already-logged-in browser session (they click
// "Connect Google Calendar" from within the app) — no PUBLIC_PATHS bypass
// needed, the normal proxy.ts session check already lets this through.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const host = new URL(request.url).host;
  const state = randomBytes(16).toString("hex");
  const authUrl = getAuthUrl(host, state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("gcal_oauth_state", state, {
    httpOnly: true,
    secure: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
  });
  return response;
}
