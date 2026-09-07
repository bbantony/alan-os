-- Propose-then-confirm for the assistant: one jsonb column on the message.
--
-- WHAT THIS IS FOR. Settings → AI & cost has a three-way "how bold should the
-- AI be" choice that, until now, only decided whether the weekly insight
-- offered chips. The assistant ignored it entirely and simply did whatever it
-- decided to do. At Alan's setting (`suggest`) the four money-writing tools
-- now stop and ask instead: the model's intent is stored on the assistant's
-- own message and a button turns it into an action. `lib/ai/boldness.ts`
-- holds the rule about which writes stop; this file holds where the stopped
-- ones are kept.
--
-- WHY ON THE MESSAGE AND NOT IN A TABLE OF ITS OWN. A proposal has exactly the
-- lifetime of the reply it belongs to. Migration 0041's retention triggers
-- already delete old messages, and the foreign key already cascades from the
-- conversation — so putting proposals on the message means they are cleaned up
-- by machinery that exists and is tested, with no second retention rule to
-- forget. It also makes "which reply was this button under?" a fact rather
-- than a join. Sitting beside `actions text[]` is deliberate: `actions` is
-- what the assistant DID, `proposals` is what it wants to do, and a reader
-- comparing the two columns learns the whole feature.
--
-- WHY jsonb AND NOT A COMPOSITE TYPE. `args` is whatever a tool's parameters
-- happen to be — different keys per tool, and they change whenever a tool
-- gains an argument. That is genuinely schemaless data and jsonb is the honest
-- storage for it. The array is read back through `sanitiseProposals` in
-- lib/ai/boldness.ts and never trusted raw.
--
-- ON THE 0041/0042 LESSON, WHICH DOES NOT BITE HERE BUT WAS CHECKED FOR. 0042
-- existed because 0041 created two functions and revoked EXECUTE only from
-- PUBLIC, leaving Supabase's own grants to `anon` and `authenticated` in
-- place. THIS MIGRATION CREATES NO FUNCTION, no trigger and no view, so there
-- is no ACL to correct — the check was run rather than assumed. The one thing
-- it does add is a column on a table whose RLS is already owner-only from
-- 0041, and a column inherits its table's policies, so a new column needs no
-- new policy. If a later migration adds an RPC to claim a proposal atomically
-- (see the "honest gap" note in today/outlook-actions.ts, which applies to
-- these proposals in exactly the same way), that migration must grant EXECUTE
-- to `authenticated` DELIBERATELY and revoke from `anon` and PUBLIC — not
-- assume the default is safe.

-- Idempotent: `if not exists` on the column, and the constraint guarded, so a
-- replay onto a database that already has both is silent rather than an error.
-- `not null default '[]'` backfills every existing row with an empty array, so
-- no read path ever has to consider null.
alter table public.assistant_messages
  add column if not exists proposals jsonb not null default '[]'::jsonb;

do $constraint$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'assistant_messages_proposals_is_array'
       and conrelid = 'public.assistant_messages'::regclass
  ) then
    -- A scalar or an object in this column would make `sanitiseProposals`
    -- return an empty list and the buttons silently vanish — a failure that
    -- looks like "the AI didn't offer anything" rather than like a bug. The
    -- database is the right place to make that state impossible.
    --
    -- The length ceiling mirrors the reasoning behind
    -- `assistant_messages_content_length`: nothing this app produces comes
    -- near it, and it exists so a malformed reply cannot put an unbounded blob
    -- in the chat log. A turn proposes single-digit numbers of actions.
    alter table public.assistant_messages
      add constraint assistant_messages_proposals_is_array
      check (jsonb_typeof(proposals) = 'array' and length(proposals::text) <= 16000);
  end if;
end;
$constraint$;

comment on column public.assistant_messages.proposals is
  'Writes the assistant wants to make but has not made, waiting on a tap. Each entry is {label, tool, args, actedAt}; actedAt is stamped, never removed, because the browser addresses a proposal by its index. Written only by ask(); executed only by runAssistantProposal().';

-- Verify rather than assume — 0042 exists because 0041 did not.
do $verify$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'assistant_messages'
       and column_name = 'proposals'
       and is_nullable = 'NO'
  ) then
    raise exception '0043: assistant_messages.proposals is missing or nullable';
  end if;

  -- RLS on the parent table is what protects this column. If it were ever off,
  -- a jsonb column naming tools and their arguments would be readable by any
  -- holder of the anon key — worth failing the migration over.
  if not exists (
    select 1 from pg_class
     where oid = 'public.assistant_messages'::regclass
       and relrowsecurity
  ) then
    raise exception '0043: RLS is not enabled on assistant_messages';
  end if;
end;
$verify$;
