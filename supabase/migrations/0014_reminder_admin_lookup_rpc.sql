-- Lets the push-notification action routes (Done/Snooze, reached via a
-- signed action token instead of a session — see src/lib/reminders/action-token.ts)
-- look up a specific reminder's rrule/remind_at before deciding whether to
-- mark it done or advance it to the next occurrence.
create function public.get_reminder_admin(secret text, target_reminder uuid)
returns setof public.reminders
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.check_cron_secret(secret);
  return query select * from public.reminders where id = target_reminder;
end;
$$;

grant execute on function public.get_reminder_admin(text, uuid) to anon, authenticated;
