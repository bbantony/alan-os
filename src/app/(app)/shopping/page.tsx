import {
  getShoppingItems,
  getShoppingCategories,
  getKnownItems,
  getGroceryBudgetSummary,
} from "./actions";
import { getPriceBook, getSmartStapleSuggestions } from "./price-actions";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { ShoppingList } from "./shopping-list";

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const profile = await getCurrentProfile();
  const [{ new: isNew }, items, suggestions, categories, knownItems, groceryBudget, priceBook] =
    await Promise.all([
      searchParams,
      getShoppingItems(),
      getSmartStapleSuggestions(),
      getShoppingCategories(),
      getKnownItems(),
      profile?.moduleAccess.money ? getGroceryBudgetSummary() : Promise.resolve(null),
      getPriceBook(),
    ]);

  return (
    <ShoppingList
      initialItems={items}
      initialSuggestions={suggestions}
      priceBook={priceBook}
      categories={categories}
      initialKnownItems={knownItems}
      groceryBudget={groceryBudget}
      autoFocusNew={isNew === "1"}
    />
  );
}
