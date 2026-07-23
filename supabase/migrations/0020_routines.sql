-- Alan OS — Routines: the third first-class concept alongside Tasks and
-- Calendar Events, closing the "what's the difference between a task and a
-- reminder" confusion by giving repeating habits their own home instead of
-- overloading tasks.rrule for things that are never really "done."
--
-- Unlike tasks (which spawn a brand-new row per occurrence — see
-- 0019_tasks_recurrence.sql), a routine is ONE stable row forever; each
-- day's occurrence is just a log entry in routine_completions. This is a
-- deliberate difference, not an inconsistency: editing "Morning Routine"
-- should change every future day at once, where editing one occurrence of a
-- recurring task shouldn't necessarily touch the others.
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  icon text not null default 'Repeat',
  category public.task_category not null default 'personal',
  rrule text not null,
  time_of_day time,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.routines enable row level security;

create policy "routines_all_own"
  on public.routines for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index routines_user_idx on public.routines (user_id, active);

-- Every routine has >=1 step, even a single-habit one (step title mirrors the
-- routine title) — one consistent shape instead of conditionally supporting
-- a checklist sometimes and a bare habit other times.
create table public.routine_steps (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines (id) on delete cascade,
  title text not null,
  sort_order int not null default 0
);

alter table public.routine_steps enable row level security;

create policy "routine_steps_all_own"
  on public.routine_steps for all
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = auth.uid()));

create index routine_steps_routine_idx on public.routine_steps (routine_id, sort_order);

create table public.routine_completions (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  completed_date date not null,
  steps_done jsonb not null default '[]'::jsonb,
  completed_at timestamptz not null default now(),
  unique (routine_id, completed_date)
);

alter table public.routine_completions enable row level security;

create policy "routine_completions_all_own"
  on public.routine_completions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index routine_completions_routine_idx on public.routine_completions (routine_id, completed_date);

-- Lets a reminder ("bell") attach to a routine the same way it already
-- attaches to a task — reminders stay the one universal notification
-- mechanism instead of Routines inventing a second one.
alter table public.reminders add column linked_routine_id uuid references public.routines (id) on delete set null;
