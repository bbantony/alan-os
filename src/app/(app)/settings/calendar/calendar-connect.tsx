"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { disconnectGcal, setGcalSyncEnabled } from "@/app/(app)/calendar/actions";

export function CalendarConnect({
  status,
}: {
  status: { connected: boolean; calendarId: string | null; syncEnabled: boolean };
}) {
  const [syncEnabled, setSyncEnabled] = useState(status.syncEnabled);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleToggle(next: boolean) {
    setSyncEnabled(next);
    await setGcalSyncEnabled({ enabled: next });
    toast.success(next ? "Syncing turned on" : "Syncing turned off");
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect Google Calendar?")) return;
    setDisconnecting(true);
    await disconnectGcal();
    toast.success("Google Calendar disconnected");
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
        <Switch checked={syncEnabled} onCheckedChange={handleToggle} aria-label="Toggle calendar sync" />
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={handleDisconnect} disabled={disconnecting}>
        {disconnecting ? "Disconnecting…" : "Disconnect"}
      </Button>
    </div>
  );
}
