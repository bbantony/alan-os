-- Reminders must not outlive the thing they belong to.
--
-- THE BUG. `reminders.linked_task_id` was declared `on delete set null`
-- (migration 0011), and `linked_routine_id` the same (0020). Deleting a task
-- therefore did not delete its reminder — it blanked the link and left the row
-- behind, still `status = 'active'`, still holding its `remind_at` and its
-- rrule. `claim_due_reminders` only ever asks "is it active and is it due", so
-- the orphan kept firing forever. And because the link had been blanked there
-- was no way left to trace it back to anything, so nothing in Tasks could
-- clean it up either.
--
-- Found live in Alan's account on 2026-08-17: "Watches for anushas dad",
-- active, recurring, next fire 2026-08-19 00:28, attached to nothing. He
-- deleted that task days earlier.
--
-- Routines already handled this correctly in application code (archiveRoutine
-- explicitly deletes linked reminders). Tasks never did. This migration makes
-- the database enforce it for both, so it cannot depend on any caller
-- remembering.

-- 1. Clear out the existing wreckage.
--    Every reminder with neither link is either an orphan or a standalone
--    reminder. Alan reviewed all six and asked for all of them to go — and
--    standalone reminders are being folded into tasks anyway, so nothing here
--    is worth preserving.
delete from public.reminders
where linked_task_id is null
  and linked_routine_id is null;

-- 2. Make it structurally impossible to happen again.
alter table public.reminders
  drop constraint if exists reminders_linked_task_id_fkey;

alter table public.reminders
  add constraint reminders_linked_task_id_fkey
  foreign key (linked_task_id) references public.tasks (id) on delete cascade;

alter table public.reminders
  drop constraint if exists reminders_linked_routine_id_fkey;

alter table public.reminders
  add constraint reminders_linked_routine_id_fkey
  foreign key (linked_routine_id) references public.routines (id) on delete cascade;

-- 3. A safety net for anything that slips through in future.
--    Belt and braces: even if some new code path creates a reminder and then
--    orphans it, the dispatcher should not fire something unattached to
--    anything. This partial index makes the "find the orphans" query cheap for
--    the periodic sweep in the cron route.
create index if not exists reminders_unattached_active_idx
  on public.reminders (remind_at)
  where linked_task_id is null and linked_routine_id is null and status = 'active';
