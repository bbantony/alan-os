import "server-only";

import { createClient } from "@/lib/supabase/server";
import { resolvePreferences, type Preferences } from "@/lib/preferences";

// Which AI features this account has switched on (Settings → AI & cost).
//
// Checked at the entry point of each feature rather than inside
// `callGeminiJson`, deliberately: a switched-off feature should take its own
// manual path — a blank receipt form, heuristic-only CSV categorising, an
// assistant that says it's off — not fail somewhere deep in a shared helper
// with a generic "unavailable".

type AiFeatureKey = "aiReceipts" | "aiCsvImport" | "aiAssistant" | "aiWeeklyPatterns";

export async function getAiPreferences(): Promise<Preferences> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return resolvePreferences({});

  const { data } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .maybeSingle();
  return resolvePreferences(data?.preferences);
}

export async function aiFeatureEnabled(feature: AiFeatureKey): Promise<boolean> {
  const prefs = await getAiPreferences();
  return prefs[feature];
}
