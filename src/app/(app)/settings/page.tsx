import Link from "next/link";
import { Palette, KeyRound, LogOut } from "lucide-react";
import { signOut } from "./actions";
import { Button } from "@/components/ui/button";

const LINKS = [
  { label: "Appearance", href: "/settings/appearance", icon: Palette },
  { label: "Password", href: "/settings/password", icon: KeyRound },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 font-heading text-2xl font-semibold">Settings</h1>
      <ul className="mb-6 divide-y divide-border rounded-xl border border-border bg-surface">
        {LINKS.map((item) => {
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
