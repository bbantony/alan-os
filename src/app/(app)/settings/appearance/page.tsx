import { SettingsPageShell } from "../settings-page-shell";
import { AppearanceEditor } from "./appearance-editor";

export default function AppearanceSettingsPage() {
  return (
    <SettingsPageShell title="Appearance">
      <AppearanceEditor />
    </SettingsPageShell>
  );
}
