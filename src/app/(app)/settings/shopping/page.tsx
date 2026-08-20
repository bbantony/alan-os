import { getShoppingCategories, getKnownItems } from "@/app/(app)/shopping/actions";
import { SettingsPageShell } from "../settings-page-shell";
import { ShoppingSettings } from "./shopping-settings";
import { ShoppingPreferences } from "./shopping-preferences";
import { getPreferences } from "../preferences-actions";

export default async function ShoppingSettingsPage() {
  const [categories, knownItems, preferences] = await Promise.all([
    getShoppingCategories(),
    getKnownItems(),
    getPreferences(),
  ]);

  return (
    <SettingsPageShell title="Shopping">
      <ShoppingPreferences initial={preferences} />
      <ShoppingSettings initialCategories={categories} initialKnownItems={knownItems} />
    </SettingsPageShell>
  );
}
