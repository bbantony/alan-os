import {
  getShoppingItems,
  getStapleSuggestions,
  getShoppingCategories,
  getKnownItems,
  getGroceryBudgetSummary,
} from "./actions";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { ShoppingList } from "./shopping-list";

export default async function ShoppingPage() {
  const profile = await getCurrentProfile();
  const [items, suggestions, categories, knownItems, groceryBudget] = await Promise.all([
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
    />
  );
}
