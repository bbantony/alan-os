import { SettingsPageShell } from "../settings-page-shell";
import { getPreferences } from "../preferences-actions";
import { PlanSettings } from "./plan-settings";

export default async function PlanSettingsPage() {
  const preferences = await getPreferences();
  return (
    <SettingsPageShell title="Plan">
      <PlanSettings initial={preferences} />
    </SettingsPageShell>
  );
}
