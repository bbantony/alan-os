import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";
import { SidebarNav } from "./sidebar-nav";
import { QuickAdd } from "./quick-add";
import { PageTransition } from "./page-transition";
import type { ModuleAccess } from "@/lib/permissions";

// The floating "+" is the app's capture control, and as of 5 Sep 2026 it
// captures IN PLACE: a bottom sheet with a text box you can talk into and the
// real expense/task/shopping/receipt forms inside it. It used to be a menu of
// links into each module's create screen, which is the nav bar with an extra
// tap in front of it. Nothing about the sheet navigates except the text box,
// which hands its sentence to the Assistant.
//
// It is mounted here, once, for every screen — so it must stay cheap on mount.
// Everything it needs to fill those forms is fetched on the first OPEN, never
// on shell mount (see quick-add.tsx).
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
