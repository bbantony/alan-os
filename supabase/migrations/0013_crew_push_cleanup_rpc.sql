-- Lets the crew-PR-push feature (logWorkout, sending to OTHER crew members'
-- devices) self-heal a dead subscription the same way the cron dispatcher
-- does, without needing the cron secret — gated by "any authenticated user"
-- like crew_push_subscriptions() itself, matching the existing crew-trust
-- simplification used throughout the workout module.
create function public.delete_crew_push_subscription(subscription_id uuid)
returns void
language sql security definer set search_path = public
as $$
  delete from public.push_subscriptions where id = subscription_id;
$$;

grant execute on function public.delete_crew_push_subscription(uuid) to authenticated;
