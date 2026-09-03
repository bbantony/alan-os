-- Transfers must record their direction.
--
-- Migration 0037's `log_transfer` wrote both legs of a transfer identically
-- except for `account_id` — nothing on the row said which leg RECEIVED the
-- money. That was survivable right up until something needed to reverse a
-- leg's balance move: `deleteTransaction` and the reconcile rewind both derive
-- direction from `categories.kind`, and a transfer's holder category is an
-- expense category on BOTH legs. So deleting the incoming leg of a $100
-- transfer moved the receiving balance +$100 instead of -$100 — a $200 drift —
-- and left the other leg orphaned. QA caught it; this records the direction
-- where it belongs, on the row.
alter table public.transactions
  add column if not exists transfer_direction text;

comment on column public.transactions.transfer_direction is
  'On a transfer leg only (transfer_group_id not null): ''out'' on the leg money left, ''in'' on the leg that received it. Null on every ordinary transaction, and null on transfer legs logged before this column existed — those legs genuinely do not record which side was which and cannot be backfilled.';

-- Two rules, one constraint: a direction is only ever 'in' or 'out', and only
-- ever appears on a transfer leg. Deliberately NOT the third rule ("every
-- transfer leg has a direction") — legacy legs from before this migration
-- cannot be backfilled, because the data never recorded which side was which.
-- (Production had zero transfer rows when this shipped, so in practice every
-- leg will have one; the constraint just refuses to promise it.)
alter table public.transactions
  drop constraint if exists transactions_transfer_direction_valid,
  add constraint transactions_transfer_direction_valid check (
    (transfer_direction is null or transfer_direction in ('in', 'out'))
    and (transfer_direction is null or transfer_group_id is not null)
  ) not valid;

-- Same function as 0037 with one change: each leg now records its direction.
create or replace function public.log_transfer(
  p_from_account uuid,
  p_to_account uuid,
  p_amount_cents bigint,
  p_txn_date date,
  p_category_id uuid,
  p_note text
)
returns uuid
language plpgsql
security invoker set search_path = public
as $$
declare
  group_id uuid := gen_random_uuid();
  from_currency text;
  to_currency text;
  from_type public.account_type;
  to_type public.account_type;
begin
  if p_amount_cents <= 0 then
    raise exception 'transfer amount must be positive';
  end if;
  if p_from_account = p_to_account then
    raise exception 'cannot transfer to the same account';
  end if;

  select currency, type into from_currency, from_type
  from public.accounts where id = p_from_account;
  select currency, type into to_currency, to_type
  from public.accounts where id = p_to_account;

  -- RLS makes a foreign account invisible, so a null here means "not yours"
  -- just as much as it means "does not exist".
  if from_currency is null or to_currency is null then
    raise exception 'account not found or not yours';
  end if;
  -- Cross-currency transfers need an exchange rate and a decision about which
  -- side is authoritative. Remittance already exists for that job; refusing
  -- here is better than inventing a rate.
  if from_currency <> to_currency then
    raise exception 'both accounts must use the same currency';
  end if;

  insert into public.transactions
    (user_id, account_id, category_id, amount_cents, currency, merchant, note,
     txn_date, source, transfer_group_id, transfer_direction)
  values
    (auth.uid(), p_from_account, p_category_id, p_amount_cents, from_currency, null,
     p_note, p_txn_date, 'manual', group_id, 'out'),
    (auth.uid(), p_to_account, p_category_id, p_amount_cents, to_currency, null,
     p_note, p_txn_date, 'manual', group_id, 'in');

  -- A credit card is a DEBT: paying money onto it reduces what you owe, so the
  -- receiving side moves the opposite way to a chequing account. This mirrors
  -- balanceDeltaCents in lib/finance/balance.ts — if that rule ever changes,
  -- this changes with it.
  update public.accounts
  set current_balance_cents = current_balance_cents
    + case when from_type = 'credit_card' then p_amount_cents else -p_amount_cents end
  where id = p_from_account;

  update public.accounts
  set current_balance_cents = current_balance_cents
    + case when to_type = 'credit_card' then -p_amount_cents else p_amount_cents end
  where id = p_to_account;

  return group_id;
end;
$$;

grant execute on function public.log_transfer(uuid, uuid, bigint, date, uuid, text) to authenticated;

-- Deleting a transfer, as one statement — the mirror of log_transfer.
--
-- One database call for the same reason logging is one call: a transfer that
-- exists on only one side is worse than one that doesn't exist. Both rows go
-- and both balance moves are reversed, or nothing happens at all.
--
-- security invoker on purpose, exactly like log_transfer — RLS on
-- `transactions` and `accounts` scopes every read and write here to the
-- caller's own rows, and the explicit auth.uid() predicates are defense in
-- depth on top of that, not instead of it.
create or replace function public.delete_transfer(p_group_id uuid)
returns void
language plpgsql
security invoker set search_path = public
as $$
declare
  leg_count int;
  directed_count int;
  leg record;
begin
  select count(*), count(transfer_direction)
  into leg_count, directed_count
  from public.transactions
  where transfer_group_id = p_group_id
    and user_id = auth.uid();

  -- Zero means gone (or not yours — RLS makes those look the same); one means
  -- something already half-deleted this pair, and reversing balances from a
  -- single leg would guess at the other side. Either way, refuse loudly.
  if leg_count <> 2 then
    raise exception 'transfer_legs_incomplete: expected 2 legs, found %', leg_count;
  end if;

  -- Legacy legs (pre-0038) never recorded which side received the money, so
  -- their balance moves cannot be reversed correctly. The app turns this token
  -- into a plain sentence (src/lib/db-errors.ts).
  if directed_count <> leg_count then
    raise exception 'transfer_direction_missing: this transfer predates direction tracking';
  end if;

  -- Reverse exactly what log_transfer did to each account, using each leg's
  -- own recorded direction and its account's type. The case logic is
  -- log_transfer's with the signs flipped — if that rule ever changes, this
  -- changes with it.
  for leg in
    select t.account_id, t.amount_cents, t.transfer_direction, a.type as account_type
    from public.transactions t
    join public.accounts a on a.id = t.account_id
    where t.transfer_group_id = p_group_id
      and t.user_id = auth.uid()
  loop
    if leg.transfer_direction = 'out' then
      -- log_transfer moved the from-leg by (+amount on credit card, -amount
      -- otherwise); undo is the opposite.
      update public.accounts
      set current_balance_cents = current_balance_cents
        + case when leg.account_type = 'credit_card' then -leg.amount_cents else leg.amount_cents end
      where id = leg.account_id;
    else
      -- log_transfer moved the to-leg by (-amount on credit card, +amount
      -- otherwise); undo is the opposite.
      update public.accounts
      set current_balance_cents = current_balance_cents
        + case when leg.account_type = 'credit_card' then leg.amount_cents else -leg.amount_cents end
      where id = leg.account_id;
    end if;
  end loop;

  delete from public.transactions
  where transfer_group_id = p_group_id
    and user_id = auth.uid();
end;
$$;

grant execute on function public.delete_transfer(uuid) to authenticated;
