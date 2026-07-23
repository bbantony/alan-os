import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";
import { SidebarNav } from "./sidebar-nav";
import { PageTransition } from "./page-transition";
import type { ModuleAccess } from "@/lib/permissions";

// The floating quick-capture "+" button used to live here — removed per
// owner feedback ("what is that?"): it only ever opened a "coming soon"
// dialog, since real quick-capture (parsing free text/speech into the right
// module) is Phase 7 AI work that doesn't exist yet. A non-functional button
// on every single screen is worse than no button — Phase 7 will add the
// real thing back once it actually does something.
export function AppShell({ moduleAccess, children }: { moduleAccess: ModuleAccess; children: ReactNode }) {
  return (
    <div className="flex min-h-full">
      <SidebarNav moduleAccess={moduleAccess} />
      <div className="flex flex-1 flex-col">
        <main className="flex-1 pb-20 md:pb-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      <BottomNav moduleAccess={moduleAccess} />
    </div>
  );
}
