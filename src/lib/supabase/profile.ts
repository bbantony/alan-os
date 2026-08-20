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

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role, theme_settings, module_access, timezone, preferences")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "owner") as CurrentProfile["role"];

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
