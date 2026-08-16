"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNavItems, getMoreLinks } from "./nav-items";
import { Wordmark } from "./wordmark";
import type { ModuleAccess } from "@/lib/permissions";

/**
 * The desktop rail. Two changes beyond the styling:
 *
 *   - It now shows the "More" modules (Calendar, Journal, Vinyl, Settings) as a
 *     second ruled group instead of a single "More" link that bounced you to a
 *     phone-shaped menu page. On a 1440px screen there was never a reason to
 *     hide them behind a tap.
 *   - Active state is a full-bleed inverted block that runs to both edges of
 *     the rail, so the current module reads as a slot the page is docked into.
 */
export function SidebarNav({ moduleAccess }: { moduleAccess: ModuleAccess }) {
  const pathname = usePathname();
  const primary = getNavItems(moduleAccess).filter((i) => i.href !== "/more");
  const secondary = getMoreLinks(moduleAccess);

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r-2 border-rule bg-surface md:flex">
      <div className="flex h-16 items-center border-b-2 border-rule px-4">
        <Link href="/today" className="tap-press">
          <Wordmark />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col">
        <SidebarGroup label="Modules" items={primary} pathname={pathname} />
        <SidebarGroup label="More" items={secondary} pathname={pathname} />
      </nav>
    </aside>
  );
}

function SidebarGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: { label: string; href: string; icon: typeof Settings }[];
  pathname: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="border-b-2 border-rule py-2">
      <p className="micro-sm px-4 py-2 text-muted-foreground">{label}</p>
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-foreground hover:bg-muted"
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={active ? 2.5 : 2} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
