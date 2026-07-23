"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { SettingsLink } from "./settings-links";

function LinkSection({ title, links, activeHref }: { title: string; links: SettingsLink[]; activeHref: string }) {
  if (links.length === 0) return null;
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {links.map((item) => {
          const active = activeHref === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-muted",
                  active && "bg-muted text-primary"
                )}
              >
                <span className={cn("inline-flex", active ? "text-primary" : "text-muted-foreground")}>{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SettingsNav({
  accountLinks,
  moduleLinks,
  adminLink,
  className,
}: {
  accountLinks: SettingsLink[];
  moduleLinks: SettingsLink[];
  adminLink: SettingsLink | null;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav className={cn("space-y-6", className)}>
      <LinkSection title="Account" links={accountLinks} activeHref={pathname} />
      <LinkSection title="Modules" links={moduleLinks} activeHref={pathname} />
      {adminLink && <LinkSection title="Admin" links={[adminLink]} activeHref={pathname} />}
    </nav>
  );
}
