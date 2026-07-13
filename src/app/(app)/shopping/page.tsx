import { getShoppingItems, getStapleSuggestions } from "./actions";
import { ShoppingList } from "./shopping-list";

export default async function ShoppingPage() {
  const [items, suggestions] = await Promise.all([getShoppingItems(), getStapleSuggestions()]);

  return <ShoppingList initialItems={items} initialSuggestions={suggestions} />;
}
