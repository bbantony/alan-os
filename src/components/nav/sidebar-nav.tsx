"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getNavItems } from "./nav-items";
import type { ModuleAccess } from "@/lib/permissions";

export function SidebarNav({ moduleAccess }: { moduleAccess: ModuleAccess }) {
  const pathname = usePathname();
  const items = getNavItems(moduleAccess);

  return (
    <aside className="hidden w-56 shrink-0 border-r border-border bg-surface md:flex md:flex-col md:gap-1 md:p-4">
      <div className="mb-4 px-2">
        <span className="font-heading text-lg font-semibold tracking-tight">Alan OS</span>
      </div>
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted"
            )}
          >
            <Icon className="size-4" strokeWidth={active ? 2.25 : 1.75} />
            {item.label}
          </Link>
        );
      })}
    </aside>
  );
}
