import {
  ListChecks,
  ShoppingCart,
  Wallet,
  Dumbbell,
  Settings,
  Sparkles,
  Activity,
  type LucideIcon,
} from "lucide-react";

import { Panel, PanelHead, PanelRow } from "@/components/ui/panel";
import { Micro } from "@/components/ui/tag";
import type { ModuleAccess } from "@/lib/permissions";

/**
 * Every place the dashboard can send you, in one ruled list.
 *
 * This replaces the four "coming soon" placeholder cards that used to take up
 * half the dashboard (AI briefing, weather, world news, local news) plus the
 * now-removed Journal and Vinyl stubs. Six dashboard-sized tiles advertising things that
 * don't exist yet is most of why the old Today screen felt cluttered — they're
 * now one muted line at the bottom, which is all an unbuilt feature has earned.
 */

interface Destination {
  key: keyof ModuleAccess | "settings";
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
}

const DESTINATIONS: Destination[] = [
  { key: "tasks", label: "Plan", hint: "Tasks, routines and your calendar", href: "/plan", icon: ListChecks },
  { key: "money", label: "Money", hint: "Budgets, spending, goals", href: "/money", icon: Wallet },
  { key: "shopping", label: "Shopping", hint: "The list and your staples", href: "/shopping", icon: ShoppingCart },
  { key: "workout", label: "Workout", hint: "Sessions, crew, streaks", href: "/workout", icon: Dumbbell },
];

export function JumpTo({ moduleAccess }: { moduleAccess: ModuleAccess }) {
  const available = DESTINATIONS.filter((d) => moduleAccess[d.key as keyof ModuleAccess]);

  return (
    <Panel>
      <PanelHead title="Jump to" />

      {available.map((d) => {
        const Icon = d.icon;
        return (
          <PanelRow key={d.href} href={d.href} last={false}>
            <span className="flex items-center gap-3">
              <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{d.label}</span>
                <Micro className="block truncate">{d.hint}</Micro>
              </span>
            </span>
          </PanelRow>
        );
      })}

      <PanelRow href="/timeline">
        <span className="flex items-center gap-3">
          <Activity className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">Timeline</span>
            <Micro className="block truncate">Everything you did, in one line</Micro>
          </span>
        </span>
      </PanelRow>

      <PanelRow href="/assistant">
        <span className="flex items-center gap-3">
          <Sparkles className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">Assistant</span>
            <Micro className="block truncate">Talk or type — it can log, add and change things</Micro>
          </span>
        </span>
      </PanelRow>

      <PanelRow href="/settings" last>
        <span className="flex items-center gap-3">
          <Settings className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">Settings</span>
            <Micro className="block truncate">Appearance, modules, accounts</Micro>
          </span>
        </span>
      </PanelRow>

      <p className="hatch border-t-2 border-rule px-3 py-2.5">
        <Micro>
          Coming later — morning briefing, weather &amp; news (phase 7)
        </Micro>
      </p>
    </Panel>
  );
}
