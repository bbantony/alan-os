import { Palette, KeyRound, ShoppingCart, Dumbbell, CalendarClock, Wallet, ShieldCheck, type LucideIcon } from "lucide-react";
import type { CurrentProfile } from "@/lib/supabase/profile";
import type { ModuleId } from "@/lib/permissions";

export interface SettingsLink {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const ACCOUNT_LINKS: SettingsLink[] = [
  { label: "Appearance", href: "/settings/appearance", icon: Palette },
  { label: "Password", href: "/settings/password", icon: KeyRound },
];

// Every module that needs its own configuration gets a page here, following
// the same /settings/<module> pattern (Part B4) — Shopping is the first.
// Visibility follows the same per-user module_access grid as the rest of
// the app (src/lib/permissions.ts), not a hardcoded ownerOnly flag.
const MODULE_LINKS: (SettingsLink & { moduleId: ModuleId })[] = [
  { label: "Shopping", href: "/settings/shopping", icon: ShoppingCart, moduleId: "shopping" },
  { label: "Workout", href: "/settings/workout", icon: Dumbbell, moduleId: "workout" },
  { label: "Calendar & Reminders", href: "/settings/calendar", icon: CalendarClock, moduleId: "calendar" },
  { label: "Money", href: "/settings/money", icon: Wallet, moduleId: "money" },
];

export const ADMIN_LINK: SettingsLink = { label: "Users & Crews", href: "/settings/admin", icon: ShieldCheck };

// The single place both the mobile index page and the desktop sidebar pull
// their link list from — previously duplicated between the two.
export function getVisibleSettingsLinks(profile: CurrentProfile | null) {
  return {
    accountLinks: ACCOUNT_LINKS,
    moduleLinks: MODULE_LINKS.filter((link) => profile?.moduleAccess[link.moduleId]),
    adminLink: profile?.role === "owner" ? ADMIN_LINK : null,
  };
}
