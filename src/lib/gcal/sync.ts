import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { createEvent, updateEvent, deleteEvent } from "./client";
import { firstReminderInstant } from "@/lib/reminders/rrule";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type SyncedTable = "tasks" | "routines" | "reminders";

interface GcalConnection {
  refresh_token_encrypted: string;
  calendar_id: string;
  sync_enabled: boolean;
}

async function getConnection(supabase: SupabaseClient, userId: string): Promise<GcalConnection | null> {
  const { data } = await supabase
    .from("gcal_connections")
    .select("refresh_token_encrypted, calendar_id, sync_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !data.sync_enabled) return null;
  return data as GcalConnection;
}

// The one place a task/routine/reminder's mirrored Google Calendar event
// gets created, moved, or turned into/out of a recurring series — called
// eagerly at create/edit time (not lazily on a reminder's first fire, which
// is what the old mirrorReminderToGcal did and why a recurring reminder's
// mirror never advanced past its first occurrence). `startIso: null` means
// "no longer scheduled" (a due date was cleared) and deletes any existing
// event instead of creating one. A calendar mirror failing never blocks
// saving the underlying row — this always swallows its own errors.
export async function syncToGcal(params: {
  supabase: SupabaseClient;
  userId: string;
  table: SyncedTable;
  rowId: string;
  existingEventId: string | null;
  title: string;
  startIso: string | null;
  durationMinutes?: number;
  recurrence?: string[] | null;
}): Promise<void> {
  const { supabase, userId, table, rowId, existingEventId, title, startIso, durationMinutes = 30, recurrence } = params;
  const connection = await getConnection(supabase, userId);
  if (!connection) return;

  if (!startIso) {
    await removeFromGcal(params);
    return;
  }

  const start = new Date(startIso);
  const end = new Date(start.getTime() + durationMinutes * 60000);

  try {
    if (existingEventId) {
      await updateEvent(connection.refresh_token_encrypted, connection.calendar_id, existingEventId, {
        title,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        recurrence: recurrence ?? null,
      });
    } else {
      const event = await createEvent(connection.refresh_token_encrypted, connection.calendar_id, {
        title,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        recurrence: recurrence ?? undefined,
      });
      await supabase.from(table).update({ gcal_event_id: event.id }).eq("id", rowId).eq("user_id", userId);
    }
  } catch {
    // Push/DB save already went through — a calendar mirror failure isn't fatal.
  }
}

// Deletes a mirrored event (task completed/deleted, routine archived,
// reminder deleted) and clears the stored id. Safe no-op if there was never
// an event, or the user isn't connected — including when the owning row has
// already been deleted (the trailing `.update` then just matches zero rows).
export async function removeFromGcal(params: {
  supabase: SupabaseClient;
  userId: string;
  table: SyncedTable;
  rowId: string;
  existingEventId: string | null;
}): Promise<void> {
  const { supabase, userId, table, rowId, existingEventId } = params;
  if (!existingEventId) return;
  const connection = await getConnection(supabase, userId);
  if (!connection) return;
  try {
    await deleteEvent(connection.refresh_token_encrypted, connection.calendar_id, existingEventId);
  } catch {
    // Already gone from Google's side either way.
  }
  await supabase.from(table).update({ gcal_event_id: null }).eq("id", rowId).eq("user_id", userId);
}

// Run once right after a Google Calendar connection is created, so existing
// tasks/routines/reminders don't stay invisible on the calendar until they
// happen to be edited. Only touches rows that don't already have a mirrored
// event, so it's safe to call more than once.
export async function backfillGcalSync(supabase: SupabaseClient, userId: string): Promise<void> {
  const connection = await getConnection(supabase, userId);
  if (!connection) return;

  const [{ data: tasks }, { data: routines }, { data: reminders }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, due_at")
      .eq("user_id", userId)
      .is("completed_at", null)
      .is("gcal_event_id", null)
      .not("due_at", "is", null),
    supabase
      .from("routines")
      .select("id, title, time_of_day, rrule")
      .eq("user_id", userId)
      .eq("active", true)
      .is("gcal_event_id", null)
      .not("time_of_day", "is", null),
    supabase
      .from("reminders")
      .select("id, title, remind_at, rrule")
      .eq("user_id", userId)
      .eq("status", "active")
      .is("gcal_event_id", null)
      .is("linked_task_id", null)
      .is("linked_routine_id", null),
  ]);

  for (const t of tasks ?? []) {
    await syncToGcal({ supabase, userId, table: "tasks", rowId: t.id, existingEventId: null, title: t.title, startIso: t.due_at });
  }
  for (const r of routines ?? []) {
    const startIso = firstReminderInstant(r.rrule, r.time_of_day as string).toISOString();
    await syncToGcal({
      supabase,
      userId,
      table: "routines",
      rowId: r.id,
      existingEventId: null,
      title: r.title,
      startIso,
      recurrence: r.rrule ? [r.rrule] : null,
    });
  }
  for (const rem of reminders ?? []) {
    await syncToGcal({
      supabase,
      userId,
      table: "reminders",
      rowId: rem.id,
      existingEventId: null,
      title: rem.title,
      startIso: rem.remind_at,
      recurrence: rem.rrule ? [rem.rrule] : null,
    });
  }
}
