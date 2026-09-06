import { createClient } from "@/lib/supabase/server";
import type { ThemeSettings } from "@/lib/palettes";
import { normalizeThemeSettings } from "@/lib/palettes";
import { resolveModuleAccess, type ModuleAccess } from "@/lib/permissions";
import { resolvePreferences, type Preferences } from "@/lib/preferences";
import { APP_TIMEZONE } from "@/lib/time";

export interface CurrentProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  role: "owner" | "workout_member" | "full_user";
  themeSettings: ThemeSettings;
  moduleAccess: ModuleAccess;
  /** The account's own timezone. Every date in the app is rendered in it. */
  timezone: string;
  preferences: Preferences;
}

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // maybeSingle, not single: it is the only way to tell "this account has no
  // profile row" (data null, error null) apart from "the read failed" (error
  // set). `single()` collapses both into data === null, and the difference
  // decides how much of the app an account gets — see the note below.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name, role, theme_settings, module_access, timezone, preferences")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    // Not thrown: throwing here would take down every page in the (app) group,
    // including /today and /settings, on a single database hiccup. Logged so a
    // persistent failure (a column added by a migration that was never run, a
    // broken policy) is findable in the server logs rather than showing up
    // only as "the app has gone empty".
    console.error(
      `[profile] Could not read the profile row for ${user.id}: ${error.message}. ` +
        "Treating the account as having no access until it reads cleanly."
    );
  }

  // FAILS CLOSED. This used to default to "owner", which meant an account with
  // no profile row — or a profile read that simply errored — was handed the
  // owner's everything: every module, the admin link, and (since Wave 2B) the
  // assistant, which spends Alan's AI budget. A gate that opens when the
  // database is unhappy is not a gate.
  //
  // WHY THIS CANNOT LOCK ALAN OUT. `profiles.role` has defaulted to
  // 'workout_member' since migration 0005, so 'owner' is never implicit — a
  // real owner always has a row that says so in writing. The database already
  // agrees: `is_admin()` (migration 0018) is `exists (... and role = 'owner')`,
  // so every admin RPC has always failed closed on exactly this question. If
  // Alan's row were missing or not 'owner', admin settings would already be
  // refusing him. The only thing this line changes is what happens for an
  // account the database has never heard of, and for a read that failed.
  //
  // And "closed" here is degraded, not locked: /today and /settings are not
  // module-gated (see canAccessPath), so the account can still see the app,
  // sign out, and be fixed — and a transient error heals itself on the next
  // request. src/proxy.ts made this same call for the same reason.
  const role = (profile?.role ?? "workout_member") as CurrentProfile["role"];

  return {
    id: user.id,
    email: user.email ?? null,
    displayName: profile?.display_name ?? null,
    role,
    // Normalised rather than merged: every account's saved palette id predates
    // the redesign, so this maps it onto the nearest new theme instead of
    // handing the client an id that matches no [data-palette] block.
    themeSettings: normalizeThemeSettings(
      profile?.theme_settings as Partial<ThemeSettings> | null
    ),
    moduleAccess: resolveModuleAccess({ role, moduleAccess: profile?.module_access }),
    // Both resolved rather than merged, for the same reason theme_settings is:
    // what's stored is always partial.
    timezone: (profile?.timezone as string) || APP_TIMEZONE,
    preferences: resolvePreferences(profile?.preferences),
  };
}
