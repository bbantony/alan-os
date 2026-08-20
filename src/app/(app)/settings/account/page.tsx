import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { SettingsPageShell } from "../settings-page-shell";
import { AccountSettings } from "./account-settings";

export default async function AccountSettingsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // avatar_url isn't on CurrentProfile — it's only needed here, and adding it
  // to the profile every page load reads a column nothing else uses.
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", profile.id)
    .maybeSingle();

  return (
    <SettingsPageShell title="Account">
      <AccountSettings
        initial={profile.preferences}
        displayName={profile.displayName}
        email={profile.email}
        timezone={profile.timezone}
        avatarUrl={(data?.avatar_url as string | null) ?? null}
      />
    </SettingsPageShell>
  );
}
