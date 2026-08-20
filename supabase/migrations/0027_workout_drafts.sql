-- Alan OS — a workout session that survives your phone.
--
-- THE PROBLEM. `draftExercises` in new-workout-form.tsx has only ever lived in
-- React state. Lock the phone, switch to Spotify and back, let the browser
-- evict the tab — every set logged so far is gone, with no warning and no way
-- back. In a gym, on a phone, mid-session, that is the most damaging thing in
-- the module, and it has been true since Phase 2.
--
-- WHY A SEPARATE TABLE rather than a `workouts` row with status='in_progress'.
-- An in-progress workout row would have to be excluded from every query that
-- already exists — the crew feed, the leaderboard, streaks,
-- getWorkoutDashboardSummary, the Today dashboard — and the one that gets
-- forgotten silently counts an abandoned half-session as a real workout,
-- inflating a streak that is supposed to mean something. A separate table
-- cannot leak into anything that already exists. That is the whole argument.
--
-- One row per user: a person has at most one session on the go. The primary
-- key enforces it, so "save the draft" is a plain upsert with nothing to
-- reconcile.
create table public.workout_drafts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- The whole draft as the client holds it: type, date, notes, and the
  -- exercises with their sets. Deliberately opaque jsonb rather than modelled
  -- columns — this is scratch state on its way to becoming real `workouts` and
  -- `workout_sets` rows, and giving it a schema of its own would mean
  -- migrating it every time the logging form changes shape.
  payload jsonb not null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workout_drafts enable row level security;

-- Strictly private, unlike the rest of the workout tables which are
-- crew-readable. A half-finished session is nobody else's business.
create policy "workout_drafts_all_own"
  on public.workout_drafts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
