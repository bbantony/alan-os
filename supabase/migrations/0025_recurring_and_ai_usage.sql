-- Alan OS — recurring money, and the meter for the AI layer.
--
-- Two unrelated tables in one migration because they arrived in one request:
-- "recurring income and expenses that will automatically get debited", and
-- "I want AI to be a big part of the whole app ... my fear is the expense".
-- The second of those is answered by measuring it, which is what ai_usage is.

-- ---------------------------------------------------------------------------
-- Recurring transactions
-- ---------------------------------------------------------------------------

create type public.recurrence_frequency as enum ('weekly', 'biweekly', 'monthly', 'yearly');

-- A template that posts real rows into `transactions` on a schedule. Rent,
-- salary, a phone bill, a subscription — the things you'd otherwise re-log by
-- hand every month and eventually stop logging at all.
--
-- Deliberately NOT built on the RRULE machinery the reminders/routines side
-- uses. RRULE's MONTHLY;BYMONTHDAY=31 *skips* months that have no 31st, so
-- rent due on the 31st would silently miss February — correct by the iCalendar
-- spec and completely wrong for money. `next_date` is therefore computed by
-- src/lib/finance/recurring.ts, which clamps to the last day of a short month,
-- exactly as budgets already do for payday anchors (see finance/period.ts).
--
-- Whether a posting is income or expense is read from the category's `kind` at
-- post time rather than stored here, so it can never disagree with the
-- category it's filed under — the same rule deleteTransaction already follows
-- when it reverses a balance.
create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  name text not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency public.currency_code not null default 'CAD',
  merchant text,
  note text,
  frequency public.recurrence_frequency not null,
  -- The day the series is anchored to. For monthly/yearly its day-of-month is
  -- what every future occurrence clamps against; for weekly/biweekly its
  -- weekday and its date set the cadence.
  anchor_date date not null,
  next_date date not null,
  last_posted_date date,
  -- An end date, for a fixed-term thing like a 12-month loan payment.
  end_date date,
  -- false = show it as upcoming but don't post it without being asked. The
  -- request was for automatic, so true is the default.
  auto_post boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recurring_transactions enable row level security;

create policy "recurring_transactions_all_own"
  on public.recurring_transactions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The posting sweep asks exactly one question: what is due on or before today.
create index recurring_transactions_due_idx
  on public.recurring_transactions (next_date)
  where active = true and auto_post = true;

create index recurring_transactions_user_idx
  on public.recurring_transactions (user_id, active);

-- Which template produced a transaction. Nullable and ON DELETE SET NULL:
-- deleting a recurring template must not delete the real spending it already
-- posted (that money genuinely left the account) — the opposite call from
-- reminders in 0022, and for the opposite reason.
alter table public.transactions
  add column if not exists recurring_id uuid
  references public.recurring_transactions (id) on delete set null;

-- 'recurring' joins manual/receipt/csv/quick_capture as a transaction source,
-- so a posted rent payment is distinguishable from one typed in by hand.
alter type public.transaction_source add value if not exists 'recurring';

-- ---------------------------------------------------------------------------
-- The AI meter
-- ---------------------------------------------------------------------------

-- Every model call the app makes, one row each: which feature asked, which
-- model answered, how many tokens each way, and what it cost.
--
-- Cost is stored in MICRO-dollars (millionths of a dollar) as an integer, for
-- the same reason money is always integer cents everywhere else in this app —
-- a float would drift. Micros rather than cents because a single cheap call
-- costs a small fraction of one cent, and rounding those to cents would record
-- every one of them as zero.
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_micros bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.ai_usage enable row level security;

create policy "ai_usage_all_own"
  on public.ai_usage for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- "What have I spent this month" is the only query this table exists to answer.
create index ai_usage_user_month_idx on public.ai_usage (user_id, created_at desc);
