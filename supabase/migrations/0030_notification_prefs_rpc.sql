-- Alan OS — let the dispatcher see notification preferences.
--
-- The cron dispatcher has no session at all (an external pinger hits it with no
-- cookies), so it cannot read `profiles` through RLS. Same situation, same
-- answer as migration 0012: a security-definer function that checks the cron
-- secret itself, rather than trusting the caller.
--
-- Without this, quiet hours and the per-type switches on
-- Settings → Notifications would be settings that stored a value and changed
-- nothing — which is worse than not offering them.
create function public.get_notification_prefs_for_user(secret text, target_user uuid)
returns table (preferences jsonb, timezone text)
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.check_cron_secret(secret);
  return query
    select p.preferences, p.timezone
    from public.profiles p
    where p.id = target_user;
end;
$$;

grant execute on function public.get_notification_prefs_for_user(text, uuid) to anon, authenticated;
