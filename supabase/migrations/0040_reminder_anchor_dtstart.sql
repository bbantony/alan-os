-- A routine and its reminder must agree on which days the routine is DUE.
--
-- THE BUG THIS EXISTS TO FIX. 0039 taught the three reminder-advance paths to
-- recompute the next fire time from the routine's own rrule + time_of_day
-- instead of stepping from the mutable `remind_at` pointer. That killed the
-- snooze drift, but left a second, quieter one behind it.
--
-- A repeat rule is only half a schedule: "every 3 days" means nothing until
-- you say every 3 days FROM WHEN. That start date (DTSTART, in iCalendar
-- terms) is what picks Mon/Thu/Sun out of the calendar rather than
-- Tue/Fri/Mon. Routines have always answered it with their own `created_at`
-- (src/app/(app)/routines/actions.ts — both the "due today?" filter and the
-- streak maths anchor there). The reminder side did not: it anchored on
-- TODAY, whatever today happened to be. For every rule that ignores its start
-- date — plain daily, weekdays, weekly-on-a-named-day, monthly-on-a-date —
-- the two agree by luck and nothing is wrong. For `FREQ=DAILY;INTERVAL=n`,
-- which the routine form offers as "every N days", they disagree the moment a
-- reminder is dealt with on a day the routine is not actually due:
--
--   Routine created Tue 1 Sep, every 3 days at 07:00 -> due 1, 4, 7, 10 Sep.
--   It fires Fri 4 Sep and is snoozed overnight into Sat 5 Sep. Recomputing
--   with today (the 5th) as the start date makes the 5th "day zero", so the
--   next fire lands on Tue 8 Sep — a day the routine itself does not consider
--   due — and every later recomputation repeats the shift.
--
-- The reminder therefore has to know the routine's start date. It cannot read
-- it: all three advance paths (the cron dispatcher and the two notification
-- action routes) run with NO user session, and `routines` is plain
-- `auth.uid() = user_id` RLS (0020), so a direct read returns zero rows and
-- fails silently. `get_reminder_anchors` from 0039 already exists to solve
-- exactly that problem for `rrule` and `time_of_day`; this adds `created_at`
-- to the same trip.
--
-- TASKS NEED NO EQUIVALENT. A task-linked reminder anchors on
-- `tasks.due_at - notify_offset_minutes`, which is an absolute instant, not a
-- pattern needing a start date — and a repeating task's `due_at` is itself
-- rolled forward by completeTask, so the anchor stays a real occurrence
-- without any DTSTART being consulted. The task columns are unchanged here.
--
-- The routine's created_at is returned AS A TIMESTAMPTZ, unconverted. Slicing
-- it to a calendar day is the caller's job and happens in TypeScript, exactly
-- as routines/actions.ts already does it, so both sides derive the day from
-- the same value the same way. This file deliberately does no timezone
-- arithmetic: stored UTC, converted only at display time.
--
-- No table, column, policy or data change — one function's return shape, plus
-- its grants.

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
    raise exception '0040: reminders, tasks and routines must all exist first';
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
    ('routines', 'created_at'),
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
    raise exception '0040: reminder anchor lookup needs missing column(s): %', missing;
  end if;
end;
$$;

-- DROPPED, NOT REPLACED, AND THAT IS FORCED. `create or replace function`
-- cannot change a function's return type, and for a `returns table (...)`
-- function those columns ARE the return type (they are OUT parameters
-- underneath). Adding `routine_created_at` to the list is therefore a return
-- type change, and Postgres rejects it with "cannot change return type of
-- existing function ... use DROP FUNCTION first" rather than quietly keeping
-- the old shape. So: drop, then create. The whole file runs inside one
-- transaction (scripts/run-migration.mjs wraps each migration in
-- begin/commit), so there is no window in which the function is missing — if
-- the create below failed, the drop rolls back with it.
--
-- The signature must match exactly for the drop to find it; `if exists` keeps
-- the file safe to run against a database where 0039 never landed.
drop function if exists public.get_reminder_anchors(text, uuid[]);

-- Every field a caller needs to work out where a reminder should fire next,
-- for a batch of reminders, in one round trip. The parent columns come back
-- null when the reminder is not linked to that kind of parent (or, in theory,
-- when the parent is gone — 0022's cascade means that should be impossible,
-- but the caller still handles it rather than trusting it).
--
-- SECURITY: identical shape to the rest of the 0012 family. The cron secret is
-- an explicit argument checked inside the body, so holding the public anon key
-- is not enough to call this and read every account's tasks and routines.
create function public.get_reminder_anchors(secret text, target_reminders uuid[])
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
  routine_created_at timestamptz,
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
      ro.created_at,
      t.due_at,
      t.notify_offset_minutes
    from public.reminders r
    left join public.routines ro on ro.id = r.linked_routine_id
    left join public.tasks t on t.id = r.linked_task_id
    where r.id = any(target_reminders);
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default on every new function, and the
-- drop above threw away 0039's grants along with the old function, so these
-- have to be restated here in full — not because the roles changed, but
-- because they no longer exist. Revoked first, then granted to exactly the two
-- roles that reach it: `anon` (the cron pinger and a notification action fired
-- from a PWA with a dead session) and `authenticated` (the same action fired
-- while a session happens to be live). Neither can do anything with it without
-- the cron secret.
revoke execute on function public.get_reminder_anchors(text, uuid[]) from public;
grant execute on function public.get_reminder_anchors(text, uuid[]) to anon, authenticated;
