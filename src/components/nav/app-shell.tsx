import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";
import { SidebarNav } from "./sidebar-nav";
import { QuickCaptureButton } from "@/components/quick-capture/quick-capture-button";
import type { ModuleAccess } from "@/lib/permissions";

export function AppShell({ moduleAccess, children }: { moduleAccess: ModuleAccess; children: ReactNode }) {
  return (
    <div className="flex min-h-full">
      <SidebarNav moduleAccess={moduleAccess} />
      <div className="flex flex-1 flex-col">
        <main className="flex-1 pb-20 md:pb-8">{children}</main>
      </div>
      <BottomNav moduleAccess={moduleAccess} />
      <QuickCaptureButton />
    </div>
  );
}
