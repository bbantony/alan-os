import Link from "next/link";
import { Palette, KeyRound, LogOut, ShoppingCart, Dumbbell, CalendarClock, Wallet, ShieldCheck } from "lucide-react";
import { signOut } from "./actions";
import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/supabase/profile";
import type { ModuleId } from "@/lib/permissions";

const ACCOUNT_LINKS = [
  { label: "Appearance", href: "/settings/appearance", icon: Palette },
  { label: "Password", href: "/settings/password", icon: KeyRound },
];

// Every module that needs its own configuration gets a page here, following
// the same /settings/<module> pattern (Part B4) — Shopping is the first.
// Visibility now follows the same per-user module_access grid as the rest of
// the app (src/lib/permissions.ts), not a hardcoded ownerOnly flag.
const MODULE_LINKS: { label: string; href: string; icon: typeof ShoppingCart; moduleId: ModuleId }[] = [
  { label: "Shopping", href: "/settings/shopping", icon: ShoppingCart, moduleId: "shopping" },
  { label: "Workout", href: "/settings/workout", icon: Dumbbell, moduleId: "workout" },
  { label: "Calendar & Reminders", href: "/settings/calendar", icon: CalendarClock, moduleId: "calendar" },
  { label: "Money", href: "/settings/money", icon: Wallet, moduleId: "money" },
];

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  const moduleLinks = MODULE_LINKS.filter((link) => profile?.moduleAccess[link.moduleId]);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 font-heading text-2xl font-semibold">Settings</h1>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Account
      </h2>
      <ul className="mb-6 divide-y divide-border rounded-xl border border-border bg-surface">
        {ACCOUNT_LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-muted"
              >
                <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Modules
      </h2>
      <ul className="mb-6 divide-y divide-border rounded-xl border border-border bg-surface">
        {moduleLinks.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-muted"
              >
                <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {profile?.role === "owner" && (
        <>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Admin
          </h2>
          <ul className="mb-6 divide-y divide-border rounded-xl border border-border bg-surface">
            <li>
              <Link
                href="/settings/admin"
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-muted"
              >
                <ShieldCheck className="size-4 text-muted-foreground" strokeWidth={1.75} />
                Users &amp; Crews
              </Link>
            </li>
          </ul>
        </>
      )}

      <form action={signOut}>
        <Button type="submit" variant="outline" className="w-full gap-2">
          <LogOut className="size-4" />
          Sign out
        </Button>
      </form>
    </div>
  );
}
