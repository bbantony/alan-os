-- Moving money between your own accounts.
--
-- Alan asked for one screen that logs every kind of transaction. Four of the
-- five already existed — spending, income, remittance, and the repeating ones
-- — and the missing one was a plain transfer: card payment, moving cash into
-- savings, paying yourself back.
--
-- WHY THIS NEEDS A COLUMN AND NOT JUST A CATEGORY CALLED "TRANSFER".
--
-- A transfer is two transactions, and NEITHER of them is spending. Money left
-- chequing and arrived on the credit card; nothing was consumed. If they are
-- filed under an ordinary category they inflate every budget, every monthly
-- total, every "where did it go" report and safe-to-spend — by twice the
-- amount, once on each side. Matching on a category NAMED "Transfer" would
-- work until the day it is renamed, which is exactly the fragility the audit
-- already flagged in the remittance path (`.eq("name", "Remittance")`).
--
-- So: a nullable group id, shared by the two halves. Not null means "this is
-- one leg of a transfer" — reports exclude it — and the value ties the pair
-- together so deleting one can find the other.
alter table public.transactions
  add column if not exists transfer_group_id uuid;

comment on column public.transactions.transfer_group_id is
  'Set on BOTH legs of a transfer between the user''s own accounts, to the same value. Not null means this row is not spending or income and must be excluded from budgets, reports and safe-to-spend. Null for every ordinary transaction.';

-- Every report filters `transfer_group_id is null`, and the two legs are
-- looked up together when one is deleted. Partial, because the overwhelming
-- majority of rows are null and do not need to be in it.
create index if not exists transactions_transfer_group_idx
  on public.transactions (transfer_group_id)
  where transfer_group_id is not null;

-- One statement so a transfer can never exist half-done: both legs written, or
-- neither. The two balance moves are in the same transaction as the inserts,
-- which the application-level version of this could not guarantee.
--
-- security invoker on purpose — RLS on `transactions` and `accounts` is what
-- scopes this to the caller's own rows, exactly like adjust_account_balance.
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
     txn_date, source, transfer_group_id)
  values
    (auth.uid(), p_from_account, p_category_id, p_amount_cents, from_currency, null,
     p_note, p_txn_date, 'manual', group_id),
    (auth.uid(), p_to_account, p_category_id, p_amount_cents, to_currency, null,
     p_note, p_txn_date, 'manual', group_id);

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
