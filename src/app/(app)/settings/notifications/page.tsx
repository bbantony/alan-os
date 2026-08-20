import { SettingsPageShell } from "../settings-page-shell";
import { getPreferences } from "../preferences-actions";
import { getPushDevices } from "./notification-actions";
import { NotificationSettings } from "./notification-settings";

export default async function NotificationSettingsPage() {
  const [preferences, devices] = await Promise.all([getPreferences(), getPushDevices()]);

  return (
    <SettingsPageShell title="Notifications">
      <NotificationSettings initial={preferences} devices={devices} />
    </SettingsPageShell>
  );
}
