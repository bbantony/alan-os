import { getShoppingCategories, getKnownItems } from "@/app/(app)/shopping/actions";
import { ShoppingSettings } from "./shopping-settings";

export default async function ShoppingSettingsPage() {
  const [categories, knownItems] = await Promise.all([getShoppingCategories(), getKnownItems()]);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 font-heading text-2xl font-semibold">Shopping categories</h1>
      <ShoppingSettings initialCategories={categories} initialKnownItems={knownItems} />
    </div>
  );
}
