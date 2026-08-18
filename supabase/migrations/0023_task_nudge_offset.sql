-- "Due" and "nudge" become two different things.
--
-- Alan: "i don't like the current logic where there is a due date and then a
-- reminder button. does it mean that it'll remind me only at the time its
-- due? i am not a big fan of that system."
--
-- He'd read it correctly. The bell created a reminder at exactly `due_at`, so
-- the app told you to do something at the very moment it became late. Useless
-- for anything you need lead time on.
--
-- The fix is to separate the deadline from the warning:
--
--   due_at                 when the thing is actually due
--   notify_offset_minutes  how long BEFORE that to say something
--
-- null offset  = no notification at all
-- 0            = at the moment it's due (the old behaviour, now a choice)
-- 60           = an hour before
-- 1440         = the day before
--
-- This also quietly absorbs standalone reminders. "Bin day, Tuesday 8pm" is
-- just a task due Tuesday 8pm with an offset of 0 — which is what Alan meant
-- by "every reminder is basically a task". The reminders table stays, but only
-- as the dispatcher's queue: its remind_at is now derived (due_at minus the
-- offset) rather than being something the user sets directly anywhere.

alter table public.tasks
  add column if not exists notify_offset_minutes integer;

comment on column public.tasks.notify_offset_minutes is
  'Minutes before due_at to send a notification. NULL = never notify. 0 = at the due time.';

-- Existing tasks that already had a reminder were, by definition, being
-- notified at their due time — so they get offset 0 and keep behaving exactly
-- as they did. Everything else stays NULL (no notification), which is also
-- what it was doing.
update public.tasks t
set notify_offset_minutes = 0
where t.notify_offset_minutes is null
  and exists (
    select 1 from public.reminders r
    where r.linked_task_id = t.id
  );
