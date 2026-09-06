-- 0041's revoke did not do what its comment said it did.
--
-- WHAT WAS WRONG. 0041 ended with:
--
--   revoke execute on function public.prune_assistant_messages() from public;
--   revoke execute on function public.prune_assistant_conversations() from public;
--
-- and a comment claiming the result was "nothing added to this schema is
-- callable by `public`". It was not. Revoking from PUBLIC removes only the
-- privilege Postgres grants to PUBLIC by default; Supabase ALSO grants EXECUTE
-- on new functions in `public` to `anon` and `authenticated` in their own
-- right, and a revoke from PUBLIC leaves those two entries untouched. Checked
-- against the live database after 0041 applied, `pg_proc.proacl` for both
-- functions read:
--
--   postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres
--
-- 0035 did this correctly for the three seed functions by naming every role
-- (`from public, anon, authenticated`), and `seed_default_categories` shows the
-- shape a corrected ACL has: postgres and service_role only. This migration
-- brings the two assistant trigger functions to the same state.
--
-- HOW BAD IS IT, HONESTLY. Not bad at all in practice, which is exactly why it
-- has to be fixed rather than argued away. Both are trigger functions: called
-- directly with the anon key they raise "trigger functions can only be called
-- as triggers" before executing a single statement, and both are `security
-- invoker`, so even a hypothetical successful call would be checked against
-- the caller's own RLS. The reason to close it is that the invariant this
-- project keeps writing down — nothing in `public` is callable by a browser
-- unless it was deliberately granted — must be TRUE, or the next person reads
-- the comment instead of the ACL and copies the pattern into a function where
-- it matters.
--
-- WHY REVOKING CANNOT BREAK THE TRIGGERS. Postgres checks EXECUTE on a trigger
-- function when the TRIGGER IS CREATED, not each time it fires; firing does no
-- privilege check at all. 0041 created both triggers as the migration role
-- (the database owner), so inserting a message under `authenticated` keeps
-- working with no EXECUTE privilege whatsoever. If a future migration recreates
-- either trigger it must likewise run as the owner — which is how every
-- migration in this repo runs.
--
-- No table, column, policy, index or row is touched by this file.

-- Replay-safe, guarded, and SILENT WHEN THERE IS NOTHING TO DO.
--
-- Three things are checked before anything is revoked, and each one would
-- otherwise be noise or an abort on some database this file has to survive:
--
--   * the function must exist (`revoke` on a missing function is an error);
--   * the role must exist (`anon` and `authenticated` are Supabase's, and a
--     database restored onto plain Postgres has neither);
--   * the privilege must actually be held. Postgres answers a revoke that
--     removes nothing with `WARNING: no privileges could be revoked`, and
--     scripts/run-migration.mjs prints a loud "something was skipped" banner
--     on any warning. A replay of this file must not raise that alarm for
--     doing precisely what it was asked to do.
--
-- The PUBLIC test reads the ACL rather than asking `has_function_privilege`,
-- because there is no role named "public" to ask about. A NULL `proacl` is not
-- "no privileges" — it means the function still carries Postgres's default
-- privileges, which include EXECUTE for PUBLIC, so that case needs the revoke
-- as much as an explicit entry does.
do $revoke$
declare
  target text;
  grantee text;
  fn oid;
  public_holds boolean;
begin
  foreach target in array array[
    'public.prune_assistant_messages()',
    'public.prune_assistant_conversations()'
  ] loop
    fn := to_regprocedure(target);
    if fn is null then
      raise exception '0042: % does not exist - migration 0041 must be applied first', target;
    end if;

    select p.proacl is null
           or exists (
             select 1
               from aclexplode(p.proacl) a
              where a.grantee = 0
                and a.privilege_type = 'EXECUTE'
           )
      into public_holds
      from pg_proc p
     where p.oid = fn;

    -- Repeats 0041's statement on purpose, so this file alone is enough to put
    -- a fresh database into the right state.
    if public_holds then
      execute format('revoke execute on function %s from public', target);
    end if;

    foreach grantee in array array['anon', 'authenticated'] loop
      -- Cast to `name` explicitly: `grantee` is text, and leaving the
      -- resolver to pick an overload of has_function_privilege() is how a
      -- migration ends up failing on a different Postgres minor version.
      if exists (select 1 from pg_roles where rolname = grantee::name)
         and has_function_privilege(grantee::name, fn, 'execute') then
        execute format('revoke execute on function %s from %I', target, grantee);
      end if;
    end loop;
  end loop;
end;
$revoke$;

-- Verify, do not assume — the whole point of this migration is that the last
-- one asserted a result it had not checked.
--
-- `has_function_privilege` is the honest test rather than string-matching the
-- ACL: it resolves PUBLIC grants and role inheritance too, so if EXECUTE came
-- back by either route this still catches it.
do $verify$
declare
  still_granted text;
begin
  select string_agg(p.proname || ' to ' || r.rolname, ', ' order by p.proname, r.rolname)
    into still_granted
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join (
      select rolname from pg_roles where rolname in ('anon', 'authenticated')
    ) r
   where n.nspname = 'public'
     and p.proname in ('prune_assistant_messages', 'prune_assistant_conversations')
     and has_function_privilege(r.rolname, p.oid, 'execute');

  if still_granted is not null then
    raise exception '0042: EXECUTE is still held: %', still_granted;
  end if;

  -- The triggers themselves are the thing that must survive. Their absence
  -- would mean the retention caps in 0041 are not being enforced, which this
  -- file has no business causing but every business noticing.
  if (
    select count(*)
      from pg_trigger t
     where not t.tgisinternal
       and t.tgname in ('assistant_messages_prune', 'assistant_conversations_prune')
  ) <> 2 then
    raise exception '0042: both 0041 retention triggers must still exist';
  end if;
end;
$verify$;
