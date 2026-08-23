import type { LucideIcon } from "lucide-react";
import {
  Sun,
  Wallet,
  ListChecks,
  Dumbbell,
  Menu,
  Settings,
  ShoppingCart,
  Sparkles,
  Activity,
} from "lucide-react";
import type { ModuleAccess, ModuleId } from "@/lib/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Bottom tab bar: Today + these module slots (only the ones the account has
// access to) + More. Shopping was previously buried under More even though
// it's a daily, at-the-store module — moved up here per owner feedback.
const PRIMARY_CANDIDATES: { id: ModuleId; item: NavItem }[] = [
  { id: "money", item: { label: "Money", href: "/money", icon: Wallet } },
  { id: "tasks", item: { label: "Plan", href: "/plan", icon: ListChecks } },
  { id: "shopping", item: { label: "Shop", href: "/shopping", icon: ShoppingCart } },
  { id: "workout", item: { label: "Workout", href: "/workout", icon: Dumbbell } },
];

export function getNavItems(moduleAccess: ModuleAccess): NavItem[] {
  const items: NavItem[] = [{ label: "Today", href: "/today", icon: Sun }];
  for (const candidate of PRIMARY_CANDIDATES) {
    if (moduleAccess[candidate.id]) items.push(candidate.item);
  }
  items.push({ label: "More", href: "/more", icon: Menu });
  return items;
}

/**
 * What sits behind "More".
 *
 * Takes no module access any more: Journal and Vinyl were the only gated
 * entries here and both are gone. The Assistant has no module of its own —
 * what it can *do* is gated per tool on the same grid (lib/ai/tools.ts), so
 * everyone gets the door and the door only opens onto what they already have.
 */
export function getMoreLinks(): NavItem[] {
  return [
    { label: "Timeline", href: "/timeline", icon: Activity },
    { label: "Assistant", href: "/assistant", icon: Sparkles },
    { label: "Settings", href: "/settings", icon: Settings },
  ];
}
