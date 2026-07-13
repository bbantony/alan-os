import {
  getShoppingItems,
  getStapleSuggestions,
  getShoppingCategories,
  getKnownItems,
} from "./actions";
import { ShoppingList } from "./shopping-list";

export default async function ShoppingPage() {
  const [items, suggestions, categories, knownItems] = await Promise.all([
    getShoppingItems(),
    getStapleSuggestions(),
    getShoppingCategories(),
    getKnownItems(),
  ]);

  return (
    <ShoppingList
      initialItems={items}
      initialSuggestions={suggestions}
      categories={categories}
      initialKnownItems={knownItems}
    />
  );
}
