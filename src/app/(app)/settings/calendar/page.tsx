import { getGcalStatus, getPushSubscriptions } from "@/app/(app)/calendar/actions";
import { CalendarConnect } from "./calendar-connect";
import { PushDevices } from "./push-devices";

export default async function CalendarSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; syncWarning?: string }>;
}) {
  const [status, devices, params] = await Promise.all([getGcalStatus(), getPushSubscriptions(), searchParams]);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 font-heading text-2xl font-semibold">Calendar &amp; Reminders</h1>

      {params.error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {params.error}
        </p>
      )}
      {params.connected && !params.syncWarning && (
        <p className="mb-4 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
          Google Calendar connected.
        </p>
      )}
      {params.syncWarning && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {params.syncWarning}
        </p>
      )}

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Google Calendar
      </h2>
      <div className="mb-8">
        <CalendarConnect status={status} />
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Push notifications
      </h2>
      <PushDevices initialDevices={devices} />
    </div>
  );
}
