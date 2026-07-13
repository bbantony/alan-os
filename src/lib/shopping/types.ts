export type ShoppingUnit = "count" | "g" | "kg" | "ml" | "l";

export const SHOPPING_UNITS: ShoppingUnit[] = ["count", "g", "kg", "ml", "l"];

export const SHOPPING_UNIT_LABELS: Record<ShoppingUnit, string> = {
  count: "ct",
  g: "g",
  kg: "kg",
  ml: "mL",
  l: "L",
};

export interface ShoppingCategoryRow {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  sort_order: number;
  is_protected: boolean;
  created_at: string;
}

export interface ShoppingCategoryItem {
  id: string;
  user_id: string;
  category_id: string;
  item_name: string;
  created_at: string;
}

export interface ShoppingItem {
  id: string;
  user_id: string;
  name: string;
  category_id: string;
  is_staple: boolean;
  checked: boolean;
  on_list: boolean;
  quantity: number | null;
  quantity_unit: ShoppingUnit | null;
  last_purchased_at: string | null;
  created_at: string;
}
