"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getNavItems } from "./nav-items";
import type { ModuleAccess } from "@/lib/permissions";

/**
 * The phone tab bar. Redesigned from a translucent blurred strip with a tinted
 * active icon into a hard-edged row of cells where the active one is a solid
 * ink block.
 *
 * The block matters: with only a colour change to signal "you are here", the
 * active tab was a small tint difference at the very bottom of the screen —
 * genuinely easy to miss. An inverted cell is unmissable at a glance, which is
 * the whole job of a tab bar.
 */
export function BottomNav({ moduleAccess }: { moduleAccess: ModuleAccess }) {
  const pathname = usePathname();
  const items = getNavItems(moduleAccess);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-rule bg-surface md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {items.map((item, i) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 transition-colors",
                  i > 0 && "border-l border-hairline",
                  active
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                <span className="micro-sm truncate text-[0.5625rem]">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
