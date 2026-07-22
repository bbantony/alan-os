import webpush from "web-push";
import "server-only";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("VAPID env vars are not set");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  reminderId?: string;
  actionToken?: string;
  url?: string;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface SendResult {
  sent: number;
  removed: number;
}

// Fetching subscriptions and deleting stale ones both need cross-user access
// in some callers (the cron dispatcher) and only same-user access in others
// (a "send test notification" button) — different RLS/RPC paths depending on
// context. This function only does the actual sending; callers supply the
// subscription list and an `onStale` callback for cleanup, so it doesn't
// need to know which path applies.
export async function sendPush(
  subscriptions: PushSubscriptionRow[],
  payload: PushPayload,
  onStale: (subscriptionId: string) => Promise<void>
): Promise<SendResult> {
  ensureConfigured();
  let sent = 0;
  let removed = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify(payload)
      );
      sent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await onStale(sub.id);
        removed += 1;
      }
      // Other errors (network blip, 5xx from the push service) are left
      // alone — not a reason to drop a device that might work next time.
    }
  }

  return { sent, removed };
}
