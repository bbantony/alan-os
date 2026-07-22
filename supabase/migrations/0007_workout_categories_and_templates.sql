-- Alan OS — Phase 2 follow-up (owner feedback): collapse the workout type
-- taxonomy from push/pull/legs/run/other down to just resistance vs running
-- ("nobody thinks in terms of day labels day-to-day, just did I lift or did
-- I run"), and drop workout_templates.type since templates only ever apply
-- to resistance training now that running has no templates — the column
-- would only ever hold one value.

alter type public.workout_type rename to workout_type_old;
create type public.workout_type as enum ('resistance', 'running');

alter table public.workouts
  alter column type type public.workout_type
  using (case when type::text = 'run' then 'running' else 'resistance' end)::public.workout_type;

alter table public.workout_templates drop column type;

drop type public.workout_type_old;
