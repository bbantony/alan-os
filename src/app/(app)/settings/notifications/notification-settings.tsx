"use client";

import { useState } from "react";
import { Smartphone, X } from "lucide-react";

import {
  SettingsGroup,
  PreferenceChoice,
  PreferenceNumber,
  PreferenceSwitch,
} from "@/components/settings/setting-controls";
import { HOUR_OPTIONS } from "@/components/settings/setting-controls";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Micro } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { formatInAppTimezone } from "@/lib/time";
import type { Preferences } from "@/lib/preferences";
import { revokePushDevice, type PushDevice } from "./notification-actions";

export function NotificationSettings({
  initial,
  devices: initialDevices,
}: {
  initial: Preferences;
  devices: PushDevice[];
}) {
  const [prefs, setPrefs] = useState(initial);
  const [devices, setDevices] = useState(initialDevices);
  const [revoking, setRevoking] = useState<PushDevice | null>(null);
  const [pending, setPending] = useState(false);

  const n = prefs.notifications;

  async function handleRevoke() {
    if (!revoking) return;
    setPending(true);
    const result = await revokePushDevice({ id: revoking.id });
    setPending(false);
    if (result.error) {
      toast.error("Couldn't remove that device.");
      return;
    }
    setDevices((prev) => prev.filter((d) => d.id !== revoking.id));
    setRevoking(null);
    toast.success("Device removed");
  }

  return (
    <>
      <SettingsGroup
        title="Quiet hours"
        description="Nothing is sent during this window. Anything due arrives once it's over, rather than being lost."
      >
        <PreferenceSwitch
          label="Keep quiet overnight"
          value={n.quietHoursEnabled}
          onSaved={setPrefs}
          patch={(v) => ({ notifications: { ...n, quietHoursEnabled: v } })}
        />
        <PreferenceChoice
          label="Quiet from"
          value={String(n.quietHoursStart)}
          options={HOUR_OPTIONS}
          onSaved={setPrefs}
          patch={(v) => ({ notifications: { ...n, quietHoursStart: Number(v) } })}
        />
        <PreferenceChoice
          label="Until"
          value={String(n.quietHoursEnd)}
          options={HOUR_OPTIONS}
          onSaved={setPrefs}
          patch={(v) => ({ notifications: { ...n, quietHoursEnd: Number(v) } })}
          last
        />
      </SettingsGroup>

      <SettingsGroup title="What you're told about">
        <PreferenceSwitch
          label="Task nudges"
          hint="The reminder before something's due."
          value={n.taskNudges}
          onSaved={setPrefs}
          patch={(v) => ({ notifications: { ...n, taskNudges: v } })}
        />
        <PreferenceSwitch
          label="Routine reminders"
          hint="Your repeating habits."
          value={n.routineReminders}
          onSaved={setPrefs}
          patch={(v) => ({ notifications: { ...n, routineReminders: v } })}
        />
        <PreferenceSwitch
          label="Crew personal bests"
          hint="When someone in your workout crew hits a record."
          value={n.crewPrs}
          onSaved={setPrefs}
          patch={(v) => ({ notifications: { ...n, crewPrs: v } })}
        />
        <PreferenceSwitch
          label="Bills about to land"
          hint="A heads-up before a repeating payment comes out."
          value={n.billsDue}
          onSaved={setPrefs}
          patch={(v) => ({ notifications: { ...n, billsDue: v } })}
        />
        <PreferenceNumber
          label="Warn me this far ahead"
          value={n.billLeadDays}
          suffix="days"
          min={0}
          max={14}
          onSaved={setPrefs}
          patch={(v) => ({ notifications: { ...n, billLeadDays: v } })}
        />
        <PreferenceSwitch
          label="Weekly pattern ready"
          hint="When the app has spotted something across your week."
          value={n.weeklyReview}
          onSaved={setPrefs}
          patch={(v) => ({ notifications: { ...n, weeklyReview: v } })}
          last
        />
      </SettingsGroup>

      <SettingsGroup
        title="Devices"
        description="Every device you've allowed notifications on gets a copy. Remove anything you don't use any more."
      >
        {devices.length === 0 ? (
          <p className="hatch px-3 py-6 text-center">
            <Micro>
              No devices yet. Allow notifications when the app asks, and this phone will
              appear here.
            </Micro>
          </p>
        ) : (
          devices.map((device, i) => (
            <div
              key={device.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                i < devices.length - 1 && "border-b border-hairline"
              )}
            >
              <Smartphone className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{device.label}</span>
                <Micro className="block">
                  added {formatInAppTimezone(device.createdAt, { dateStyle: "medium" })}
                </Micro>
              </span>
              <button
                type="button"
                onClick={() => setRevoking(device)}
                aria-label={`Remove ${device.label}`}
                className="tap-press shrink-0 text-muted-foreground/60 transition-colors hover:text-destructive"
              >
                <X className="size-4" strokeWidth={2.5} />
              </button>
            </div>
          ))
        )}
      </SettingsGroup>

      <ConfirmDialog
        open={Boolean(revoking)}
        title={`Stop sending to ${revoking?.label ?? "this device"}?`}
        description="It won't get notifications any more. If it's this device, you'll be asked to allow them again next time."
        confirmLabel="Remove"
        pending={pending}
        onConfirm={handleRevoke}
        onCancel={() => setRevoking(null)}
      />
    </>
  );
}
