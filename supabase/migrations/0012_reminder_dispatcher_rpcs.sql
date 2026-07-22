-- Alan OS — Phase 3 continued: cross-user access for the reminder dispatcher
-- and crew workout-PR push, WITHOUT a service-role key.
--
-- SUPABASE_SERVICE_ROLE_KEY (the conventional way to bypass RLS server-side)
-- turned out to be an empty/unfilled env var — it was never actually set up,
-- either locally or on Vercel, despite being listed in SPEC.md Part H4. That
-- key requires a value from the Supabase dashboard, which is a manual owner
-- step (see the note left for the morning). Rather than block Phase 3 on
-- that, this migration uses the SAME security-definer-function pattern
-- already proven working in this codebase (crew_profiles() in 0005,
-- seed_default_shopping_categories() in 0004) — a function owned by a
-- privileged role bypasses RLS for its own body regardless of who calls it,
-- as long as the caller is granted EXECUTE.
--
-- The cron dispatcher route has NO user session at all (it's hit by an
-- external pinger), so its RPCs take the cron secret as an explicit
-- parameter, checked inside the function body — this is what stops anyone
-- who only has the public anon key from calling them directly via Supabase's
-- REST API and bypassing the Next.js route's own bearer-token check.
-- Attempted to store the secret as a database-level GUC
-- (`alter database ... set app.settings.cron_secret`) first — Supabase's
-- managed Postgres restricts that to superuser, which this connection isn't.
-- A locked-down table works the same way profiles/crew_profiles does: RLS
-- enabled with zero policies means ordinary clients get nothing, but a
-- security-definer function (owned by the privileged migration role) can
-- still read it directly.
create table public.app_secrets (
  key text primary key,
  value text not null
);

alter table public.app_secrets enable row level security;
-- Deliberately no policies — nothing is reachable via the normal
-- anon/authenticated API surface. Only security-definer function bodies
-- below can read this table.

create function public.check_cron_secret(secret text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if secret is null or secret <> (select value from public.app_secrets where key = 'cron_secret') then
    raise exception 'unauthorized';
  end if;
end;
$$;

-- Atomic claim: `for update skip locked` means a retried/overlapping
-- dispatcher invocation can never grab the same reminder twice.
create function public.claim_due_reminders(secret text)
returns setof public.reminders
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.check_cron_secret(secret);
  return query
    update public.reminders
    set last_fired_at = now()
    where id in (
      select id from public.reminders
      where status = 'active' and remind_at <= now()
      for update skip locked
    )
    returning *;
end;
$$;

create function public.get_push_subscriptions_for_user(secret text, target_user uuid)
returns setof public.push_subscriptions
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.check_cron_secret(secret);
  return query select * from public.push_subscriptions where user_id = target_user;
end;
$$;

create function public.get_gcal_connection_for_user(secret text, target_user uuid)
returns setof public.gcal_connections
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.check_cron_secret(secret);
  return query
    select * from public.gcal_connections where user_id = target_user and sync_enabled;
end;
$$;

create function public.advance_reminder(
  secret text,
  reminder_id uuid,
  new_remind_at timestamptz,
  new_status public.reminder_status,
  new_gcal_event_id text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.check_cron_secret(secret);
  update public.reminders
  set remind_at = coalesce(new_remind_at, remind_at),
      status = new_status,
      gcal_event_id = coalesce(new_gcal_event_id, gcal_event_id)
  where id = reminder_id;
end;
$$;

create function public.delete_push_subscription_admin(secret text, subscription_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.check_cron_secret(secret);
  delete from public.push_subscriptions where id = subscription_id;
end;
$$;

grant execute on function public.claim_due_reminders(text) to anon, authenticated;
grant execute on function public.get_push_subscriptions_for_user(text, uuid) to anon, authenticated;
grant execute on function public.get_gcal_connection_for_user(text, uuid) to anon, authenticated;
grant execute on function public.advance_reminder(text, uuid, timestamptz, public.reminder_status, text) to anon, authenticated;
grant execute on function public.delete_push_subscription_admin(text, uuid) to anon, authenticated;

-- Crew workout-PR push (LATER.md carry-over from Phase 2): called by an
-- *authenticated* crew member's own logWorkout action, no secret needed —
-- same "any authenticated user" simplification already used throughout the
-- workout module (this app only ever has the owner + invited crew).
create function public.crew_push_subscriptions()
returns table (user_id uuid, endpoint text, keys jsonb)
language sql security definer set search_path = public
as $$
  select user_id, endpoint, keys from public.push_subscriptions;
$$;

grant execute on function public.crew_push_subscriptions() to authenticated;
