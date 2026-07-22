-- crew_push_subscriptions() (0012) omitted the row id, which sendPush()'s
-- self-healing onStale callback needs to delete a specific dead subscription
-- (via delete_crew_push_subscription, 0013). Add it. Postgres won't let
-- create-or-replace change a function's return row shape, so drop first
-- (this also drops its grant, re-added below).
drop function public.crew_push_subscriptions();

create function public.crew_push_subscriptions()
returns table (id uuid, user_id uuid, endpoint text, keys jsonb)
language sql security definer set search_path = public
as $$
  select id, user_id, endpoint, keys from public.push_subscriptions;
$$;

grant execute on function public.crew_push_subscriptions() to authenticated;
