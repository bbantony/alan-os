-- Alan OS — move shopping categories from a fixed enum to a user-owned table,
-- so categories can be added/renamed/removed (owner request), and add a
-- learned/known-items table that powers both "remember my correction" and
-- a user-editable "add items to this category" list in Settings -> Shopping.
-- Having a real category id (rather than a bare enum) is also what lets a
-- future Finance category link onto a shopping category later (Part B4)
-- without another structural change.

create table public.shopping_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  icon text not null default 'Tag',
  sort_order int not null default 0,
  is_protected boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.shopping_categories enable row level security;

create policy "shopping_categories_all_own"
  on public.shopping_categories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.shopping_category_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.shopping_categories (id) on delete cascade,
  item_name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_name)
);

alter table public.shopping_category_items enable row level security;

create policy "shopping_category_items_all_own"
  on public.shopping_category_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create function public.seed_default_shopping_categories(target_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.shopping_categories (user_id, name, icon, sort_order, is_protected)
  values
    (target_user, 'Produce', 'Carrot', 0, false),
    (target_user, 'Dairy', 'Milk', 1, false),
    (target_user, 'Meat', 'Beef', 2, false),
    (target_user, 'Frozen', 'Snowflake', 3, false),
    (target_user, 'Pantry', 'Package', 4, false),
    (target_user, 'Household', 'Home', 5, false),
    (target_user, 'Pharmacy', 'Pill', 6, false),
    (target_user, 'Clothes', 'Shirt', 7, false),
    (target_user, 'Other', 'MoreHorizontal', 8, true);
end;
$$;

do $$
declare
  u record;
begin
  for u in select id from auth.users loop
    if not exists (select 1 from public.shopping_categories where user_id = u.id) then
      perform public.seed_default_shopping_categories(u.id);
    end if;
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  perform public.seed_default_shopping_categories(new.id);
  return new;
end;
$$;

alter table public.shopping_items add column category_id uuid references public.shopping_categories (id);

update public.shopping_items si
set category_id = sc.id
from public.shopping_categories sc
where sc.user_id = si.user_id
  and lower(sc.name) = si.category::text;

update public.shopping_items si
set category_id = sc.id
from public.shopping_categories sc
where si.category_id is null
  and sc.user_id = si.user_id
  and sc.is_protected = true;

alter table public.shopping_items alter column category_id set not null;
alter table public.shopping_items drop column category;
drop type public.shopping_category;

create index shopping_categories_user_idx on public.shopping_categories (user_id, sort_order);
create index shopping_category_items_user_idx on public.shopping_category_items (user_id, item_name);
create index shopping_items_category_idx on public.shopping_items (category_id);
