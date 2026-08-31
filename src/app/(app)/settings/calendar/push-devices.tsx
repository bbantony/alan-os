"use client";

import { useEffect, useState } from "react";
import { Bell, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { urlBase64ToUint8Array } from "@/lib/push/vapid";
import {
  getPushSubscriptions,
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
} from "@/app/(app)/calendar/actions";

interface DeviceRow {
  id: string;
  device_label: string | null;
  endpoint: string;
  created_at: string;
}

function guessDeviceLabel(): string {
  const ua = navigator.userAgent;
  let os = "Device";
  if (/iPhone|iPad/.test(ua)) os = "iPhone/iPad";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Mac/.test(ua)) os = "Mac";
  else if (/Windows/.test(ua)) os = "Windows";

  let browser = "";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  return browser ? `${browser} on ${os}` : os;
}

export function PushDevices({ initialDevices }: { initialDevices: DeviceRow[] }) {
  const [devices, setDevices] = useState(initialDevices);
  const [subscribing, setSubscribing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [thisDeviceSubscribed, setThisDeviceSubscribed] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hasSupport =
      typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
    if (!hasSupport) {
      Promise.resolve().then(() => setSupported(false));
      return;
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setThisDeviceSubscribed(!!subscription))
      .catch(() => {});
  }, []);

  async function handleSubscribe() {
    setError(null);
    setSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Notifications were blocked — enable them in your browser settings to use push reminders.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Push isn't configured.");

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // TS's DOM lib types applicationServerKey as ArrayBufferView<ArrayBuffer>
        // specifically, excluding the (equally valid at runtime) Uint8Array
        // backed by ArrayBufferLike that our helper returns — a lib typing
        // quirk, not a real runtime concern.
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Subscription incomplete.");

      await savePushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        deviceLabel: guessDeviceLabel(),
      });
      setThisDeviceSubscribed(true);
      setDevices(await getPushSubscriptions());
    } catch {
      setError("Couldn't enable push notifications on this device.");
    } finally {
      setSubscribing(false);
    }
  }

  async function handleRemove(id: string) {
    setDevices((prev) => prev.filter((d) => d.id !== id));
    await removePushSubscription({ id });
  }

  async function handleTest() {
    setTesting(true);
    await sendTestPush();
    setTesting(false);
  }

  if (!supported) {
    return (
      <p className="hatch px-3 py-4 text-center text-sm text-muted-foreground">
        Push notifications aren&apos;t supported in this browser.
      </p>
    );
  }

  return (
    <div>
      {devices.length > 0 && (
        <ul>
          {devices.map((d, i) => (
            <li
              key={d.id}
              className={cn(
                "flex items-center justify-between gap-3 px-3 py-2.5 text-sm",
                i > 0 && "border-t border-hairline"
              )}
            >
              <span className="min-w-0 truncate">{d.device_label ?? "Unknown device"}</span>
              <button
                type="button"
                onClick={() => handleRemove(d.id)}
                className="tap-press tap-target shrink-0 text-muted-foreground/50 transition-colors hover:text-destructive"
                aria-label={`Remove ${d.device_label ?? "this device"}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 border-t-2 border-rule p-3">
        {error && (
          <p className="border-2 border-destructive px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        {!thisDeviceSubscribed && (
          <Button type="button" block onClick={handleSubscribe} disabled={subscribing}>
            <Bell className="size-4" />
            {subscribing ? "Enabling…" : "Enable push on this device"}
          </Button>
        )}
        {devices.length > 0 && (
          <Button type="button" variant="outline" block onClick={handleTest} disabled={testing}>
            <Send className="size-4" />
            {testing ? "Sending…" : "Send test notification"}
          </Button>
        )}
      </div>
    </div>
  );
}
