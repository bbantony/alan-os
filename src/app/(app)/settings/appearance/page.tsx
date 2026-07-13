import { AppearanceEditor } from "./appearance-editor";

export default function AppearanceSettingsPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 font-heading text-2xl font-semibold">Appearance</h1>
      <AppearanceEditor />
    </div>
  );
}
