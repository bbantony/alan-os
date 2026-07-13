-- Alan OS — Phase 0 foundation schema.
-- Only `profiles` exists this phase; every later module's table gets its own
-- migration file in a later phase, following the same RLS-enabled-on-creation
-- rule from SPEC.md Part B2.

create extension if not exists "pgcrypto";

create type public.user_role as enum ('owner', 'workout_member', 'full_user');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  role public.user_role not null default 'owner',
  timezone text not null default 'America/Winnipeg',
  theme_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Every new Supabase auth user automatically gets a profile row. Phase 0 only
-- ever creates the owner's own account via the invite-gated signup route, so
-- the default role above is 'owner'; Phase 2's friend-invite flow will insert
-- workout_member profiles explicitly (via the service-role key) instead of
-- relying on this default.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
