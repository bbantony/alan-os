import type { LucideIcon } from "lucide-react";
import {
  Sun,
  Wallet,
  ListChecks,
  Dumbbell,
  Menu,
  Settings,
  CalendarDays,
  BookImage,
  Disc3,
  ShoppingCart,
} from "lucide-react";
import type { ModuleAccess, ModuleId } from "@/lib/permissions";

export type Role = "owner" | "workout_member" | "full_user";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

// Bottom tab bar has room for Today + 3 module slots + More — priority order
// picks which modules fill those 3 slots when a user has access to more or
// fewer than 3 (Today and More are always present, neither is module-gated).
const PRIMARY_CANDIDATES: { id: ModuleId; item: NavItem }[] = [
  { id: "money", item: { label: "Money", href: "/money", icon: Wallet } },
  { id: "tasks", item: { label: "Tasks", href: "/tasks", icon: ListChecks } },
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

const MORE_CANDIDATES: { id: ModuleId; item: NavItem }[] = [
  { id: "calendar", item: { label: "Calendar", href: "/calendar", icon: CalendarDays } },
  { id: "journal", item: { label: "Journal", href: "/journal", icon: BookImage } },
  { id: "vinyl", item: { label: "Vinyl", href: "/vinyl", icon: Disc3 } },
  { id: "shopping", item: { label: "Shopping", href: "/shopping", icon: ShoppingCart } },
];

export function getMoreLinks(moduleAccess: ModuleAccess): NavItem[] {
  const items = MORE_CANDIDATES.filter((c) => moduleAccess[c.id]).map((c) => c.item);
  items.push({ label: "Settings", href: "/settings", icon: Settings });
  return items;
}
