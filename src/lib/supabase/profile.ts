import { createClient } from "@/lib/supabase/server";
import type { ThemeSettings } from "@/lib/palettes";
import { DEFAULT_THEME_SETTINGS } from "@/lib/palettes";
import { resolveModuleAccess, type ModuleAccess } from "@/lib/permissions";

export interface CurrentProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  role: "owner" | "workout_member" | "full_user";
  themeSettings: ThemeSettings;
  moduleAccess: ModuleAccess;
}

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role, theme_settings, module_access")
    .eq("id", user.id)
    .single();

  const role = (profile?.role ?? "owner") as CurrentProfile["role"];

  return {
    id: user.id,
    email: user.email ?? null,
    displayName: profile?.display_name ?? null,
    role,
    themeSettings: {
      ...DEFAULT_THEME_SETTINGS,
      ...((profile?.theme_settings as Partial<ThemeSettings>) ?? {}),
    },
    moduleAccess: resolveModuleAccess({ role, moduleAccess: profile?.module_access }),
  };
}
