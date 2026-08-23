/**
 * Turns a Google API failure into something Alan can act on.
 *
 * This exists because the app did the opposite. `describeGcalError` used to
 * return `JSON.stringify(response.data)`, so tapping "Sync now" produced a
 * 1,500-character wall of JSON — `SERVICE_DISABLED`, `usageLimits`,
 * `type.googleapis.com/google.rpc.ErrorInfo` and all — shown to someone who
 * has said plainly that he can't read error messages. It's a direct breach of
 * the first rule in CLAUDE.md, and it happened in the one place most likely to
 * fail.
 *
 * Every branch below answers two questions: what went wrong, and what do I do
 * about it. Where Google hands us a URL that fixes it, we keep the URL.
 */

export interface GcalFailure {
  /** One or two plain sentences. No codes, no JSON, no jargon. */
  message: string;
  /** A link that resolves it, when Google gives us one. */
  actionUrl?: string;
  actionLabel?: string;
  /** The raw text, kept for the changelog/logs — never shown to Alan. */
  raw: string;
}

interface GoogleErrorShape {
  message?: string;
  response?: { status?: number; data?: unknown };
}

function rawTextOf(err: unknown): string {
  const e = err as GoogleErrorShape;
  const detail = e?.response?.data ? JSON.stringify(e.response.data) : undefined;
  const status = e?.response?.status ? ` (HTTP ${e.response.status})` : "";
  return `${detail ?? e?.message ?? String(err)}${status}`;
}

export function describeGcalFailure(err: unknown): GcalFailure {
  const e = err as GoogleErrorShape;
  const status = e?.response?.status;
  const raw = rawTextOf(err);

  // Google's payloads vary in shape between APIs and versions, so match on the
  // text rather than trying to navigate a nested structure that may not be
  // there. The reason strings below are stable parts of Google's contract.
  const hay = raw.toLowerCase();

  // The Calendar API is switched off for the Cloud project. Extremely common
  // first-time setup miss: creating OAuth credentials does NOT enable the API.
  if (hay.includes("service_disabled") || hay.includes("accessnotconfigured")) {
    const url =
      /https:\/\/console\.(?:developers|cloud)\.google\.com[^\s"'\\]*/.exec(raw)?.[0];
    return {
      message:
        "Google hasn't switched the Calendar service on for your project yet. " +
        "Creating the sign-in credentials doesn't do it — it's a separate button. " +
        "Open the link, press Enable, wait a minute, then tap Sync now again.",
      actionUrl: url,
      actionLabel: "Enable it in Google",
      raw,
    };
  }

  if (hay.includes("invalid_grant") || status === 401) {
    return {
      message:
        "Google has signed the app out. Tap Disconnect and then Connect Google Calendar " +
        "again to sign back in — nothing you've saved is affected.",
      raw,
    };
  }

  if (hay.includes("insufficientpermissions") || hay.includes("insufficient authentication")) {
    return {
      message:
        "The app is signed in to Google but wasn't given permission to see your calendar. " +
        "Disconnect, connect again, and tick the calendar box on Google's permission screen.",
      raw,
    };
  }

  if (status === 429 || hay.includes("ratelimitexceeded") || hay.includes("userratelimit")) {
    return {
      message:
        "Google is asking us to slow down. Nothing is broken — wait a few minutes and tap " +
        "Sync now again.",
      raw,
    };
  }

  if (status === 404) {
    return {
      message:
        "That calendar no longer exists on Google's side. Disconnect and connect again to " +
        "pick it up fresh.",
      raw,
    };
  }

  if (status && status >= 500) {
    return {
      message: "Google Calendar is having problems at their end. Try again in a little while.",
      raw,
    };
  }

  return {
    message:
      "Google Calendar refused the change and didn't say why in a way I can translate. " +
      "Nothing you've saved is affected — tell Claude and the exact wording is in the logs.",
    raw,
  };
}
