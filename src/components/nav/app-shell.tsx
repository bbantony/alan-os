import type { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";
import { SidebarNav } from "./sidebar-nav";
import { QuickCaptureButton } from "@/components/quick-capture/quick-capture-button";
import type { Role } from "./nav-items";

export function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  return (
    <div className="flex min-h-full">
      <SidebarNav role={role} />
      <div className="flex flex-1 flex-col">
        <main className="flex-1 pb-20 md:pb-8">{children}</main>
      </div>
      <BottomNav role={role} />
      <QuickCaptureButton />
    </div>
  );
}
