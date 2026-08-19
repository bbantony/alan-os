-- Alan OS — Phase 6: Journal (photo-a-day) and Vinyl.
--
-- Two small, entirely personal modules. Neither is shared with anyone (unlike
-- the workout tables), so both get the plain `auth.uid() = user_id` policy
-- that every other private table in this app already uses.

-- ---------------------------------------------------------------------------
-- Journal
-- ---------------------------------------------------------------------------

-- SPEC.md Part E6 says the mood is optional and the photo is required. Mood is
-- an enum rather than free text because it's rendered as a fixed row of five
-- choices — a typo'd mood string would silently fall out of every filter and
-- summary that ever reads it.
create type public.journal_mood as enum ('great', 'good', 'fine', 'low', 'rough');

-- One entry per day, enforced by the database rather than by the UI: the
-- "photo a day" premise stops meaning anything the moment a day can hold two.
-- A day is a plain `date` in America/Winnipeg (computed by the app before it
-- writes) — not a timestamp — because "which day is this photo for" is a
-- calendar question, the same call already made for routine_completions.
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  storage_path text not null,
  caption text,
  mood public.journal_mood,
  story text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

alter table public.journal_entries enable row level security;

create policy "journal_entries_all_own"
  on public.journal_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The gallery reads a month at a time, newest first.
create index journal_entries_user_date_idx
  on public.journal_entries (user_id, entry_date desc);

-- Private bucket, same "<user_id>/<uuid>.<ext>" path convention and the same
-- first-path-segment policy already proven on the receipts bucket in 0017.
-- Photos are compressed to ~1600px in the browser before they ever get here
-- (SPEC.md Part E6) to protect the 1GB free tier.
insert into storage.buckets (id, name, public)
values ('journal', 'journal', false)
on conflict (id) do nothing;

create policy "journal_storage_own" on storage.objects for all
  using (bucket_id = 'journal' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'journal' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- The daily journal nudge
-- ---------------------------------------------------------------------------
--
-- "Daily reminder push at user-set time if today has no entry" (Part E6). The
-- push half of that already exists — the reminders table is the dispatcher's
-- queue and nothing else since 0023 — so the nudge is one ordinary recurring
-- reminder row, flagged so two things can tell it apart from a task's nudge:
--
--   1. the dispatcher, which must NOT push it on a day already journalled;
--   2. migration 0022's orphan invariant, which says a reminder attached to
--      neither a task nor a routine is wreckage. A journal nudge is attached
--      to the module rather than to a row, so it is the one legitimate
--      exception — the partial index below is rebuilt to exclude it so the
--      "find the orphans" query keeps meaning what it says.
alter table public.reminders
  add column if not exists is_journal_nudge boolean not null default false;

drop index if exists public.reminders_unattached_active_idx;
create index reminders_unattached_active_idx
  on public.reminders (remind_at)
  where linked_task_id is null
    and linked_routine_id is null
    and is_journal_nudge = false
    and status = 'active';

-- The dispatcher has no user session at all (an external pinger hits it with
-- no cookies), so — exactly like every other cross-user read it does — this is
-- a security-definer function that checks the cron secret itself rather than
-- relying on the caller. See 0012 for the full reasoning.
create function public.journal_entry_exists(secret text, target_user uuid, on_date date)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.check_cron_secret(secret);
  return exists (
    select 1 from public.journal_entries
    where user_id = target_user and entry_date = on_date
  );
end;
$$;

grant execute on function public.journal_entry_exists(text, uuid, date) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Vinyl
-- ---------------------------------------------------------------------------

-- Cover art is a remote iTunes URL rather than a copied image: the artwork is
-- already on a CDN, it never changes, and copying every sleeve into the 1GB
-- Storage tier would spend the same budget the journal photos actually need.
-- `cover_url` stays writable so a wrong or missing match can be corrected by
-- hand (Part E6: "auto-fill cover art (editable manually)").
--
-- rating is numeric(3,1) — 1.0 to 10.0 with exactly one decimal, which is the
-- spec's own wording. Postgres enforces the single decimal place by rounding
-- to the declared scale, so the "8.65" case can't sneak past the UI.
create table public.vinyl_albums (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  artist text not null,
  title text not null,
  release_year int,
  cover_url text,
  itunes_collection_id bigint,
  listened_on date,
  rating numeric(3, 1) check (rating is null or (rating >= 1.0 and rating <= 10.0)),
  favorite_tracks text[] not null default '{}',
  purchased_at text,
  thoughts text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vinyl_albums enable row level security;

create policy "vinyl_albums_all_own"
  on public.vinyl_albums for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The shelf sorts by rating, listen date or artist; all three start from the
-- same per-user scan, so one covering index on user_id is the honest one.
create index vinyl_albums_user_idx on public.vinyl_albums (user_id, listened_on desc);
