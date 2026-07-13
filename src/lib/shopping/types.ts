export type ShoppingCategory =
  | "produce"
  | "dairy"
  | "meat"
  | "frozen"
  | "pantry"
  | "household"
  | "pharmacy"
  | "other";

export const SHOPPING_CATEGORIES: ShoppingCategory[] = [
  "produce",
  "dairy",
  "meat",
  "frozen",
  "pantry",
  "household",
  "pharmacy",
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
  other: "Other",
};

export interface ShoppingItem {
  id: string;
  user_id: string;
  name: string;
  category: ShoppingCategory;
  is_staple: boolean;
  checked: boolean;
  on_list: boolean;
  last_purchased_at: string | null;
  created_at: string;
}
