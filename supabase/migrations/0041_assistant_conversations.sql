-- The assistant remembers what you said.
--
-- WHAT WAS WRONG. Every message in the assistant lived in `useState` inside
-- assistant-chat.tsx and nowhere else. Navigate to Money and back, close the
-- PWA, let Android reclaim the tab — the conversation was gone, and the very
-- next question started from nothing. Alan had already paid for those answers.
--
-- TWO TABLES, NOT ONE ROW WITH A JSON ARRAY. The jsonb-blob shape is tempting
-- (`preferences` and `theme_settings` both use it) and it is wrong here, for
-- three reasons:
--
--   1. APPENDING. A blob append is read-modify-write of the whole document.
--      Two writers — the chat screen and the global capture sheet, which can
--      both be open at once — race, and the loser's message vanishes with no
--      error. A row insert cannot lose a concurrent insert.
--   2. RETENTION. The cap below ("keep the newest N") is one DELETE with an
--      OFFSET against rows. Against a blob it is another whole-document
--      rewrite, and the row keeps growing until Postgres TOASTs it and every
--      single read drags the entire chat history off disk.
--   3. DELETION HAS TO BE REAL. When Alan deletes a chat the messages must be
--      GONE, not "removed from the array the client last sent us". Rows plus
--      `on delete cascade` make that a database fact rather than a promise the
--      client is trusted to keep — and the server actions read history back
--      out of here rather than trusting the browser's copy, so a deleted
--      message cannot be re-uploaded by a stale tab.
--
-- RETENTION RULE (documented here because it is a product decision, not an
-- implementation detail):
--
--   * at most 200 messages per conversation — oldest dropped first;
--   * at most 30 conversations per account — least recently used dropped first.
--
-- A hard ceiling of 6,000 rows per account, which on the Supabase free tier is
-- a rounding error, and no clock involved: an age rule would quietly delete a
-- chat Alan had not opened in three months, which is not the same thing as a
-- chat he does not want. Both caps are enforced by TRIGGERS, not by the server
-- action, so nothing that can insert a row can skip the pruning. 200 is chosen
-- against the other number in this feature: the model is only ever sent the
-- last 12 messages (MAX_HISTORY, lib/ai/history.ts), so everything past that
-- is scrollback for a human, and 200 is about 100 exchanges of it.
--
-- COST: nothing here changes what is sent to the model. See lib/ai/history.ts.

-- Guard. `create table if not exists` is silent when a table of the SAME NAME
-- and a DIFFERENT SHAPE already exists, which is the exact failure a replay of
-- a half-applied migration produces. The block at the bottom verifies the
-- shape after the fact; this one only checks the thing we depend on.
-- (`information_schema` name columns are a domain over `name`, not `text`, so
-- both sides of every comparison below are cast — the trap in HANDOFF section 6.)
do $guard$
begin
  if to_regclass('auth.users') is null then
    raise exception '0041: auth.users must exist first';
  end if;
end;
$guard$;

-- ---------------------------------------------------------------------------
-- 1. Conversations
-- ---------------------------------------------------------------------------

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Written by the server action from the first question asked, not by the
  -- model — naming a chat is not worth an AI call. Null until then, and the
  -- UI falls back to "New chat".
  title text,
  created_at timestamptz not null default now(),
  -- The sort key for "which chat am I in" and for the least-recently-used
  -- pruning below. Maintained by the message trigger.
  last_message_at timestamptz not null default now(),
  constraint assistant_conversations_title_length
    check (title is null or length(title) <= 200)
);

comment on table public.assistant_conversations is
  'One assistant chat thread. The most recent by last_message_at is the one the /assistant screen opens into. Capped at 30 per account by trigger.';

alter table public.assistant_conversations enable row level security;

drop policy if exists "assistant_conversations_all_own" on public.assistant_conversations;
create policy "assistant_conversations_all_own"
  on public.assistant_conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The only two reads there are: "my current conversation" (limit 1) and "my
-- recent conversations" (limit 30). Both are this index, with no sort step.
create index if not exists assistant_conversations_user_recent_idx
  on public.assistant_conversations (user_id, last_message_at desc);

-- ---------------------------------------------------------------------------
-- 2. Messages
-- ---------------------------------------------------------------------------

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  -- Denormalised on purpose. The RLS policy below could reach the owner
  -- through the conversation, but then every row read runs a join under the
  -- policy; carrying user_id makes the common case a plain column compare.
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  content text not null,
  -- The `actions` array AssistantMessage carries (lib/ai/history.ts): the
  -- names of the tools that actually WROTE something while answering, which is
  -- what the "what I did" line under a reply is built from. Empty for every
  -- question and for every read-only answer.
  actions text[] not null default '{}'::text[],
  -- clock_timestamp(), NOT now(). now() is transaction start time, and the
  -- question and its answer are written in ONE multi-row insert so a failed
  -- save cannot leave an answer with no question. Under now() both rows would
  -- carry the identical instant and the conversation would replay in an
  -- arbitrary order. clock_timestamp() is evaluated per row.
  created_at timestamptz not null default clock_timestamp(),
  constraint assistant_messages_conversation_fkey
    foreign key (conversation_id)
    references public.assistant_conversations (id) on delete cascade,
  constraint assistant_messages_role_valid check (role in ('user', 'assistant')),
  constraint assistant_messages_content_not_empty check (length(btrim(content)) > 0),
  -- A ceiling, not a target. Nothing this app produces comes near 32k
  -- characters; the constraint exists so a runaway paste or a malformed reply
  -- cannot put an unbounded blob in the chat log. Hitting it fails the SAVE
  -- only — ask() degrades to in-memory and the reply still reaches the screen.
  constraint assistant_messages_content_length check (length(content) <= 32000)
);

