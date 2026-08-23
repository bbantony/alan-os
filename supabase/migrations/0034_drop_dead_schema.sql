-- Alan OS — drop two pieces of schema that no code has ever used.
--
-- Found by an audit Alan asked for on 22 Aug 2026 ("remove all unwanted
-- functions and bloat from this app"). Both of these are the database half of
-- features that were designed and then not built, and both are actively
-- misleading: a table with RLS policies and an index looks maintained, and a
-- column declared in a TypeScript interface looks read.
--
-- THE GUARD BELOW IS DELIBERATE, and is the lesson from migration 0033. That
-- one recorded "verified empty" in a header comment, which unit-reviewer
-- correctly called a promise rather than a mechanism — a comment cannot stop a
-- replay against a database where the facts are different. This migration
-- refuses to run instead. On the database it was written for, both counts are
-- zero and the guard is invisible.
--
-- NOTE FOR ANYONE COMPARING THIS FILE TO WHAT RAN: the existence checks in the
-- guard were added AFTER this migration was applied, in response to review. On
-- the database it ran against both objects existed, so the added checks are a
-- provable no-op there — the behaviour is identical, and the file is now safe
-- to replay somewhere the objects are already gone, which it previously was not.

-- REPLAY-SAFE BY CONSTRUCTION. The counts below are only taken when the object
-- is still there. Without the existence checks this block raises
-- `undefined_table` on any database where the drops have already happened — a
-- restored snapshot missing its `_migrations` row, a branch database, a partial
-- dump — and would take every later migration in that run down with it. The
-- guard has to be exactly as idempotent as the `if exists` drops it protects.
--
-- What this proves and what it does not: it proves nobody has WRITTEN either
-- object. It cannot catch new code that only READS them — something filtering
-- `where mirror_to_gcal = false` would sail past this and break afterwards.
-- That half was established by grepping the tree, not by this mechanism.
do $$
declare
  comment_count integer;
  mirrored_count integer;
begin
  if to_regclass('public.comments') is not null then
    execute 'select count(*) from public.comments' into comment_count;
  else
    comment_count := 0;
  end if;

  if comment_count > 0 then
    raise exception
      'Refusing to drop public.comments: it holds % row(s). Somebody built the crew-comments UI after this migration was written — read those rows before deleting anything.',
      comment_count;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reminders' and column_name = 'mirror_to_gcal'
  ) then
    execute 'select count(*) from public.reminders where mirror_to_gcal = true' into mirrored_count;
  else
    mirrored_count := 0;
  end if;

  if mirrored_count > 0 then
    raise exception
      'Refusing to drop reminders.mirror_to_gcal: % row(s) have it set true, so something started using it.',
      mirrored_count;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- public.comments
-- ---------------------------------------------------------------------------
--
-- Created by 0005_workout.sql for the crew feed, with three RLS policies and an
-- index, and rebuilt again in 0018. The feed shipped with reactions only —
-- comments never got a screen, a server action, or a single row. Nothing in
-- src/ has ever named this table.
--
-- If crew comments are wanted later, 0005 is the record of the intended shape.
-- Note the shape it had was crew-scoped rather than owner-only, which is the
-- workout module's sanctioned exception to the RLS default — worth re-reading
-- rather than reinventing.
drop table if exists public.comments;

-- ---------------------------------------------------------------------------
-- public.reminders.mirror_to_gcal
-- ---------------------------------------------------------------------------
--
-- Created by 0011 when Google Calendar sync was a plan rather than an
-- implementation. When sync was actually built, `gcal_event_id` became the
-- thing that decides whether a row is mirrored — a row either has an event id
-- or it does not — and this boolean was never read or written by anything, in
-- app code or in SQL. It survived this long because the TypeScript `Reminder`
-- interface still declared it, which made it look alive to anyone reading the
-- types. That interface was deleted in the same pass as this column.
alter table public.reminders drop column if exists mirror_to_gcal;
