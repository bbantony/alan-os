import {
  Carrot,
  Milk,
  Beef,
  Snowflake,
  Package,
  Home,
  Pill,
  Shirt,
  MoreHorizontal,
  Tag,
  type LucideIcon,
} from "lucide-react";

export const SHOPPING_ICONS: Record<string, LucideIcon> = {
  Carrot,
  Milk,
  Beef,
  Snowflake,
  Package,
  Home,
  Pill,
  Shirt,
  MoreHorizontal,
  Tag,
};

export function getShoppingIcon(name: string): LucideIcon {
  return SHOPPING_ICONS[name] ?? Tag;
}

export const AVAILABLE_SHOPPING_ICON_NAMES = Object.keys(SHOPPING_ICONS);
