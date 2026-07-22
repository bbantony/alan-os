-- Alan OS — Phase 2 follow-up (owner feedback): barbell weight-entry mode, and
-- making exercises/templates actually editable after the fact.

alter table public.exercises add column is_barbell boolean not null default false;

update public.exercises set is_barbell = true
where lower(trim(name)) in (
  'barbell bench press',
  'incline barbell bench press',
  'overhead press',
  'close-grip bench press',
  'barbell curl',
  'barbell row',
  'pendlay row',
  'back squat',
  'front squat',
  'romanian deadlift',
  'deadlift',
  'hip thrust'
);

-- Exercises are crew-shared and the master list is seeded with created_by = null,
-- which under the original owner-only update policy meant literally nobody could
-- ever fix a typo in a seeded name. Same "small trusted crew" collapse already
-- used for select in 0005: any authenticated crew member may edit an exercise's
-- name/muscle group/equipment flag. Deletion stays creator-only (unchanged).
drop policy "exercises_update_own" on public.exercises;

create policy "exercises_update_crew"
  on public.exercises for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
