-- Alan OS — Phase 2 follow-up (owner feedback):
-- 1) Exercises become private per user, like templates already were, instead
--    of one shared crew master list.
-- 2) is_barbell (boolean) becomes an equipment tag: barbell/dumbbell/
--    kettlebell/other.
-- Workout deletion needs no migration — workouts_all_own (0005) already
-- permits delete on your own rows, and workout_sets/runs/prs/reactions all
-- already cascade-delete via their workout_id foreign keys.

create type public.equipment_type as enum ('barbell', 'dumbbell', 'kettlebell', 'other');

alter table public.exercises add column equipment public.equipment_type not null default 'other';

update public.exercises set equipment = 'barbell' where is_barbell;
update public.exercises set equipment = 'dumbbell' where lower(trim(name)) in (
  'incline dumbbell press',
  'flat dumbbell press',
  'dumbbell fly',
  'seated dumbbell shoulder press',
  'arnold press',
  'dumbbell curl',
  'hammer curl',
  'single-arm dumbbell row'
);

alter table public.exercises drop column is_barbell;

-- Each user gets their own exercise list (owner request, following the same
-- pattern templates already used). The 43 seeded rows currently belong to
-- nobody (created_by null); since only the owner has an account so far,
-- assign them all to the owner directly rather than duplicating, then seed a
-- fresh personal copy for anyone who signs up from here on.
alter table public.exercises add column user_id uuid references auth.users (id) on delete cascade;

update public.exercises e
set user_id = (select id from public.profiles where role = 'owner' limit 1)
where user_id is null;

alter table public.exercises alter column user_id set not null;

-- Select stays crew-wide (auth.uid() is not null, unchanged from 0005): the
-- shared feed still needs to resolve exercise NAMES across users — Friend
-- B's workout references Friend B's own exercise row, and the Owner's feed
-- view still needs to display its name. Write access becomes strictly
-- own-rows-only, replacing 0006's crew-wide update policy (which was only
-- ever a workaround for the old shared-list design and no longer applies).
-- These old policies reference created_by, so they must be dropped before
-- that column is — do this before the `drop column created_by` below.
drop policy "exercises_update_crew" on public.exercises;
drop policy "exercises_insert_own" on public.exercises;
drop policy "exercises_delete_own" on public.exercises;

alter table public.exercises drop column created_by;

drop index exercises_name_unique_idx;
create unique index exercises_user_name_unique_idx on public.exercises (user_id, lower(trim(name)));

create policy "exercises_insert_own"
  on public.exercises for insert
  with check (auth.uid() = user_id);

create policy "exercises_update_own"
  on public.exercises for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "exercises_delete_own"
  on public.exercises for delete
  using (auth.uid() = user_id);

create function public.seed_default_exercises(target_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.exercises (user_id, name, muscle_group, equipment) values
    (target_user, 'Barbell Bench Press', 'chest', 'barbell'),
    (target_user, 'Incline Barbell Bench Press', 'chest', 'barbell'),
    (target_user, 'Incline Dumbbell Press', 'chest', 'dumbbell'),
    (target_user, 'Flat Dumbbell Press', 'chest', 'dumbbell'),
    (target_user, 'Dumbbell Fly', 'chest', 'dumbbell'),
    (target_user, 'Cable Crossover', 'chest', 'other'),
    (target_user, 'Push-Up', 'chest', 'other'),
    (target_user, 'Overhead Press', 'shoulders', 'barbell'),
    (target_user, 'Seated Dumbbell Shoulder Press', 'shoulders', 'dumbbell'),
    (target_user, 'Lateral Raise', 'shoulders', 'dumbbell'),
    (target_user, 'Front Raise', 'shoulders', 'dumbbell'),
    (target_user, 'Rear Delt Fly', 'shoulders', 'dumbbell'),
    (target_user, 'Arnold Press', 'shoulders', 'dumbbell'),
    (target_user, 'Triceps Pushdown', 'arms', 'other'),
    (target_user, 'Overhead Triceps Extension', 'arms', 'dumbbell'),
    (target_user, 'Skull Crusher', 'arms', 'barbell'),
    (target_user, 'Close-Grip Bench Press', 'arms', 'barbell'),
    (target_user, 'Barbell Curl', 'arms', 'barbell'),
    (target_user, 'Dumbbell Curl', 'arms', 'dumbbell'),
    (target_user, 'Hammer Curl', 'arms', 'dumbbell'),
    (target_user, 'Preacher Curl', 'arms', 'barbell'),
    (target_user, 'Pull-Up', 'back', 'other'),
    (target_user, 'Chin-Up', 'back', 'other'),
    (target_user, 'Lat Pulldown', 'back', 'other'),
    (target_user, 'Barbell Row', 'back', 'barbell'),
    (target_user, 'Pendlay Row', 'back', 'barbell'),
    (target_user, 'Seated Cable Row', 'back', 'other'),
    (target_user, 'Single-Arm Dumbbell Row', 'back', 'dumbbell'),
    (target_user, 'Face Pull', 'back', 'other'),
    (target_user, 'Back Squat', 'legs', 'barbell'),
    (target_user, 'Front Squat', 'legs', 'barbell'),
    (target_user, 'Romanian Deadlift', 'legs', 'barbell'),
    (target_user, 'Deadlift', 'legs', 'barbell'),
    (target_user, 'Leg Press', 'legs', 'other'),
    (target_user, 'Leg Curl', 'legs', 'other'),
    (target_user, 'Leg Extension', 'legs', 'other'),
    (target_user, 'Bulgarian Split Squat', 'legs', 'dumbbell'),
    (target_user, 'Walking Lunge', 'legs', 'dumbbell'),
    (target_user, 'Standing Calf Raise', 'legs', 'other'),
    (target_user, 'Seated Calf Raise', 'legs', 'other'),
    (target_user, 'Hip Thrust', 'legs', 'barbell'),
    (target_user, 'Plank', 'core', 'other'),
    (target_user, 'Hanging Leg Raise', 'core', 'other')
  on conflict (user_id, lower(trim(name))) do nothing;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  perform public.seed_default_shopping_categories(new.id);
  perform public.seed_default_exercises(new.id);
  return new;
end;
$$;

-- Backfill: any already-existing user besides the owner (who already has
-- rows from the update above) who has no exercises yet gets seeded now.
do $$
declare
  u record;
begin
  for u in select id from auth.users loop
    if not exists (select 1 from public.exercises where user_id = u.id) then
      perform public.seed_default_exercises(u.id);
    end if;
  end loop;
end $$;
