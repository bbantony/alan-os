import Link from "next/link";
import { Palette, KeyRound, LogOut, ShoppingCart, Dumbbell, CalendarClock, Wallet } from "lucide-react";
import { signOut } from "./actions";
import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/supabase/profile";

const ACCOUNT_LINKS = [
  { label: "Appearance", href: "/settings/appearance", icon: Palette },
  { label: "Password", href: "/settings/password", icon: KeyRound },
];

// Every module that needs its own configuration gets a page here, following
// the same /settings/<module> pattern (Part B4) — Shopping is the first.
// workout_member only ever sees the Workout entry (SPEC.md Part C3: that role
// sees only Workout + Settings appearance/password) — everything else here is
// owner/full_user data they must never see, even as a settings link.
const MODULE_LINKS = [
  { label: "Shopping", href: "/settings/shopping", icon: ShoppingCart, ownerOnly: true },
  { label: "Workout", href: "/settings/workout", icon: Dumbbell, ownerOnly: false },
  { label: "Calendar & Reminders", href: "/settings/calendar", icon: CalendarClock, ownerOnly: true },
  { label: "Money", href: "/settings/money", icon: Wallet, ownerOnly: true },
];

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  const moduleLinks = MODULE_LINKS.filter(
    (link) => !link.ownerOnly || profile?.role !== "workout_member"
  );

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

      <form action={signOut}>
        <Button type="submit" variant="outline" className="w-full gap-2">
          <LogOut className="size-4" />
          Sign out
        </Button>
      </form>
    </div>
  );
}
