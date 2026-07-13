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

export type Role = "owner" | "workout_member" | "full_user";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const OWNER_NAV: NavItem[] = [
  { label: "Today", href: "/today", icon: Sun },
  { label: "Money", href: "/money", icon: Wallet },
  { label: "Tasks", href: "/tasks", icon: ListChecks },
  { label: "Workout", href: "/workout", icon: Dumbbell },
  { label: "More", href: "/more", icon: Menu },
];

const WORKOUT_MEMBER_NAV: NavItem[] = [
  { label: "Workout", href: "/workout", icon: Dumbbell },
  { label: "Settings", href: "/settings/appearance", icon: Settings },
];

export function getNavItems(role: Role): NavItem[] {
  if (role === "workout_member") return WORKOUT_MEMBER_NAV;
  return OWNER_NAV;
}

export const MORE_LINKS: NavItem[] = [
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Journal", href: "/journal", icon: BookImage },
  { label: "Vinyl", href: "/vinyl", icon: Disc3 },
  { label: "Shopping", href: "/shopping", icon: ShoppingCart },
  { label: "Settings", href: "/settings/appearance", icon: Settings },
];
