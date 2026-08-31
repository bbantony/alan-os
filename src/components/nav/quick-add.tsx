"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Sparkles,
  ListChecks,
  Wallet,
  ShoppingCart,
  Dumbbell,
  type LucideIcon,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ModuleAccess, ModuleId } from "@/lib/permissions";

/**
 * The cross-module entry point: one control, on every screen, that starts any
 * of the app's create flows.
 *
 * This is NOT the Phase 7 quick-capture parser, and it deliberately makes no
 * claim to be — there's no free-text box and nothing here needs AI. A previous
 * floating "+" was removed for exactly that reason: it opened a "coming soon"
 * dialog and did nothing (see the note in app-shell.tsx's history). This one
 * does real work today, by routing straight into a module's existing create
 * flow via a `?new=1` parameter that each destination page acts on — landing
 * you in the form with the cursor already in it, not just on the page.
 *
 * Only modules the account can actually open are offered, using the same
 * ModuleAccess resolver the nav and route guard use.
 */

interface QuickAddTarget {
  /**
   * The module that gates this entry.
   *
   * Was `ModuleId | "always"`, and nothing ever used `"always"` — it only
   * forced an `as ModuleId` cast on the filter below. The Assistant looked
   * like the case for it, but it is gated too (see ROUTE_MODULE_ALIASES in
   * lib/permissions.ts, where /assistant maps to `tasks`), and an entry that
   * appears and then bounces you to /today is worse than no entry.
   * KEEP THIS IN STEP with that alias list.
   */
  id: ModuleId;
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
}

const TARGETS: QuickAddTarget[] = [
  {
    // FIRST, deliberately. Alan's words on trying to find it: "how the fuck do
    // I access the ai". It was three taps down behind the More menu — the
    // feature he was most vocal about wanting, in the least reachable place in
    // the app. This is the + he already sees on every screen, and the comment
    // at the top of this file always said free-text capture belonged here.
    id: "tasks",
    label: "Ask or tell it anything",
    hint: "Type or talk — it can log, add and change things",
    href: "/assistant",
    icon: Sparkles,
  },
  {
    id: "tasks",
    // Reminders used to be a separate entry here. They're a setting on a task
    // now, so "Task or reminder" is one destination — offering both would send
    // you to the same form under two names.
    label: "Task or reminder",
    hint: "Something to do, or a nudge",
    href: "/plan?new=1",
    icon: ListChecks,
  },
  {
    id: "money",
    label: "Expense",
    hint: "Log a spend",
    href: "/money?new=1",
    icon: Wallet,
  },
  {
    id: "shopping",
    label: "Shopping item",
    hint: "Add to the list",
    href: "/shopping?new=1",
    icon: ShoppingCart,
  },
  {
    id: "workout",
    label: "Workout",
    hint: "Start a session",
    href: "/workout/new",
    icon: Dumbbell,
  },
];

export function QuickAdd({ moduleAccess }: { moduleAccess: ModuleAccess }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const targets = TARGETS.filter((t) => moduleAccess[t.id]);

  // An account with access to nothing that can be created from here shouldn't
  // see the control at all.
  if (targets.length === 0) return null;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add something"
        className="press-hard tap-target fixed right-4 bottom-24 z-40 flex size-14 items-center justify-center border-2 border-rule bg-primary text-primary-foreground md:bottom-8"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <Plus className="size-6" strokeWidth={3} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-sm">
          <DialogHeader className="mx-0 mt-0 px-4">
            <DialogTitle>Add</DialogTitle>
            <DialogDescription className="text-xs">
              Jump straight into a form.
            </DialogDescription>
          </DialogHeader>

          <div>
            {targets.map((target, i) => {
              const Icon = target.icon;
              return (
                <button
                  key={target.href}
                  type="button"
                  onClick={() => go(target.href)}
                  className={`tap-press flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted ${
                    i > 0 ? "border-t border-hairline" : ""
                  }`}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center border-2 border-rule bg-surface">
                    <Icon className="size-4" strokeWidth={2.5} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{target.label}</span>
                    <span className="micro-sm block text-muted-foreground">
                      {target.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
