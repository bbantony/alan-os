import { createHmac, timingSafeEqual } from "node:crypto";
import "server-only";

// A dormant PWA's Supabase session can easily be expired by the time a push
// notification arrives days/weeks later — relying on session cookies for the
// Done/Snooze notification-action routes would silently fail (the request
// would redirect to /login and the action would just never happen, with the
// service worker having no way to surface that). These short-lived HMAC
// tokens are embedded directly in the push payload instead, so the action
// routes don't depend on any live session at all — same trust model as the
// cron secret, just scoped to one reminder for one user.

function getSecret(): string {
  const secret = process.env.PUSH_ACTION_SECRET;
  if (!secret) throw new Error("PUSH_ACTION_SECRET is not set");
  return secret;
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export function createActionToken(
  reminderId: string,
  userId: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${reminderId}.${userId}.${exp}`;
  const signature = createHmac("sha256", getSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyActionToken(token: string): { reminderId: string; userId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [reminderId, userId, expStr, signature] = parts;

  const expected = createHmac("sha256", getSecret())
    .update(`${reminderId}.${userId}.${expStr}`)
    .digest("base64url");

  const provided = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length || !timingSafeEqual(provided, expectedBuf)) {
    return null;
  }

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;

  return { reminderId, userId };
}
