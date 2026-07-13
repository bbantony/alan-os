import type { ShoppingCategoryRow } from "./types";

// Falls back to a canonical category NAME (not id) since categories are now
// per-user rows — the id gets resolved against that user's actual category
// list at guess time, in guessCategoryId() below.
const KEYWORD_MAP: Record<string, string> = {
  milk: "dairy",
  cheese: "dairy",
  yogurt: "dairy",
  butter: "dairy",
  cream: "dairy",
  eggs: "dairy",
  egg: "dairy",
  chicken: "meat",
  beef: "meat",
  pork: "meat",
  bacon: "meat",
  turkey: "meat",
  sausage: "meat",
  fish: "meat",
  salmon: "meat",
  shrimp: "meat",
  apple: "produce",
  apples: "produce",
  banana: "produce",
  bananas: "produce",
  lettuce: "produce",
  spinach: "produce",
  tomato: "produce",
  tomatoes: "produce",
  onion: "produce",
  onions: "produce",
  potato: "produce",
  potatoes: "produce",
  garlic: "produce",
  carrot: "produce",
  carrots: "produce",
  pepper: "produce",
  cucumber: "produce",
  broccoli: "produce",
  avocado: "produce",
  berries: "produce",
  grapes: "produce",
  icecream: "frozen",
  "ice cream": "frozen",
  frozen: "frozen",
  pizza: "frozen",
  bread: "pantry",
  rice: "pantry",
  pasta: "pantry",
  cereal: "pantry",
  flour: "pantry",
  sugar: "pantry",
  oil: "pantry",
  sauce: "pantry",
  beans: "pantry",
  soup: "pantry",
  coffee: "pantry",
  tea: "pantry",
  protein: "pantry",
  "protein powder": "pantry",
  soap: "household",
  "dish soap": "household",
  detergent: "household",
  "toilet paper": "household",
  "paper towel": "household",
  "paper towels": "household",
  napkins: "household",
  trash: "household",
  "trash bags": "household",
  shampoo: "pharmacy",
  toothpaste: "pharmacy",
  vitamins: "pharmacy",
  medicine: "pharmacy",
  ibuprofen: "pharmacy",
  bandages: "pharmacy",
  slacks: "clothes",
  pants: "clothes",
  jeans: "clothes",
  shirt: "clothes",
  tshirt: "clothes",
  "t-shirt": "clothes",
  blouse: "clothes",
  sweater: "clothes",
  hoodie: "clothes",
  jacket: "clothes",
  coat: "clothes",
  socks: "clothes",
  shoes: "clothes",
  sneakers: "clothes",
  boots: "clothes",
  underwear: "clothes",
  dress: "clothes",
  skirt: "clothes",
  shorts: "clothes",
  belt: "clothes",
  gloves: "clothes",
  scarf: "clothes",
};

function guessCategoryName(name: string): string | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  if (KEYWORD_MAP[key]) return KEYWORD_MAP[key];

  for (const [word, category] of Object.entries(KEYWORD_MAP)) {
    if (key.includes(word)) return category;
  }

  return null;
}

export function buildKnownItemsMap(
  categoryItems: { item_name: string; category_id: string }[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of categoryItems) {
    map.set(entry.item_name.trim().toLowerCase(), entry.category_id);
  }
  return map;
}

// Resolution order: (1) this user's own learned/known items, (2) the static
// keyword dictionary resolved against this user's actual category names,
// (3) that user's protected "Other" category, (4) null if even that is missing.
export function guessCategoryId(
  name: string,
  categories: ShoppingCategoryRow[],
  knownItems: Map<string, string>
): string | null {
  const key = name.trim().toLowerCase();
  if (!key) return categories.find((c) => c.is_protected)?.id ?? null;

  const known = knownItems.get(key);
  if (known) return known;

  const guessedName = guessCategoryName(key);
  if (guessedName) {
    const match = categories.find((c) => c.name.toLowerCase() === guessedName);
    if (match) return match.id;
  }

  return categories.find((c) => c.is_protected)?.id ?? categories[0]?.id ?? null;
}
