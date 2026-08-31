-- Closes the five security holes from the 26 Aug 2026 full-codebase audit,
-- plus the data-integrity and index findings that live in the schema rather
-- than in application code.
--
-- READ THIS FIRST IF YOU ARE RESTORING A DATABASE. Section 3 below makes
-- `check_cron_secret` fail CLOSED. Until `app_secrets` actually contains a row
-- with key = 'cron_secret', every cron RPC will refuse — which is the point,
-- but it means reminders stop rather than silently accepting any caller. The
-- seed at the end of section 3 plants a row if none exists; replace its value
-- with the real CRON_SECRET from the Vercel environment before relying on it.

-- ---------------------------------------------------------------------------
-- 1. crew_push_subscriptions() returned EVERY user's push keys
-- ---------------------------------------------------------------------------
-- 0012 created this for the crew-PR push, when "crew" still meant "every
-- authenticated account". 0018 rewrote every workout TABLE policy to be
-- crew-scoped and never revisited this function, so it stayed wider than the
-- module it serves: any logged-in account could read the endpoint and the
-- p256dh/auth keys for every account in the app, straight from the browser.
--
-- Same predicate the workout tables use, so the two can't drift apart again.
create or replace function public.crew_push_subscriptions()
returns table (id uuid, user_id uuid, endpoint text, keys jsonb)
language sql security definer set search_path = public stable
as $$
  select s.id, s.user_id, s.endpoint, s.keys
  from public.push_subscriptions s
  where s.user_id = auth.uid()
     or public.is_admin()
     or public.same_crew(s.user_id);
$$;

-- ---------------------------------------------------------------------------
-- 2. delete_crew_push_subscription() deleted any row by id, unconditionally
-- ---------------------------------------------------------------------------
-- Chained with #1 this was a full notification hijack: read every
-- subscription id, delete the victim's row, then re-register their endpoint
-- under your own account (savePushSubscription upserts on `endpoint`). The
-- victim silently stops receiving reminders and the attacker starts.
create or replace function public.delete_crew_push_subscription(subscription_id uuid)
returns void
language sql security definer set search_path = public
as $$
  delete from public.push_subscriptions s
  where s.id = subscription_id
    and (s.user_id = auth.uid() or public.is_admin() or public.same_crew(s.user_id));
$$;

