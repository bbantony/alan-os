-- Alan OS — Phase 2: Workout module.
-- The one place in the app where read access isn't strictly per-user: the crew
-- (owner + invited friends) all see each other's workouts, reactions, comments,
-- and PRs, but can only write their own (SPEC.md Part B2). Since this Supabase
-- project only ever contains the owner + invited crew, "readable by all crew
-- members" collapses to "readable by any authenticated user of this project."

create type public.muscle_group as enum
  ('chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'other');
create type public.workout_type as enum ('push', 'pull', 'legs', 'run', 'other');
create type public.pr_kind as enum ('weight', 'est_1rm', 'volume');

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users (id) on delete set null,
  name text not null,
  muscle_group public.muscle_group not null,
  created_at timestamptz not null default now()
);

create unique index exercises_name_unique_idx on public.exercises (lower(trim(name)));

alter table public.exercises enable row level security;

create policy "exercises_select_crew"
  on public.exercises for select
  using (auth.uid() is not null);

create policy "exercises_insert_own"
  on public.exercises for insert
  with check (auth.uid() = created_by);

create policy "exercises_update_own"
  on public.exercises for update
  using (auth.uid() = created_by);

create policy "exercises_delete_own"
  on public.exercises for delete
  using (auth.uid() = created_by);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_date date not null,
  type public.workout_type not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.workouts enable row level security;

create policy "workouts_select_crew"
  on public.workouts for select
  using (auth.uid() is not null);

create policy "workouts_all_own"
  on public.workouts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index workouts_user_date_idx on public.workouts (user_id, workout_date desc);
create index workouts_created_idx on public.workouts (created_at desc);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  set_number int not null,
  reps int not null,
  weight_kg numeric not null
);

alter table public.workout_sets enable row level security;

create policy "workout_sets_select_crew"
  on public.workout_sets for select
  using (auth.uid() is not null);

create policy "workout_sets_all_own"
  on public.workout_sets for all
  using (exists (
    select 1 from public.workouts w
    where w.id = workout_id and w.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workouts w
    where w.id = workout_id and w.user_id = auth.uid()
  ));

create index workout_sets_workout_idx on public.workout_sets (workout_id);
create index workout_sets_exercise_workout_idx on public.workout_sets (exercise_id, workout_id);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null unique references public.workouts (id) on delete cascade,
  distance_km numeric not null,
  duration_seconds int not null,
  avg_hr int,
  source text not null default 'manual'
);

alter table public.runs enable row level security;

create policy "runs_select_crew"
  on public.runs for select
  using (auth.uid() is not null);

create policy "runs_all_own"
  on public.runs for all
  using (exists (
    select 1 from public.workouts w
    where w.id = workout_id and w.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workouts w
    where w.id = workout_id and w.user_id = auth.uid()
  ));

create table public.prs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  kind public.pr_kind not null,
  value numeric not null,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  achieved_at timestamptz not null default now()
);

alter table public.prs enable row level security;

create policy "prs_select_crew"
  on public.prs for select
  using (auth.uid() is not null);

create policy "prs_all_own"
  on public.prs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index prs_user_exercise_kind_idx on public.prs (user_id, exercise_id, kind);

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (workout_id, user_id, emoji)
);

alter table public.reactions enable row level security;

create policy "reactions_select_crew"
  on public.reactions for select
  using (auth.uid() is not null);

create policy "reactions_insert_own"
  on public.reactions for insert
  with check (auth.uid() = user_id);

