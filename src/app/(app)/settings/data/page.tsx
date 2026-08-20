import { SettingsPageShell } from "../settings-page-shell";
import { DataSettings } from "./data-settings";

export default function DataSettingsPage() {
  return (
    <SettingsPageShell title="Data">
      <DataSettings />
    </SettingsPageShell>
  );
}
