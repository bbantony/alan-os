import { createClient } from "@/lib/supabase/server";
import type { ThemeSettings } from "@/lib/palettes";
import { DEFAULT_THEME_SETTINGS } from "@/lib/palettes";

export interface CurrentProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  role: "owner" | "workout_member" | "full_user";
  themeSettings: ThemeSettings;
}

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role, theme_settings")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? null,
    displayName: profile?.display_name ?? null,
    role: (profile?.role ?? "owner") as CurrentProfile["role"],
    themeSettings: {
      ...DEFAULT_THEME_SETTINGS,
      ...((profile?.theme_settings as Partial<ThemeSettings>) ?? {}),
    },
  };
}
