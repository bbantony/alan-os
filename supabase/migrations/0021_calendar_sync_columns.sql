-- Alan OS — full Google Calendar sync for Tasks and Routines.
-- reminders.gcal_event_id already exists (0011); tasks and routines need the
-- same column so a task's due date or a routine's time-of-day can mirror to
-- Google Calendar on its own, independent of whether a push reminder is also
-- turned on for it.

alter table public.tasks add column gcal_event_id text;
alter table public.routines add column gcal_event_id text;
