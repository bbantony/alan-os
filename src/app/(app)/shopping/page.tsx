import {
  getShoppingItems,
  getStapleSuggestions,
  getShoppingCategories,
  getKnownItems,
  getGroceryBudgetSummary,
} from "./actions";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { ShoppingList } from "./shopping-list";

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const profile = await getCurrentProfile();
  const [{ new: isNew }, items, suggestions, categories, knownItems, groceryBudget] =
    await Promise.all([
      searchParams,
      getShoppingItems(),
      getStapleSuggestions(),
      getShoppingCategories(),
      getKnownItems(),
      profile?.moduleAccess.money ? getGroceryBudgetSummary() : Promise.resolve(null),
    ]);

  return (
    <ShoppingList
      initialItems={items}
      initialSuggestions={suggestions}
      categories={categories}
      initialKnownItems={knownItems}
      groceryBudget={groceryBudget}
      autoFocusNew={isNew === "1"}
    />
  );
}
