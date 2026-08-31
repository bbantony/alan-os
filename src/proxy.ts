import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccessPath } from "@/lib/permissions";

// /api/cron and /api/reminders/*/complete|snooze authenticate themselves
// (a bearer secret, and a signed per-reminder token respectively — see
// src/lib/reminders/action-token.ts) rather than relying on a session: the
// cron dispatcher is hit by an external pinger with no cookies at all, and
// the notification action routes may fire days after a PWA's session has
// expired. Without this, the middleware would redirect both to /login before
// they ever reached their own auth checks.
const PUBLIC_PATHS = ["/login", "/signup", "/api/cron", "/api/reminders"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Per-account module access (SPEC.md Part B2/C3, extended by the admin/
  // permissions overhaul — see supabase/migrations/0018_admin_permissions.sql):
  // this is the server-side enforcement; the nav already hides inaccessible
  // links, but a typed-in URL must be blocked too. canAccessPath is the single
  // shared resolver also used by nav-items.ts and settings/page.tsx.
  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, module_access")
      .eq("id", user.id)
      .single();
    const pathname = request.nextUrl.pathname;
    // FAILS CLOSED. This used to be `if (profile && !canAccessPath(...))`, so
    // any hiccup reading the profile — a timeout, a blip — skipped the gate
    // entirely and let the request through. A guard that disappears exactly
    // when the database is unhappy is not a guard. `/today` is always
    // reachable, so redirecting there cannot lock anyone out.
    const allowed = profile
      ? canAccessPath({ role: profile.role, moduleAccess: profile.module_access }, pathname)
      : pathname === "/today";
    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = "/today";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
