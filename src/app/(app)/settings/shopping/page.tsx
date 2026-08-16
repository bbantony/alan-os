import { getShoppingCategories, getKnownItems } from "@/app/(app)/shopping/actions";
import { SettingsPageShell } from "../settings-page-shell";
import { ShoppingSettings } from "./shopping-settings";

export default async function ShoppingSettingsPage() {
  const [categories, knownItems] = await Promise.all([getShoppingCategories(), getKnownItems()]);

  return (
    <SettingsPageShell title="Shopping">
      <ShoppingSettings initialCategories={categories} initialKnownItems={knownItems} />
    </SettingsPageShell>
  );
}
