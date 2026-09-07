import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";
import { SidebarNav } from "./sidebar-nav";
import { QuickAdd } from "./quick-add";
import { AssistantDock } from "./assistant-dock";
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
//
// THE THIRD COLUMN (7 Sep 2026). On a screen wide AND tall enough — the Fold's
// unfolded inner display, a laptop — the assistant is docked permanently down
// the right instead of living behind the "+". Narrow screens are untouched:
// AssistantDock renders literally nothing there. It is the same one chat
// component; whether it or the capture sheet owns it is decided in exactly one
// place, `useAssistantDockLive` in assistant-dock.tsx, which quick-add.tsx also
// calls. See the header of assistant-chat.tsx for why two would be a bug.
//
// The row is sidebar / page / dock, and the middle one keeps `min-w-0` so the
// page shrinks to fit rather than pushing the dock off the edge.
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
      <AssistantDock moduleAccess={moduleAccess} />
      <BottomNav moduleAccess={moduleAccess} />
      <QuickAdd moduleAccess={moduleAccess} />
    </div>
  );
}
