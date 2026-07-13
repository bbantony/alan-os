-- Alan OS — Phase 1: Tasks + Shopping list.

create type public.task_horizon as enum ('now', 'today', 'this_week', 'this_month', 'someday');
create type public.task_category as enum ('personal', 'work', 'errand', 'pr_application', 'french', 'other');

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_task_id uuid references public.tasks (id) on delete cascade,
  title text not null,
  notes text,
  horizon public.task_horizon not null default 'today',
  due_at timestamptz,
  category public.task_category not null default 'personal',
  completed_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "tasks_all_own"
  on public.tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index tasks_user_horizon_idx on public.tasks (user_id, horizon, sort_order);

create type public.shopping_category as enum
  ('produce', 'dairy', 'meat', 'frozen', 'pantry', 'household', 'pharmacy', 'other');

-- `on_list` is a refinement not in SPEC.md's literal column list (which only has
-- checked/is_staple/last_purchased_at) but implements its described behavior
-- precisely: staples "resurface" as suggestions after ~14 days unpurchased,
-- which requires them to actually leave the active view after a finish-trip
-- (on_list = false) rather than just sitting there checked=false the whole
-- time. Non-staple items are deleted outright on finish-trip instead.
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category public.shopping_category not null default 'other',
  is_staple boolean not null default false,
  checked boolean not null default false,
  on_list boolean not null default true,
  last_purchased_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.shopping_items enable row level security;

create policy "shopping_items_all_own"
  on public.shopping_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index shopping_items_user_list_idx on public.shopping_items (user_id, on_list, checked);
