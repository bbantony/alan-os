"use client";

import { useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { disconnectGcal, retryGcalSync, setGcalSyncEnabled } from "@/app/(app)/calendar/actions";
import type { GcalFailure } from "@/lib/gcal/errors";

export function CalendarConnect({
  status,
}: {
  status: { connected: boolean; calendarId: string | null; syncEnabled: boolean };
}) {
  const [syncEnabled, setSyncEnabled] = useState(status.syncEnabled);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [failure, setFailure] = useState<GcalFailure | null>(null);

  async function handleSyncNow() {
    setSyncing(true);
    setFailure(null);
    const result = await retryGcalSync();
    setSyncing(false);

    if (result.failed > 0 && result.failure) {
      // Deliberately NOT a toast. A toast is a few seconds long and has room
      // for a sentence — this needs to stay on screen, explain itself, and
      // often carry a link Alan has to go and press. The previous version put
      // Google's raw JSON in a toast, which is the worst of every option.
      setFailure(result.failure);
      return;
    }

    if (result.synced > 0) {
      toast.success(`${result.synced} item${result.synced === 1 ? "" : "s"} synced`);
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
      <a href="/api/auth/google/start" className="block">
        <Button type="button" block>
          Connect Google Calendar
        </Button>
      </a>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 border-2 border-rule bg-surface p-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Connected</p>
          <p className="micro-sm mt-0.5 text-muted-foreground">
            Tasks and routines with a time sync here automatically
          </p>
        </div>
        <Switch
          checked={syncEnabled}
          onCheckedChange={handleToggle}
          aria-label="Toggle calendar sync"
        />
      </div>

      {failure && <SyncProblem failure={failure} onDismiss={() => setFailure(null)} />}

      <Button type="button" variant="outline" block onClick={handleSyncNow} disabled={syncing}>
        {syncing ? "Syncing…" : "Sync now"}
      </Button>
      <Button
        type="button"
        variant="outline"
        block
        onClick={handleDisconnect}
        disabled={disconnecting}
      >
        {disconnecting ? "Disconnecting…" : "Disconnect"}
      </Button>
    </div>
  );
}

/**
 * A sync failure, explained.
 *
 * Stays put until dismissed, says what to do in a sentence, and — for the
 * failures Google gives us a fix URL for — offers the link as a real button
 * rather than expecting anyone to pick a URL out of an error message.
 */
export function SyncProblem({
  failure,
  onDismiss,
}: {
  failure: GcalFailure;
  onDismiss?: () => void;
}) {
  return (
    <div className="border-2 border-destructive bg-surface">
      <div className="flex items-center gap-2 border-b-2 border-destructive bg-destructive px-3 py-2 text-destructive-foreground">
        <AlertTriangle className="size-4 shrink-0" strokeWidth={2.5} />
        <span className="micro-sm">Sync didn&apos;t work</span>
      </div>

      <div className="flex flex-col gap-3 p-3">
        <p className="text-sm">{failure.message}</p>

        {failure.actionUrl && (
          <a href={failure.actionUrl} target="_blank" rel="noreferrer" className="block">
            <Button type="button" block>
              {failure.actionLabel ?? "Open the fix"}
              <ExternalLink className="size-4" />
            </Button>
          </a>
        )}

        {onDismiss && (
          <Button type="button" variant="ghost" block onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}
