import type { LucideIcon } from "lucide-react";
import {
  Sun,
  Wallet,
  ListChecks,
  Dumbbell,
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
// access to). Shopping was previously buried under More even though
// it's a daily, at-the-store module — moved up here per owner feedback.
const PRIMARY_CANDIDATES: { id: ModuleId; item: NavItem }[] = [
  { id: "money", item: { label: "Money", href: "/money", icon: Wallet } },
  { id: "tasks", item: { label: "Plan", href: "/plan", icon: ListChecks } },
  { id: "shopping", item: { label: "Shop", href: "/shopping", icon: ShoppingCart } },
  { id: "workout", item: { label: "Workout", href: "/workout", icon: Dumbbell } },
];

/**
 * The tab bar: Today, then the modules this account can open.
 *
 * There is no "More" tab any more (5 Sep 2026). It was a phone-only page whose
 * entire content was three links, and it cost a permanent slot in the tab bar
 * — the sixth, on an account with every module — to hold them. Those three doors now live where they're actually
 * wanted: Settings on the Today masthead, the Timeline on the "Today so far"
 * panel header (that panel is today's slice of it), and the Assistant behind
 * the capture sheet's text box — which is the reason the "+" exists at all.
 * The desktop rail lists all three directly and always did.
 */
export function getNavItems(moduleAccess: ModuleAccess): NavItem[] {
  const items: NavItem[] = [{ label: "Today", href: "/today", icon: Sun }];
  for (const candidate of PRIMARY_CANDIDATES) {
    if (moduleAccess[candidate.id]) items.push(candidate.item);
  }
  return items;
}

/**
 * The desktop rail's second group.
 *
 * Gated on module access since 5 Sep 2026. Both /timeline and /assistant have
 * been aliased to the Tasks module since 26 Aug (ROUTE_MODULE_ALIASES in
 * lib/permissions.ts), so offering them to a workout-only account was two rail
 * entries that bounced straight back to Today. This is the desktop twin of the
 * Timeline icon gated on the Today masthead the same day. The Assistant's
 * TOOLS are gated per module as well (lib/ai/tools.ts); the door and the tools
 * are separate gates and both matter.
 */
export function getMoreLinks(moduleAccess: ModuleAccess): NavItem[] {
  // Timeline and the Assistant are both aliased to the `tasks` module (see
  // ROUTE_MODULE_ALIASES in lib/permissions.ts), so an account without it gets
  // bounced straight back to /today by the route guard. Offering the door
  // anyway is a button that flashes and returns you to where you were — the
  // same dead door the Today masthead's Timeline icon had until 5 Sep 2026.
  // Settings is ungated and always belongs here.
  return [
    ...(moduleAccess.tasks
      ? [
          { label: "Timeline", href: "/timeline", icon: Activity },
          { label: "Assistant", href: "/assistant", icon: Sparkles },
        ]
      : []),
    { label: "Settings", href: "/settings", icon: Settings },
  ];
}
