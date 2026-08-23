-- Alan OS — remove Journal and Vinyl from the database.
--
-- The app code for both modules was stripped at Alan's request in the Round 1
-- interconnection work (CHANGELOG.md entry 34), but their tables were
-- deliberately left in place "for now". On 22 Aug 2026 he asked to "strip the
-- journal and vinyl part completely", so this finishes the job.
--
-- VERIFIED EMPTY before this was written, against the live database:
-- journal_entries 0 rows, vinyl_albums 0 rows, 0 objects in the `journal`
-- storage bucket, and 0 reminders flagged as journal nudges. Nothing is being
-- destroyed here except empty structure. Migration 0024 remains in the history
-- as the full record of what these modules were, if they are ever wanted back —
-- do not rebuild them from memory, and do not rebuild them at all without
-- asking Alan first.

-- ---------------------------------------------------------------------------
-- The trap, dealt with first
-- ---------------------------------------------------------------------------
--
-- `reminders.is_journal_nudge` looks like a Journal column, and mostly is — but
-- migration 0024 also REBUILT 0022's orphan-sweep index to exclude journal
-- nudges from it. The live index definition therefore has
-- `is_journal_nudge = false` baked into its predicate, and dropping the column
-- without rebuilding the index would take 0022's orphan invariant down with it:
-- "a reminder attached to neither a task nor a routine is wreckage", and the
-- partial index is what makes finding that wreckage cheap.
--
-- So the index is restored to EXACTLY its 0022 definition — which is also the
-- correct definition again, because with Journal gone there is no longer a
-- legitimate exception to the rule. The one reason the column existed has
-- stopped existing.
drop index if exists public.reminders_unattached_active_idx;

create index reminders_unattached_active_idx
  on public.reminders (remind_at)
  where linked_task_id is null and linked_routine_id is null and status = 'active';

alter table public.reminders
  drop column if exists is_journal_nudge;

-- ---------------------------------------------------------------------------
-- Journal
-- ---------------------------------------------------------------------------

-- The dispatcher's "has today already been journalled?" check. Nothing calls it
-- — the cron route stopped referencing it when the module was removed from the
-- app — and it reads a table that is about to not exist.
drop function if exists public.journal_entry_exists(text, uuid, date);

-- Policies and indexes go with the table; naming them is documentation rather
-- than necessity.
drop table if exists public.journal_entries;

drop type if exists public.journal_mood;

-- The storage policy. The BUCKET ITSELF CANNOT BE DROPPED FROM SQL — Supabase
-- rejects it outright ("Direct deletion from storage tables is not allowed.
-- Use the Storage API instead."), which is a guard against orphaning the
-- objects inside a bucket. 0024 was able to `insert into storage.buckets` to
-- create it, so the asymmetry is easy to trip over; it is written down here so
-- the next person does not rediscover it the hard way.
--
-- THE BUCKET IS THEREFORE STILL THERE, and this migration cannot remove it.
-- Deleting it needs the Storage API with a service-role key, and
-- `SUPABASE_SERVICE_ROLE_KEY` is empty in this project's environment — no app
-- code uses one either, so there is nothing to borrow.
--
-- It is harmless where it sits: verified empty (0 objects), private, and with
-- the policy above dropped there is no longer any policy granting access to it,
-- so nothing can read or write it. Removing it is a 15-second job for Alan in
-- the Supabase dashboard under Storage, and is listed as an owner action in
-- PROGRESS.md. Recorded here rather than quietly left, because an undocumented
-- leftover bucket is exactly the kind of thing that looks like a live feature
-- to whoever finds it next.
drop policy if exists "journal_storage_own" on storage.objects;

-- ---------------------------------------------------------------------------
-- Vinyl
-- ---------------------------------------------------------------------------

drop table if exists public.vinyl_albums;

-- ---------------------------------------------------------------------------
-- Not touched, on purpose
-- ---------------------------------------------------------------------------
--
-- `profiles.module_access` may still carry "journal" and "vinyl" keys seeded by
-- 0018. They are inert: `fillModuleAccess` in the admin actions normalises
-- unknown keys away, and rewriting every profile's JSON to tidy two dead keys
-- would be a data migration with real risk for no behavioural gain.
--
-- The `Vinyl/Music` budget category seeded by 0016 is NOT part of this module.
-- It is one of Alan's spending categories and belongs to Money.
