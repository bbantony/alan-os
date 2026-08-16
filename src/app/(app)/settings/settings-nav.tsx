"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel, PanelHead } from "@/components/ui/panel";
import type { SettingsLink } from "./settings-links";

function LinkSection({
  title,
  links,
  activeHref,
}: {
  title: string;
  links: SettingsLink[];
  activeHref: string;
}) {
  if (links.length === 0) return null;
  return (
    <Panel>
      <PanelHead title={title} />
      <ul>
        {links.map((item, i) => {
          const active = activeHref === item.href;
          return (
            <li key={item.href} className={cn(i > 0 && "border-t border-hairline")}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "tap-press flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-foreground text-background" : "hover:bg-muted"
                )}
              >
                <span
                  className={cn(
                    "inline-flex shrink-0",
                    active ? "text-background" : "text-muted-foreground"
                  )}
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <ChevronRight
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-background/60" : "text-muted-foreground/60"
                  )}
                  strokeWidth={2.5}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
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
    <nav className={cn("flex flex-col gap-4", className)}>
      <LinkSection title="Account" links={accountLinks} activeHref={pathname} />
      <LinkSection title="Modules" links={moduleLinks} activeHref={pathname} />
      {adminLink && <LinkSection title="Admin" links={[adminLink]} activeHref={pathname} />}
    </nav>
  );
}
