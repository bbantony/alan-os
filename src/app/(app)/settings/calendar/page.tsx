import { getGcalStatus, getPushSubscriptions } from "@/app/(app)/calendar/actions";
import { Panel, PanelHead } from "@/components/ui/panel";
import { SettingsPageShell } from "../settings-page-shell";
import { CalendarConnect } from "./calendar-connect";
import { PushDevices } from "./push-devices";

export default async function CalendarSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; syncWarning?: string }>;
}) {
  const [status, devices, params] = await Promise.all([
    getGcalStatus(),
    getPushSubscriptions(),
    searchParams,
  ]);

  return (
    <SettingsPageShell title="Calendar &amp; reminders">
      {/* Outcome banners. These are the messages Alan actually reads after
          connecting Google, so they're solid blocks rather than tinted text —
          a failed sync used to look almost identical to a successful one. */}
      {params.error && (
        <p className="border-2 border-destructive bg-destructive px-3 py-2.5 text-sm font-semibold text-destructive-foreground">
          {params.error}
        </p>
      )}
      {params.connected && !params.syncWarning && (
        <p className="border-2 border-ok bg-ok px-3 py-2.5 text-sm font-semibold text-ok-foreground">
          Google Calendar connected.
        </p>
      )}
      {params.syncWarning && (
        <p className="border-2 border-destructive bg-destructive px-3 py-2.5 text-sm font-semibold text-destructive-foreground">
          {params.syncWarning}
        </p>
      )}

      <Panel>
        <PanelHead title="Google Calendar" />
        <div className="p-3">
          <CalendarConnect status={status} />
        </div>
      </Panel>

      <Panel>
        <PanelHead title="Push notifications" count={devices.length} />
        <PushDevices initialDevices={devices} />
      </Panel>
    </SettingsPageShell>
  );
}
