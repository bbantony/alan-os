import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";
import { SidebarNav } from "./sidebar-nav";
import { QuickAdd } from "./quick-add";
import { PageTransition } from "./page-transition";
import type { ModuleAccess } from "@/lib/permissions";

// The floating quick-capture "+" is back — but as a real control this time.
// The old one was removed because it only ever opened a "coming soon" dialog
// (real free-text capture is Phase 7 AI work). The new QuickAdd doesn't
// pretend to parse anything: it routes into each module's existing create
// form, which is genuinely useful today and needs no AI at all.
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
