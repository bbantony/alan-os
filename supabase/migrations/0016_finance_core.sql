-- Alan OS — Phase 4: Finance core.
-- Everything here is strictly private per user (no crew-sharing concept at
-- all, unlike workout) — standard `user_id = auth.uid()` RLS throughout.
-- Money is always integer cents + a currency code, never floats
-- (SPEC.md Part B3, non-negotiable).

create type public.account_type as enum ('chequing', 'credit_card', 'investment', 'cash');
create type public.currency_code as enum ('CAD', 'INR');
create type public.category_kind as enum ('expense', 'income');
create type public.budget_period as enum ('weekly', 'biweekly', 'monthly');
create type public.transaction_source as enum ('manual', 'receipt', 'csv', 'quick_capture');

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  institution text not null,
  type public.account_type not null,
  currency public.currency_code not null default 'CAD',
  current_balance_cents bigint not null default 0,
  is_debt boolean not null default false,
  credit_limit_cents bigint,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.accounts enable row level security;
create policy "accounts_all_own" on public.accounts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index accounts_user_idx on public.accounts (user_id, sort_order);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  icon text not null default 'CircleDollarSign',
  color text not null default '#5B5C51',
  kind public.category_kind not null default 'expense',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.categories enable row level security;
create policy "categories_all_own" on public.categories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index categories_user_idx on public.categories (user_id, is_archived);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  category_id uuid not null references public.categories (id),
  amount_cents bigint not null,
  currency public.currency_code not null default 'CAD',
  fx_rate_to_cad numeric,
  merchant text,
  note text,
  txn_date date not null,
  source public.transaction_source not null default 'manual',
  receipt_id uuid,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;
create policy "transactions_all_own" on public.transactions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index transactions_user_date_idx on public.transactions (user_id, txn_date desc);
create index transactions_user_category_idx on public.transactions (user_id, category_id);
create index transactions_user_merchant_idx on public.transactions (user_id, merchant);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  amount_cents bigint not null,
  period public.budget_period not null default 'monthly',
  anchor_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, category_id)
);

alter table public.budgets enable row level security;
create policy "budgets_all_own" on public.budgets for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index budgets_user_idx on public.budgets (user_id, is_active);

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  target_cents bigint not null,
  saved_cents bigint not null default 0,
  deadline date,
  icon text not null default 'PiggyBank',
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.savings_goals enable row level security;
create policy "savings_goals_all_own" on public.savings_goals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index savings_goals_user_idx on public.savings_goals (user_id, is_done);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  name text not null,
  balance_cents bigint not null,
  interest_rate_pct numeric not null default 0,
  min_payment_cents bigint not null default 0,
  target_payoff_date date,
  created_at timestamptz not null default now()
);

alter table public.debts enable row level security;
create policy "debts_all_own" on public.debts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index debts_user_idx on public.debts (user_id);

-- Default categories, seeded per user (same pattern as
-- seed_default_shopping_categories in 0004 and seed_default_exercises in
-- 0008) — exact list from SPEC.md Part D.
create function public.seed_default_categories(target_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.categories (user_id, name, icon, color, kind) values
    (target_user, 'Groceries', 'ShoppingCart', '#2a78d6', 'expense'),
    (target_user, 'Takeout', 'UtensilsCrossed', '#eb6834', 'expense'),
    (target_user, 'Entertainment', 'Popcorn', '#1baf7a', 'expense'),
    (target_user, 'Rent', 'Home', '#eda100', 'expense'),
    (target_user, 'Utilities', 'Zap', '#e87ba4', 'expense'),
    (target_user, 'Transport', 'Car', '#008300', 'expense'),
    (target_user, 'Subscriptions', 'Repeat', '#4a3aa7', 'expense'),
    (target_user, 'Health/Gym', 'HeartPulse', '#e34948', 'expense'),
    (target_user, 'Remittance', 'Send', '#5B5C51', 'expense'),
    (target_user, 'Work', 'Briefcase', '#645449', 'expense'),
    (target_user, 'Vinyl/Music', 'Disc3', '#63584F', 'expense'),
    (target_user, 'Misc', 'MoreHorizontal', '#898781', 'expense'),
    (target_user, 'Income: Salary', 'Landmark', '#006300', 'income')
  on conflict (user_id, name) do nothing;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  perform public.seed_default_shopping_categories(new.id);
  perform public.seed_default_exercises(new.id);
  perform public.seed_default_categories(new.id);
  return new;
end;
$$;

-- Backfill any already-existing user who has no Finance categories yet.
do $$
declare
  u record;
begin
  for u in select id from auth.users loop
    if not exists (select 1 from public.categories where user_id = u.id) then
      perform public.seed_default_categories(u.id);
    end if;
  end loop;
end $$;
