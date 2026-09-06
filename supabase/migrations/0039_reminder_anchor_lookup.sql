-- A repeating reminder must advance from its TRUE anchor, not from remind_at.
--
-- THE BUG THIS EXISTS TO FIX. `reminders.remind_at` is documented in 0011 as a
-- "MUTABLE next-fire pointer, not an immutable RRULE anchor" — and snooze
-- mutates it. But every place that advanced a repeating reminder computed the
-- next occurrence as nextOccurrenceUtc(rrule, remind_at), i.e. it stepped from
-- the pointer. So one snooze re-anchored the whole series: a daily 07:00
-- routine nudge snoozed by an hour became a daily 08:05 nudge forever, and
-- again on every later snooze. Worse, the dispatcher advances remind_at AFTER
-- sending the push, so by the time the notification's Snooze button is tapped
-- the row already points at the NEXT real occurrence — overwriting it with
-- "an hour from now" silently ate that occurrence too.
--
-- The real anchor was never lost, it just is not on the reminder row. It lives
-- on the parent:
--   routine-linked  routines.rrule + routines.time_of_day
--   task-linked     tasks.due_at - tasks.notify_offset_minutes
-- The reminder's own `rrule` is only ever a copy of the parent's, so the
-- repeat PATTERN survives a snooze; it is the TIME OF DAY that is destroyed,
-- and that only ever existed on the parent.
--
-- WHY A NEW FUNCTION IS NEEDED AT ALL. The three call sites that advance a
-- reminder — the cron dispatcher and the two notification action routes — run
-- with NO user session (an external pinger and a signed action token, see
-- 0012 and src/lib/reminders/action-token.ts). `tasks` and `routines` are both
-- plain `auth.uid() = user_id` RLS (0002, 0020), so with no session those
-- routes read zero rows from either table — silently, which would look
-- identical to "the parent was deleted" and quietly keep the old drifting
-- behaviour on every single fire. Hence one more member of the
-- secret-checked security-definer family from 0012/0014.
--
-- Takes an ARRAY rather than a single id on purpose: the dispatcher claims a
-- whole batch of due reminders in one go, and a per-reminder lookup would turn
-- one round trip into N.
--
-- This migration adds a function and its grants. No table, column, policy or
-- data change — `advance_reminder` was never the problem (it only ever writes
-- the timestamp it is handed), so the whole correction is in the callers.

-- Guard, not a comment claiming the shape was verified. A plpgsql body is not
-- parsed at CREATE time, so a renamed column here would not fail the migration
-- — it would fail at 7am in production, inside the dispatcher, where nobody is
-- watching. This makes a missing table or column abort the apply instead.
-- (`information_schema.columns.column_name` is a domain over `name`, so both
-- sides are cast to text before comparing — see the trap recorded in HANDOFF.)
do $$
declare
  missing text;
begin
  if to_regclass('public.reminders') is null
     or to_regclass('public.tasks') is null
     or to_regclass('public.routines') is null then
    raise exception '0039: reminders, tasks and routines must all exist first';
  end if;

  select string_agg(req.tbl || '.' || req.col, ', ' order by req.tbl, req.col)
    into missing
  from (values
    ('reminders', 'id'),
    ('reminders', 'user_id'),
    ('reminders', 'title'),
    ('reminders', 'remind_at'),
    ('reminders', 'rrule'),
    ('reminders', 'status'),
    ('reminders', 'linked_task_id'),
    ('reminders', 'linked_routine_id'),
    ('routines', 'rrule'),
    ('routines', 'time_of_day'),
    ('tasks', 'due_at'),
    ('tasks', 'notify_offset_minutes')
  ) as req(tbl, col)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name::text = req.tbl
      and c.column_name::text = req.col
  );

  if missing is not null then
    raise exception '0039: reminder anchor lookup needs missing column(s): %', missing;
  end if;
end;
$$;

-- Every field a caller needs to work out where a reminder should fire next,
-- for a batch of reminders, in one round trip. The parent columns come back
-- null when the reminder is not linked to that kind of parent (or, in theory,
-- when the parent is gone — 0022's cascade means that should be impossible,
-- but the caller still handles it rather than trusting it).
--
-- SECURITY: identical shape to the rest of the 0012 family. The cron secret is
-- an explicit argument checked inside the body, so holding the public anon key
-- is not enough to call this and read every account's tasks and routines.
create or replace function public.get_reminder_anchors(secret text, target_reminders uuid[])
returns table (
  reminder_id uuid,
  user_id uuid,
  title text,
  remind_at timestamptz,
  rrule text,
  status public.reminder_status,
  linked_task_id uuid,
  linked_routine_id uuid,
  routine_rrule text,
  routine_time_of_day time,
  task_due_at timestamptz,
  task_notify_offset_minutes integer
)
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.check_cron_secret(secret);
  return query
    select
      r.id,
      r.user_id,
      r.title,
      r.remind_at,
      r.rrule,
      r.status,
      r.linked_task_id,
      r.linked_routine_id,
      ro.rrule,
      ro.time_of_day,
      t.due_at,
      t.notify_offset_minutes
    from public.reminders r
    left join public.routines ro on ro.id = r.linked_routine_id
    left join public.tasks t on t.id = r.linked_task_id
    where r.id = any(target_reminders);
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default on every new function, which is
-- how the three seed functions in 0035 ended up callable by anyone. Revoked
-- first, then granted to exactly the two roles that reach it: `anon` (the cron
-- pinger and a notification action fired from a PWA with a dead session) and
-- `authenticated` (the same action fired while a session happens to be live).
-- Neither can do anything with it without the cron secret.
revoke execute on function public.get_reminder_anchors(text, uuid[]) from public;
grant execute on function public.get_reminder_anchors(text, uuid[]) to anon, authenticated;
