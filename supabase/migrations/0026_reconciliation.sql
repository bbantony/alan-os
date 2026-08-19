-- Alan OS — month-end reconciliation against the real bank statement.
--
-- Asked for directly: "is there a way to reconcile all expenses and account
-- details with my bank accounts at the end of every month for verification and
-- adjust the discrepancies?"
--
-- The problem it solves is drift. Every balance in this app is maintained
-- incrementally — an account starts at whatever opening balance was typed in
-- and every logged transaction nudges it. That is correct only as long as
-- *everything* gets logged, and nothing real ever does. One forgotten coffee
-- and the app is wrong by $4 forever, with no way to notice and no way to fix
-- it short of editing the balance by hand and hoping.
--
-- A reconciliation is the periodic truth check: here is what the bank says on
-- this date, here is what the app thinks, here is the gap, and here is a single
-- transaction that closes it. Keeping a record of each one matters more than it
-- looks — a run of reconciliations showing a shrinking gap is the difference
-- between "the numbers are roughly right" and "the numbers are right".

create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  -- The closing date printed on the statement.
  statement_date date not null,
  -- What the bank says the balance was on that date.
  statement_balance_cents bigint not null,
  -- What the app thought it was, computed at the moment of reconciling.
  app_balance_cents bigint not null,
  -- statement - app, BEFORE any adjustment. Kept as its own column rather than
  -- recomputed later, because the whole point of the record is what the gap was
  -- at the time; recomputing it after the adjustment would always return zero.
  difference_cents bigint not null,
  -- The correcting transaction, if one was needed. ON DELETE SET NULL: deleting
  -- that transaction later must not erase the record that a reconciliation
  -- happened, it just means the correction was undone.
  adjustment_txn_id uuid references public.transactions (id) on delete set null,
  cleared_count integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);

alter table public.reconciliations enable row level security;

create policy "reconciliations_all_own"
  on public.reconciliations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- "When did I last reconcile this account" is the only question asked of this
-- table outside the flow itself.
create index reconciliations_account_idx
  on public.reconciliations (user_id, account_id, statement_date desc);

-- Which transactions have been confirmed against a real statement.
--
-- `reconciled_at` is the flag the flow filters on (an already-confirmed
-- transaction never appears in a later month's list again), and
-- `reconciliation_id` is which statement confirmed it. Both nullable: every
-- transaction that already exists is simply unconfirmed, which is accurate.
alter table public.transactions
  add column if not exists reconciled_at timestamptz;

alter table public.transactions
  add column if not exists reconciliation_id uuid
  references public.reconciliations (id) on delete set null;

-- The reconcile screen's one hot query: this account's transactions, up to a
-- date, that haven't been confirmed yet.
create index if not exists transactions_unreconciled_idx
  on public.transactions (user_id, account_id, txn_date)
  where reconciled_at is null;
