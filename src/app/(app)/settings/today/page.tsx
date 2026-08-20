import { SettingsPageShell } from "../settings-page-shell";
import { getPreferences } from "../preferences-actions";
import { TodaySettings } from "./today-settings";

export default async function TodaySettingsPage() {
  const preferences = await getPreferences();
  return (
    <SettingsPageShell title="Today">
      <TodaySettings initial={preferences} />
    </SettingsPageShell>
  );
}
