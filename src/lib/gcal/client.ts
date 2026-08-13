import { google } from "googleapis";
import "server-only";
import { encrypt, decrypt } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

function oauthClient(redirectUri: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

// Both the production domain and localhost need to be registered as
// Authorized redirect URIs in Google Cloud Console — this just picks the
// right one for whichever host actually made the request, same pattern that
// already fixed the signup email-confirmation link bug.
export function redirectUriForHost(host: string): string {
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}/api/auth/google/callback`;
}

export function getAuthUrl(host: string, state: string): string {
  const client = oauthClient(redirectUriForHost(host));
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // forces a refresh_token even on a re-connect
    scope: SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(code: string, host: string): Promise<{ refreshToken: string }> {
  const client = oauthClient(redirectUriForHost(host));
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google didn't return a refresh token — disconnect and reconnect (the consent screen only issues one the first time, or when prompt=consent forces it)."
    );
  }
  return { refreshToken: tokens.refresh_token };
}

// Mints a fresh access token from the stored refresh token on every call
// instead of caching one — simpler, no expiry bookkeeping, and Google's
// token endpoint is cheap enough for this app's scale (a handful of calls
// per page load, one household). No redirect_uri needed here — that's only
// relevant for the initial auth-code exchange (getAuthUrl/exchangeCodeForTokens
// above), not for using an already-issued refresh token.
async function calendarClientFor(refreshTokenEncrypted: string) {
  const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  client.setCredentials({ refresh_token: decrypt(refreshTokenEncrypted) });
  return google.calendar({ version: "v3", auth: client });
}

export interface GcalEvent {
  id: string;
  title: string;
  start: string; // ISO, may be date-only for all-day events
  end: string;
  allDay: boolean;
  htmlLink: string | null;
}

function toGcalEvent(event: {
  id?: string | null;
  summary?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  htmlLink?: string | null;
}): GcalEvent {
  const allDay = !event.start?.dateTime;
  return {
    id: event.id ?? "",
    title: event.summary ?? "(untitled)",
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? "",
    allDay,
    htmlLink: event.htmlLink ?? null,
  };
}

export async function listEvents(
  refreshTokenEncrypted: string,
  calendarId: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<GcalEvent[]> {
  const calendar = await calendarClientFor(refreshTokenEncrypted);
  const { data } = await calendar.events.list({
    calendarId,
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 50,
  });
  return (data.items ?? []).map(toGcalEvent);
}

export async function createEvent(
  refreshTokenEncrypted: string,
  calendarId: string,
  input: {
    title: string;
    startIso: string;
    endIso: string;
    reminderMinutesBefore?: number;
    // RFC5545 RRULE lines (e.g. ["RRULE:FREQ=DAILY"]) — the exact format
    // src/lib/reminders/rrule.ts already produces, so a routine's or
    // reminder's own rrule text can be passed straight through to make this
    // a real recurring Google Calendar series instead of a one-off event
    // that would otherwise need re-editing on every future occurrence.
    recurrence?: string[] | null;
  }
): Promise<GcalEvent> {
  const calendar = await calendarClientFor(refreshTokenEncrypted);
  const { data } = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: input.title,
      start: { dateTime: input.startIso },
      end: { dateTime: input.endIso },
      recurrence: input.recurrence ?? undefined,
      reminders:
        input.reminderMinutesBefore !== undefined
          ? { useDefault: false, overrides: [{ method: "popup", minutes: input.reminderMinutesBefore }] }
          : undefined,
    },
  });
  return toGcalEvent(data);
}

export async function updateEvent(
  refreshTokenEncrypted: string,
  calendarId: string,
  eventId: string,
  input: { title?: string; startIso?: string; endIso?: string; recurrence?: string[] | null }
): Promise<GcalEvent> {
  const calendar = await calendarClientFor(refreshTokenEncrypted);
  const { data } = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: {
      ...(input.title ? { summary: input.title } : {}),
      ...(input.startIso ? { start: { dateTime: input.startIso } } : {}),
      ...(input.endIso ? { end: { dateTime: input.endIso } } : {}),
      ...(input.recurrence !== undefined ? { recurrence: input.recurrence ?? undefined } : {}),
    },
  });
  return toGcalEvent(data);
}

export async function deleteEvent(refreshTokenEncrypted: string, calendarId: string, eventId: string): Promise<void> {
  const calendar = await calendarClientFor(refreshTokenEncrypted);
  try {
    await calendar.events.delete({ calendarId, eventId });
  } catch {
    // Already gone (deleted directly in Google Calendar) — fine, nothing to clean up.
  }
}

// Convenience: current user's own connection, read via normal RLS (the
// caller is always an authenticated Server Action/Route in this helper,
// never the cron dispatcher — that path uses get_gcal_connection_for_user()
// directly instead).
export async function getOwnGcalConnection() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("gcal_connections").select("*").eq("user_id", user.id).maybeSingle();
  return data;
}

export { encrypt as encryptRefreshToken };
