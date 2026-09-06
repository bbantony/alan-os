import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";
import { SidebarNav } from "./sidebar-nav";
import { QuickAdd } from "./quick-add";
import { PageTransition } from "./page-transition";
import type { ModuleAccess } from "@/lib/permissions";

// The floating "+" is the app's capture control, and as of 5 Sep 2026 it
// captures IN PLACE: a bottom sheet with the real assistant chat and the real
// expense/task/shopping/receipt forms inside it. It used to be a menu of links
// into each module's create screen, which is the nav bar with an extra tap in
// front of it. NOTHING about the sheet navigates any more — the text box that
// used to hand your sentence to /assistant was replaced by the assistant
// itself (6 Sep 2026).
//
// It is mounted here, once, for every screen — so it must stay cheap on mount.
// Everything it needs to fill those forms is fetched on the first OPEN, never
// on shell mount (see quick-add.tsx).
//
// Mounted on every route INCLUDING /assistant, deliberately: the sheet's forms
// are worth having there too. It is the sheet itself that leaves its chat out
// on that one route, so there is never a second chat alive beside the page's.
// That decision lives in quick-add.tsx, next to the component it affects,
// rather than as a route test up here.
export function AppShell({
  moduleAccess,
  children,
}: {
  moduleAccess: ModuleAccess;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full">
      <SidebarNav moduleAccess={moduleAccess} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 pb-24 md:pb-10">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <BottomNav moduleAccess={moduleAccess} />
      <QuickAdd moduleAccess={moduleAccess} />
    </div>
  );
}