-- ---------------------------------------------------------------------------
-- 3. check_cron_secret failed OPEN when the secret row was missing
-- ---------------------------------------------------------------------------
-- `secret <> (select value ...)` is NULL when the subquery returns no row, and
-- `if NULL then` does not fire — so no exception was raised and every gated
-- RPC accepted any string. No migration has ever inserted the row; it exists
-- in production only because it was typed in by hand. On any rebuilt, restored
-- or branched database, nine cross-user functions were wide open to anyone
-- holding the public anon key.
--
-- `exists` is never NULL, so this fails closed by construction.
create or replace function public.check_cron_secret(secret text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if secret is null or not exists (
    select 1 from public.app_secrets
    where key = 'cron_secret' and value = secret
  ) then
    raise exception 'unauthorized';
  end if;
end;
$$;

-- The row the check has always assumed existed. Left alone if it is already
-- there, so this does not clobber the live value.
-- gen_random_uuid(), not gen_random_bytes(): the latter is pgcrypto, and this
-- would have been the only pgcrypto call in 35 migrations — an unproven
-- dependency that would abort this whole transaction, and the five security
-- fixes with it, if the extension were not on the search path.
-- gen_random_uuid() is core Postgres and every table in the app already
-- defaults to it. Two of them concatenated is 256 bits of randomness.
insert into public.app_secrets (key, value)
select 'cron_secret',
       replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where not exists (select 1 from public.app_secrets where key = 'cron_secret');

-- ---------------------------------------------------------------------------
-- 4. Three SECURITY DEFINER seed functions were callable by anyone
-- ---------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default, and there is no `revoke` on
-- any function anywhere in migrations 0001-0034. All three take a caller-
-- supplied target_user and write rows keyed by it, so any authenticated user
-- could inject rows into any other account's shopping categories, exercise
-- library or Finance categories. Account ids are enumerable.
--
-- The only legitimate caller is the handle_new_user trigger, which runs as the
-- definer and is unaffected by these revokes.
revoke execute on function public.seed_default_shopping_categories(uuid) from public, anon, authenticated;
revoke execute on function public.seed_default_exercises(uuid) from public, anon, authenticated;
revoke execute on function public.seed_default_categories(uuid) from public, anon, authenticated;

-- seed_default_shopping_categories had no conflict guard, so it could also be
-- called in a loop to flood a list. Belt and braces now that it is locked down.
--
-- CONDITIONAL, because duplicates may already exist — that unguarded function
-- is exactly what would have created them, and this whole migration runs in
-- one transaction, so a failed CREATE UNIQUE INDEX would roll back the five
-- security fixes above with it. A warning that leaves the holes closed beats
-- an abort that leaves them open. Re-run this migration after tidying any
-- duplicates by hand and the index will be created then.
do $$
declare
  dupes integer;
begin
  select count(*) into dupes from (
    select user_id, lower(name)
    from public.shopping_categories
    group by user_id, lower(name)
    having count(*) > 1
  ) d;

  if dupes = 0 then
    create unique index if not exists shopping_categories_user_name_idx
      on public.shopping_categories (user_id, lower(name));
  else
    raise warning 'shopping_categories: % duplicate (user_id, name) pair(s) — unique index NOT created. Merge them, then re-run.', dupes;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. public._migrations had no RLS
-- ---------------------------------------------------------------------------
-- Created by scripts/run-migration.mjs (also fixed there) in the PostgREST-
-- exposed `public` schema with no RLS and no revoke — the one table in the app
-- without it. Deleting rows from it makes the next deploy replay old
-- migrations, and 0022 contains an unconditional `delete from reminders`.
--
-- No policies at all: nothing outside a superuser connection has any business
-- reading or writing this.
alter table if exists public._migrations enable row level security;
revoke all on public._migrations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. routine_completions could be locked by another account
-- ---------------------------------------------------------------------------
-- `unique (routine_id, completed_date)` omits user_id while RLS scopes by it.
-- Another account could insert a completion against your routine for today;
-- their row is invisible to you under RLS, so your own upsert collided with
-- something you could not see and failed silently, permanently, for that day.
-- Dropped by LOOKUP rather than by guessed name. `drop constraint if exists`
-- with the wrong name is a silent no-op, which would leave the old constraint
-- in place beside the new one and keep the bug.
do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'routine_completions'
      and c.contype = 'u'
      and (
        -- ::text on both the aggregate and the ORDER BY. `pg_attribute.attname`
        -- is of type `name`, so array_agg gives name[] and comparing that to a
        -- text[] literal is "operator does not exist: name[] = text[]".
        select array_agg(a.attname::text order by a.attname::text)
        from unnest(c.conkey) k
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
      ) = array['completed_date', 'routine_id']
  loop
    execute format('alter table public.routine_completions drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.routine_completions
  drop constraint if exists routine_completions_user_routine_date_key;
alter table public.routine_completions
  add constraint routine_completions_user_routine_date_key
  unique (user_id, routine_id, completed_date);

-- Every caller filters (user_id, completed_date); the existing index leads on
-- routine_id so none of them could use it.
create index if not exists routine_completions_user_date_idx
  on public.routine_completions (user_id, completed_date);

-- ---------------------------------------------------------------------------
-- 7. ai_usage was writable by its own user, so the AI spend cap was advisory
-- ---------------------------------------------------------------------------
-- The meter is the brake. With `for all` the browser could delete or pad its
-- own rows and reset the monthly ceiling. Reads stay open (the cost screen
-- needs them); writes now go through a definer that stamps auth.uid() itself.
drop policy if exists "ai_usage_all_own" on public.ai_usage;

create policy "ai_usage_select_own"
  on public.ai_usage for select
  using (auth.uid() = user_id);

create or replace function public.record_ai_usage(
  p_feature text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cost_micros bigint
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;
  insert into public.ai_usage (user_id, feature, model, input_tokens, output_tokens, cost_micros)
  values (auth.uid(), p_feature, p_model,
          greatest(0, p_input_tokens), greatest(0, p_output_tokens), greatest(0, p_cost_micros));
end;
$$;
grant execute on function public.record_ai_usage(text, text, integer, integer, bigint) to authenticated;

-- Summing 'what have I spent this month' in the app meant a plain select,
-- which PostgREST caps at 1000 rows — so past 1000 calls the total silently
-- stopped growing and the ceiling could never be reached. Do it in SQL.
create or replace function public.ai_usage_month_total(since timestamptz)
returns table (spent_micros bigint, call_count bigint)
language sql security definer set search_path = public stable
as $$
  select coalesce(sum(cost_micros), 0)::bigint, count(*)::bigint
  from public.ai_usage
  where user_id = auth.uid() and created_at >= since;
$$;
grant execute on function public.ai_usage_month_total(timestamptz) to authenticated;

-- Same question, split by feature — the cost screen's breakdown, which had the
-- same 1000-row ceiling.
create or replace function public.ai_usage_month_by_feature(since timestamptz)
returns table (feature text, call_count bigint, cost_micros bigint)
language sql security definer set search_path = public stable
as $$
  select u.feature, count(*)::bigint, coalesce(sum(u.cost_micros), 0)::bigint
  from public.ai_usage u
  where u.user_id = auth.uid() and u.created_at >= since
  group by u.feature
  order by 3 desc;
$$;
grant execute on function public.ai_usage_month_by_feature(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. push_subscriptions.endpoint was globally unique, not per account
-- ---------------------------------------------------------------------------
-- Two people on one browser profile, or a re-issued endpoint, produced a
-- unique violation the second person could not see, diagnose or clear. It was
-- also the pivot that made the hijack in #2 land cleanly.
do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'push_subscriptions'
      and c.contype = 'u'
      and (
        -- ::text on both the aggregate and the ORDER BY. `pg_attribute.attname`
        -- is of type `name`, so array_agg gives name[] and comparing that to a
        -- text[] literal is "operator does not exist: name[] = text[]".
        select array_agg(a.attname::text order by a.attname::text)
        from unnest(c.conkey) k
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
      ) = array['endpoint']
  loop
    execute format('alter table public.push_subscriptions drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_user_endpoint_key;
alter table public.push_subscriptions
  add constraint push_subscriptions_user_endpoint_key unique (user_id, endpoint);

-- ---------------------------------------------------------------------------
-- 9. Missing and duplicated indexes
-- ---------------------------------------------------------------------------
-- 0031 created an index byte-identical to 0025's: same table, same column,
-- same predicate. Both were maintained on every write.
drop index if exists public.recurring_transactions_notify_idx;

-- 0007 dropped workout_templates.type, which silently dropped the table's only
-- index (0005 created it on (user_id, type)). Every template read has been a
-- full scan since.
create index if not exists workout_templates_user_idx
  on public.workout_templates (user_id);

-- tasks is the most-queried table in the app and had only (user_id, horizon,
-- sort_order). The plan range, the ledger and the AI tools all filter on dates.
create index if not exists tasks_user_due_idx on public.tasks (user_id, due_at);
create index if not exists tasks_user_completed_idx on public.tasks (user_id, completed_at);
-- Self-referencing FK with ON DELETE CASCADE and no index: every task delete
-- sequentially scanned the table.
create index if not exists tasks_parent_idx on public.tasks (parent_task_id);

-- ---------------------------------------------------------------------------
-- 10. Statement reconciliation had no uniqueness guard
-- ---------------------------------------------------------------------------
-- Two submissions (a retry, or a double tap beating the loading flag) inserted
-- two records and two adjusting transactions, correcting the balance twice and
-- leaving it off by the original gap again.
-- Conditional for the same reason as the shopping index above: nothing
-- previously stopped the same statement being reconciled twice, so duplicates
-- may already be there. These are historical records and are never deleted
-- automatically — a human decides which one was real.
do $$
declare
  dupes integer;
begin
  select count(*) into dupes from (
    select user_id, account_id, statement_date
    from public.reconciliations
    group by user_id, account_id, statement_date
    having count(*) > 1
  ) d;

  if dupes = 0 then
    create unique index if not exists reconciliations_user_account_date_idx
      on public.reconciliations (user_id, account_id, statement_date);
  else
    raise warning 'reconciliations: % duplicate (account, statement_date) pair(s) — unique index NOT created. Delete the wrong one, then re-run.', dupes;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Money amounts had no positivity constraints
-- ---------------------------------------------------------------------------
-- A negative budget makes safe-to-spend rise as you spend. Only
-- recurring_transactions had a check. Added as NOT VALID so an existing bad
-- row cannot block the migration; validate separately once the data is clean.
alter table public.budgets
  drop constraint if exists budgets_amount_positive,
  add constraint budgets_amount_positive check (amount_cents > 0) not valid;
alter table public.savings_goals
  drop constraint if exists savings_goals_target_positive,
  add constraint savings_goals_target_positive check (target_cents > 0) not valid;
alter table public.transactions
  drop constraint if exists transactions_amount_positive,
  add constraint transactions_amount_positive check (amount_cents > 0) not valid;

-- ---------------------------------------------------------------------------
-- 12. Balance updates were read-modify-write from the app
-- ---------------------------------------------------------------------------
-- Every balance move in the app used to read current_balance_cents, add a
-- delta in JavaScript and write the absolute result back. Two at once — phone and laptop, or a double
-- submit — both read the same starting figure and the second write erased the
-- first transaction's effect, while both transactions stayed in the ledger.
-- One statement, so the read and the write cannot be separated.
create or replace function public.adjust_account_balance(
  p_account_id uuid,
  p_delta_cents bigint
)
returns bigint
language plpgsql
security invoker set search_path = public
as $$
declare
  new_balance bigint;
begin
  update public.accounts
  set current_balance_cents = current_balance_cents + p_delta_cents
  where id = p_account_id
  returning current_balance_cents into new_balance;

  if new_balance is null then
    raise exception 'account not found or not yours';
  end if;
  return new_balance;
end;
$$;
-- security invoker: RLS on `accounts` is what scopes this to the caller's own
-- rows, exactly as the direct update it replaces did. Do not make it definer.
grant execute on function public.adjust_account_balance(uuid, bigint) to authenticated;