comment on table public.assistant_messages is
  'One turn of an assistant conversation. Capped at 200 rows per conversation by trigger, oldest dropped first.';

alter table public.assistant_messages enable row level security;

-- Read and write your own rows, AND only inside your own conversation. The
-- second half matters: without it the `user_id` predicate alone would let one
-- account attach its own rows to another account's conversation_id. Nobody
-- could READ them (the owner's select is still user_id-scoped) but it would be
-- someone else's storage to fill, and a foreign key pointing across accounts
-- is a bug waiting to be inherited by whatever reads this next.
drop policy if exists "assistant_messages_all_own" on public.assistant_messages;
create policy "assistant_messages_all_own"
  on public.assistant_messages for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.assistant_conversations c
      where c.id = assistant_messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

-- The read path is exactly one query: every message of one conversation in
-- order. `created_at desc, id desc` because the loader takes the newest N and
-- reverses; the id tiebreak makes the order total rather than merely likely.
create index if not exists assistant_messages_conversation_idx
  on public.assistant_messages (conversation_id, created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- 3. Retention, enforced by the database
-- ---------------------------------------------------------------------------
--
-- Both functions are `security invoker`: they run as the signed-in account, so
-- the UPDATE and the DELETEs are checked against the same RLS policies as any
-- other statement. A security definer here would be a way to delete another
-- account's chats, and there is no reason to need one.

create or replace function public.prune_assistant_messages()
returns trigger
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  message_cap constant integer := 200;
begin
  -- Keep the parent's sort key honest. Written from the row's own timestamp
  -- rather than now() so a backfilled row cannot pull a conversation to the
  -- top of the list.
  update public.assistant_conversations c
     set last_message_at = greatest(c.last_message_at, new.created_at)
   where c.id = new.conversation_id;

  delete from public.assistant_messages m
   where m.conversation_id = new.conversation_id
     and m.id in (
       select id
         from public.assistant_messages
        where conversation_id = new.conversation_id
        order by created_at desc, id desc
       offset message_cap
     );

  return null;
end;
$fn$;

drop trigger if exists assistant_messages_prune on public.assistant_messages;
create trigger assistant_messages_prune
  after insert on public.assistant_messages
  for each row execute function public.prune_assistant_messages();

create or replace function public.prune_assistant_conversations()
returns trigger
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  conversation_cap constant integer := 30;
begin
  delete from public.assistant_conversations c
   where c.user_id = new.user_id
     -- Belt and braces: the new row sorts first under the ordering below, so
     -- it cannot be inside the offset window anyway. This says so out loud.
     and c.id <> new.id
     and c.id in (
       select id
         from public.assistant_conversations
        where user_id = new.user_id
        order by last_message_at desc, created_at desc
       offset conversation_cap
     );

  return null;
end;
$fn$;

drop trigger if exists assistant_conversations_prune on public.assistant_conversations;
create trigger assistant_conversations_prune
  after insert on public.assistant_conversations
  for each row execute function public.prune_assistant_conversations();

-- Postgres grants EXECUTE to PUBLIC on every new function (the hole 0035
-- closed for the seed functions). These are trigger functions and cannot be
-- called directly with a useful argument, but the revoke costs nothing.
--
-- CORRECTED 6 Sep 2026 — COMMENT ONLY, the statements below are exactly as
-- they were applied. This paragraph used to claim the result was that "nothing
-- added to this schema is callable by `public`". That was false, and was
-- checked against the live database: `pg_proc.proacl` for both functions read
-- postgres=X,anon=X,authenticated=X,service_role=X afterwards. Revoking from
-- PUBLIC does not remove the EXECUTE that Supabase's default privileges grant
-- to `anon` and `authenticated` separately — 0035 got this right by naming all
-- three (`from public, anon, authenticated`) and these two lines did not.
-- Migration 0042 finishes the job; it is not repeated here, because editing an
-- already-applied file changes nothing in any database that has run it.
revoke execute on function public.prune_assistant_messages() from public;
revoke execute on function public.prune_assistant_conversations() from public;

-- ---------------------------------------------------------------------------
-- 4. Verify, do not assume
-- ---------------------------------------------------------------------------
--
-- `create table if not exists` above is a no-op against a table of the same
-- name with the wrong columns, and a no-op that reports success is how a
-- migration lies. This aborts the apply instead.
do $verify$
declare
  missing text;
  unprotected text;
begin
  select string_agg(req.tbl || '.' || req.col, ', ' order by req.tbl, req.col)
    into missing
  from (values
    ('assistant_conversations', 'id'),
    ('assistant_conversations', 'user_id'),
    ('assistant_conversations', 'title'),
    ('assistant_conversations', 'created_at'),
    ('assistant_conversations', 'last_message_at'),
    ('assistant_messages', 'id'),
    ('assistant_messages', 'conversation_id'),
    ('assistant_messages', 'user_id'),
    ('assistant_messages', 'role'),
    ('assistant_messages', 'content'),
    ('assistant_messages', 'actions'),
    ('assistant_messages', 'created_at')
  ) as req(tbl, col)
  where not exists (
    select 1
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name::text = req.tbl
       and c.column_name::text = req.col
  );

  if missing is not null then
    raise exception '0041: assistant memory is missing column(s): %', missing;
  end if;

  -- RLS in the same migration as the table is the hard rule (SPEC.md B2). This
  -- makes it impossible to have shipped this file with it switched off.
  select string_agg(t.relname::text, ', ' order by t.relname::text)
    into unprotected
    from pg_class t
    join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname::text in ('assistant_conversations', 'assistant_messages')
     and t.relrowsecurity is false;

  if unprotected is not null then
    raise exception '0041: row level security is OFF on: %', unprotected;
  end if;
end;
$verify$;
