export type ShoppingCategory =
  | "produce"
  | "dairy"
  | "meat"
  | "frozen"
  | "pantry"
  | "household"
  | "pharmacy"
  | "clothes"
  | "other";

export const SHOPPING_CATEGORIES: ShoppingCategory[] = [
  "produce",
  "dairy",
  "meat",
  "frozen",
  "pantry",
  "household",
  "pharmacy",
  "clothes",
  "other",
];

export const SHOPPING_CATEGORY_LABELS: Record<ShoppingCategory, string> = {
  produce: "Produce",
  dairy: "Dairy",
  meat: "Meat",
  frozen: "Frozen",
  pantry: "Pantry",
  household: "Household",
  pharmacy: "Pharmacy",
  clothes: "Clothes",
  other: "Other",
};

export type ShoppingUnit = "count" | "g" | "kg" | "ml" | "l";

export const SHOPPING_UNITS: ShoppingUnit[] = ["count", "g", "kg", "ml", "l"];

export const SHOPPING_UNIT_LABELS: Record<ShoppingUnit, string> = {
  count: "ct",
  g: "g",
  kg: "kg",
  ml: "mL",
  l: "L",
};

export interface ShoppingItem {
  id: string;
  user_id: string;
  name: string;
  category: ShoppingCategory;
  is_staple: boolean;
  checked: boolean;
  on_list: boolean;
  quantity: number | null;
  quantity_unit: ShoppingUnit | null;
  last_purchased_at: string | null;
  created_at: string;
}
