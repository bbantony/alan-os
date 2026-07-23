import { Palette, KeyRound, ShoppingCart, Dumbbell, CalendarClock, Wallet, ShieldCheck, type LucideIcon } from "lucide-react";
import type { CurrentProfile } from "@/lib/supabase/profile";
import type { ModuleId } from "@/lib/permissions";

// Raw data (component references, not yet rendered) — fine to use freely
// from Server Component code, since nothing here crosses the client
// boundary until getVisibleSettingsLinks resolves it below.
interface RawLink {
  label: string;
  href: string;
  icon: LucideIcon;
}

const ACCOUNT_LINKS: RawLink[] = [
  { label: "Appearance", href: "/settings/appearance", icon: Palette },
  { label: "Password", href: "/settings/password", icon: KeyRound },
];

// Every module that needs its own configuration gets a page here, following
// the same /settings/<module> pattern (Part B4) — Shopping is the first.
// Visibility follows the same per-user module_access grid as the rest of
// the app (src/lib/permissions.ts), not a hardcoded ownerOnly flag.
const MODULE_LINKS: (RawLink & { moduleId: ModuleId })[] = [
  { label: "Shopping", href: "/settings/shopping", icon: ShoppingCart, moduleId: "shopping" },
  { label: "Workout", href: "/settings/workout", icon: Dumbbell, moduleId: "workout" },
  { label: "Calendar & Reminders", href: "/settings/calendar", icon: CalendarClock, moduleId: "calendar" },
  { label: "Money", href: "/settings/money", icon: Wallet, moduleId: "money" },
];

const ADMIN_LINK: RawLink = { label: "Users & Crews", href: "/settings/admin", icon: ShieldCheck };

// What settings-nav.tsx (a Client Component, for active-link highlighting
// via usePathname) actually receives — an already-rendered icon element,
// never a bare component reference. A raw LucideIcon component crossing the
// server->client boundary as a prop throws "Functions cannot be passed
// directly to Client Components" — the exact bug that broke /today and
// /settings in production; this file exists specifically so it can't
// recur here.
export interface SettingsLink {
  label: string;
  href: string;
  icon: React.ReactNode;
}

function resolve(link: RawLink): SettingsLink {
  const Icon = link.icon;
  return { label: link.label, href: link.href, icon: <Icon className="size-4" /> };
}

// The single place both the mobile index page and the desktop sidebar pull
// their link list from — previously duplicated between the two. Only ever
// called from Server Components (settings/layout.tsx, settings/page.tsx),
// which is exactly why it's safe to build JSX here.
export function getVisibleSettingsLinks(profile: CurrentProfile | null) {
  return {
    accountLinks: ACCOUNT_LINKS.map(resolve),
    moduleLinks: MODULE_LINKS.filter((link) => profile?.moduleAccess[link.moduleId]).map(resolve),
    adminLink: profile?.role === "owner" ? resolve(ADMIN_LINK) : null,
  };
}
