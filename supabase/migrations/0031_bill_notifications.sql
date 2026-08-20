-- Alan OS — a heads-up before a repeating payment lands.
--
-- `recurring_transactions` already knows rent is due on the 1st. What it
-- couldn't do was say so beforehand: the first you'd know is the transaction
-- appearing after the fact, by which point the money has gone and
-- safe-to-spend has dropped without warning.
--
-- WHY NOT A `reminders` ROW, which is how every other notification in this app
-- is queued. Migration 0022 established an invariant: a reminder attached to
-- neither a task nor a routine is wreckage, and there's a partial index built
-- to find exactly those. A bill reminder would be attached to neither, so it
-- would either be swept up as an orphan or force a third exception into a rule
-- that's already carrying one (the journal nudge, 0024 — since removed with the
-- module). The dispatcher can read `recurring_transactions` directly instead,
-- and this column is all the state it needs.
alter table public.recurring_transactions
  add column if not exists last_notified_date date;

comment on column public.recurring_transactions.last_notified_date is
  'The occurrence (next_date) a heads-up was last sent for. Stops the cron re-sending on every tick, and lets a rescheduled bill notify again.';

-- The dispatcher's question: what is due soon, for anyone, that hasn't been
-- mentioned yet. Partial, because paused and manual rules never qualify.
create index if not exists recurring_transactions_notify_idx
  on public.recurring_transactions (next_date)
  where active = true and auto_post = true;

-- Cross-user read for the dispatcher, which has no session — same
-- security-definer-plus-cron-secret pattern as 0012 and 0030.
create function public.claim_bills_to_notify(secret text, lead_days integer)
returns setof public.recurring_transactions
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.check_cron_secret(secret);
  return query
    select *
    from public.recurring_transactions r
    where r.active = true
      and r.auto_post = true
      and r.next_date <= (current_date + lead_days)
      and r.next_date >= current_date
      and (r.last_notified_date is null or r.last_notified_date <> r.next_date);
end;
$$;

grant execute on function public.claim_bills_to_notify(text, integer) to anon, authenticated;

-- Stamping is its own function so the route never needs a privileged write.
create function public.mark_bill_notified(secret text, bill_id uuid, occurrence date)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.check_cron_secret(secret);
  update public.recurring_transactions
  set last_notified_date = occurrence
  where id = bill_id;
end;
$$;

grant execute on function public.mark_bill_notified(text, uuid, date) to anon, authenticated;
