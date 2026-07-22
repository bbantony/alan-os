"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { disconnectGcal, setGcalSyncEnabled } from "@/app/(app)/calendar/actions";

export function CalendarConnect({
  status,
}: {
  status: { connected: boolean; calendarId: string | null; syncEnabled: boolean };
}) {
  const [syncEnabled, setSyncEnabled] = useState(status.syncEnabled);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleToggle() {
    const next = !syncEnabled;
    setSyncEnabled(next);
    await setGcalSyncEnabled({ enabled: next });
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect Google Calendar?")) return;
    setDisconnecting(true);
    await disconnectGcal();
  }

  if (!status.connected) {
    return (
      <a href="/api/auth/google/start">
        <Button type="button" className="w-full">
          Connect Google Calendar
        </Button>
      </a>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-3">
        <div>
          <p className="text-sm font-medium">Connected</p>
          <p className="text-xs text-muted-foreground">Syncing your primary calendar</p>
        </div>
        <button
          onClick={handleToggle}
          className={cn(
            "tap-press rounded-full px-3 py-1 text-xs font-medium",
            syncEnabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {syncEnabled ? "On" : "Off"}
        </button>
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={handleDisconnect} disabled={disconnecting}>
        {disconnecting ? "Disconnecting…" : "Disconnect"}
      </Button>
    </div>
  );
}