create policy "reactions_delete_own"
  on public.reactions for delete
  using (auth.uid() = user_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

create policy "comments_select_crew"
  on public.comments for select
  using (auth.uid() is not null);

create policy "comments_insert_own"
  on public.comments for insert
  with check (auth.uid() = user_id);

create policy "comments_delete_own"
  on public.comments for delete
  using (auth.uid() = user_id);

create index reactions_workout_idx on public.reactions (workout_id);
create index comments_workout_idx on public.comments (workout_id, created_at);

-- Owner-request bonus feature (not in SPEC.md's literal Part E5, folded into Phase 2
-- per owner decision): saved routines so a session can be pre-filled from a template
-- instead of re-picking exercises every time. Private per user, not crew-shared —
-- jsonb array of exercise ids, matching the app's existing convention for simple
-- ordered lists (day_plans.top_goals, receipts.line_items) rather than a join table.
create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type public.workout_type not null,
  exercise_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.workout_templates enable row level security;

create policy "workout_templates_all_own"
  on public.workout_templates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index workout_templates_user_idx on public.workout_templates (user_id, type);

-- Crew member identity resolution: the crew feed needs every member's display
-- name/avatar/role, but profiles_select_own only allows reading your own row.
-- security definer lets this specific, narrow read happen without widening that
-- policy (same pattern as seed_default_shopping_categories in 0004).
create function public.crew_profiles()
returns table (id uuid, display_name text, avatar_url text, role public.user_role)
language sql security definer set search_path = public
as $$
  select id, display_name, avatar_url, role from public.profiles;
$$;

grant execute on function public.crew_profiles() to authenticated;

-- Every signup from here on is a friend, not the owner (the owner's own account
-- already exists) — resolves the to-do left in 0001_init.sql's handle_new_user
-- comment. Existing rows are untouched; only the default for new rows changes.
alter table public.profiles alter column role set default 'workout_member';

-- Per-user display preference named in SPEC.md Part E5 ("unit preference lbs/kg").
alter table public.profiles
  add column weight_unit text not null default 'lbs' check (weight_unit in ('lbs', 'kg'));

-- Close a self-escalation gap: profiles_update_own has no `with check`, so any
-- authenticated user could otherwise set their own role via a raw client update.
-- RLS row predicates can't express "not this column," so this is a column-level
-- grant instead. role becomes load-bearing this phase (route gating), so this can
-- no longer be left as harmless slop.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, timezone, theme_settings, weight_unit)
  on public.profiles to authenticated;

alter publication supabase_realtime add table
  public.workouts, public.workout_sets, public.runs,
  public.prs, public.reactions, public.comments;

-- Seed ~40 common PPL exercises (SPEC.md Part E5), created_by null = crew-shared,
-- immutable by any single member. Idempotent via the unique name index above.
insert into public.exercises (name, muscle_group) values
  ('Barbell Bench Press', 'chest'),
  ('Incline Barbell Bench Press', 'chest'),
  ('Incline Dumbbell Press', 'chest'),
  ('Flat Dumbbell Press', 'chest'),
  ('Dumbbell Fly', 'chest'),
  ('Cable Crossover', 'chest'),
  ('Push-Up', 'chest'),
  ('Overhead Press', 'shoulders'),
  ('Seated Dumbbell Shoulder Press', 'shoulders'),
  ('Lateral Raise', 'shoulders'),
  ('Front Raise', 'shoulders'),
  ('Rear Delt Fly', 'shoulders'),
  ('Arnold Press', 'shoulders'),
  ('Triceps Pushdown', 'arms'),
  ('Overhead Triceps Extension', 'arms'),
  ('Skull Crusher', 'arms'),
  ('Close-Grip Bench Press', 'arms'),
  ('Barbell Curl', 'arms'),
  ('Dumbbell Curl', 'arms'),
  ('Hammer Curl', 'arms'),
  ('Preacher Curl', 'arms'),
  ('Pull-Up', 'back'),
  ('Chin-Up', 'back'),
  ('Lat Pulldown', 'back'),
  ('Barbell Row', 'back'),
  ('Pendlay Row', 'back'),
  ('Seated Cable Row', 'back'),
  ('Single-Arm Dumbbell Row', 'back'),
  ('Face Pull', 'back'),
  ('Back Squat', 'legs'),
  ('Front Squat', 'legs'),
  ('Romanian Deadlift', 'legs'),
  ('Deadlift', 'legs'),
  ('Leg Press', 'legs'),
  ('Leg Curl', 'legs'),
  ('Leg Extension', 'legs'),
  ('Bulgarian Split Squat', 'legs'),
  ('Walking Lunge', 'legs'),
  ('Standing Calf Raise', 'legs'),
  ('Seated Calf Raise', 'legs'),
  ('Hip Thrust', 'legs'),
  ('Plank', 'core'),
  ('Hanging Leg Raise', 'core')
on conflict (lower(trim(name))) do nothing;
