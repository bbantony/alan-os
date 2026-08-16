"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { disconnectGcal, retryGcalSync, setGcalSyncEnabled } from "@/app/(app)/calendar/actions";

export function CalendarConnect({
  status,
}: {
  status: { connected: boolean; calendarId: string | null; syncEnabled: boolean };
}) {
  const [syncEnabled, setSyncEnabled] = useState(status.syncEnabled);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function handleSyncNow() {
    setSyncing(true);
    const result = await retryGcalSync();
    setSyncing(false);
    if (result.failed > 0) {
      toast.error(`${result.synced} synced, ${result.failed} failed: ${result.firstError}`);
    } else if (result.synced > 0) {
      toast.success(`${result.synced} item(s) synced to Google Calendar`);
    } else {
      toast.success("Everything's already synced");
    }
  }

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
      <div className="flex items-center justify-between border-2 border-rule bg-surface p-3">
        <div>
          <p className="text-sm font-medium">Connected</p>
          <p className="text-xs text-muted-foreground">
            Tasks, routines, and reminders with a time sync here automatically
          </p>
        </div>
        <Switch checked={syncEnabled} onCheckedChange={handleToggle} aria-label="Toggle calendar sync" />
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={handleSyncNow} disabled={syncing}>
        {syncing ? "Syncing…" : "Sync now"}
      </Button>
      <Button type="button" variant="outline" className="w-full" onClick={handleDisconnect} disabled={disconnecting}>
        {disconnecting ? "Disconnecting…" : "Disconnect"}
      </Button>
    </div>
  );
}
