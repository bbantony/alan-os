-- Alan OS — Tasks redesign: recurring tasks.
-- Reuses the exact rrule text format + nextOccurrenceUtc logic already
-- built and DST-verified for reminders (src/lib/reminders/rrule.ts) rather
-- than inventing a second recurrence system — a task's rrule column is
-- read/written with the same helpers, just on a different table.
alter table public.tasks add column rrule text;
