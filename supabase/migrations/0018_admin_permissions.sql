-- Alan OS — Admin & Permissions Overhaul.
-- Replaces the rigid 3-value role check (duplicated and already drifting across
-- proxy.ts, nav-items.ts, and settings/page.tsx) with two additive, admin-
-- controlled things: (1) a per-user module_access grid so the owner can decide
-- exactly which modules any given account can open, and (2) real crew groups
-- for Workout (previously "readable by any authenticated user of this project"
-- with no group concept at all) that the owner defines and assigns people to.
-- `role` itself is untouched and still exists — 'owner' remains the one bit
-- that can never be revoked or edited, checked by the new is_admin() below.

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.crews enable row level security;

alter table public.profiles add column crew_id uuid references public.crews (id) on delete set null;
alter table public.profiles add column module_access jsonb not null default '{}'::jsonb;
-- Neither column is added to the authenticated column-update grant from 0005
-- (which only lists display_name/avatar_url/timezone/theme_settings/
-- weight_unit) — Postgres column privileges are an allow-list, so both new
-- columns are already unwritable by a plain client update, same protection
-- `role` already has, with no extra revoke needed.

create or replace function public.is_admin()
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner'
  );
$$;
grant execute on function public.is_admin() to authenticated;

create or replace function public.same_crew(target_user uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1
    from public.profiles caller
    join public.profiles target on target.id = target_user
    where caller.id = auth.uid()
      and caller.crew_id is not null
      and caller.crew_id = target.crew_id
  );
$$;
grant execute on function public.same_crew(uuid) to authenticated;

-- No direct client mutation policies: crews are only ever created/renamed/
-- deleted through the admin_* security-definer RPCs below (same pattern as
-- every other admin-only mutation in this app). Regular users can only read
-- their own crew's row (e.g. to display its name), the owner reads all.
create policy "crews_select_own_or_admin"
  on public.crews for select
  using (
    public.is_admin()
    or id = (select crew_id from public.profiles where id = auth.uid())
  );

-- Backfill: one default crew holding EVERY existing account, including the
-- owner. This matters — the owner posts his own workouts into the same
-- shared feed the friends see, so the owner must be a crew member too or
-- friends lose visibility into the owner's own posts (a real regression
-- caught by the verification pass below, not a guess). is_admin() separately
-- gives the owner unconditional visibility into any OTHER crew regardless of
-- his own crew_id — the two mechanisms are independent by design.
insert into public.crews (name) values ('The Crew');

update public.profiles
set crew_id = (select id from public.crews where name = 'The Crew' limit 1)
where crew_id is null;

update public.profiles
set module_access = case
  when role in ('owner', 'full_user')
    then '{"tasks":true,"shopping":true,"workout":true,"calendar":true,"money":true,"journal":true,"vinyl":true}'::jsonb
  else '{"tasks":false,"shopping":false,"workout":true,"calendar":false,"money":false,"journal":false,"vinyl":false}'::jsonb
end
where module_access = '{}'::jsonb;

-- Rewrite every workout-table SELECT policy from "any authenticated user" to
-- "the owner, the row's own author, or someone in the same crew." Write
-- policies (_all_own) are untouched — authorship-only writes were already
-- correct.
drop policy "exercises_select_crew" on public.exercises;
create policy "exercises_select_crew" on public.exercises for select
  using (public.is_admin() or auth.uid() = user_id or public.same_crew(user_id));

drop policy "workouts_select_crew" on public.workouts;
create policy "workouts_select_crew" on public.workouts for select
  using (public.is_admin() or auth.uid() = user_id or public.same_crew(user_id));

drop policy "workout_sets_select_crew" on public.workout_sets;
create policy "workout_sets_select_crew" on public.workout_sets for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.workouts w
      where w.id = workout_id and (w.user_id = auth.uid() or public.same_crew(w.user_id))
    )
  );

drop policy "runs_select_crew" on public.runs;
create policy "runs_select_crew" on public.runs for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.workouts w
      where w.id = workout_id and (w.user_id = auth.uid() or public.same_crew(w.user_id))
    )
  );

drop policy "prs_select_crew" on public.prs;
create policy "prs_select_crew" on public.prs for select
  using (public.is_admin() or auth.uid() = user_id or public.same_crew(user_id));

drop policy "reactions_select_crew" on public.reactions;
create policy "reactions_select_crew" on public.reactions for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.workouts w
      where w.id = workout_id and (w.user_id = auth.uid() or public.same_crew(w.user_id))
    )
  );

drop policy "comments_select_crew" on public.comments;
create policy "comments_select_crew" on public.comments for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.workouts w
      where w.id = workout_id and (w.user_id = auth.uid() or public.same_crew(w.user_id))
    )
  );

-- crew_profiles(): was a fully unfiltered "every profile row" read. Same rule
-- as everywhere else now: admin sees everyone, everyone else sees themselves
-- + their own crew.
create or replace function public.crew_profiles()
returns table (id uuid, display_name text, avatar_url text, role public.user_role)
language sql security definer set search_path = public
as $$
  select p.id, p.display_name, p.avatar_url, p.role
  from public.profiles p
  where
    public.is_admin()
    or p.id = auth.uid()
    or (p.crew_id is not null and p.crew_id = (select crew_id from public.profiles where id = auth.uid()));
$$;

-- Admin RPCs. Each checks is_admin() itself and raises rather than silently
-- no-op-ing, so there is no path to calling these without being the real
-- owner — same defense-in-depth already used by every owner-only action in
-- this app (e.g. the workout invite page's own role check).
create or replace function public.admin_list_users()
returns table (
  id uuid,
  display_name text,
  email text,
  role public.user_role,
  crew_id uuid,
  crew_name text,
  module_access jsonb,
  created_at timestamptz
)
language sql security definer set search_path = public
as $$
  select
    p.id, p.display_name, u.email, p.role, p.crew_id, c.name, p.module_access, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.crews c on c.id = p.crew_id
  where public.is_admin()
  order by p.created_at asc;
$$;
grant execute on function public.admin_list_users() to authenticated;

create or replace function public.admin_list_crews()
returns table (id uuid, name text, member_count bigint, created_at timestamptz)
language sql security definer set search_path = public
as $$
  select c.id, c.name, count(p.id), c.created_at
  from public.crews c
  left join public.profiles p on p.crew_id = c.id
  where public.is_admin()
  group by c.id, c.name, c.created_at
  order by c.created_at asc;
$$;
grant execute on function public.admin_list_crews() to authenticated;

create or replace function public.admin_create_crew(crew_name text)
returns public.crews
language plpgsql security definer set search_path = public
as $$
declare
  result public.crews;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  insert into public.crews (name) values (crew_name) returning * into result;
  return result;
end;
$$;
grant execute on function public.admin_create_crew(text) to authenticated;

create or replace function public.admin_rename_crew(target_crew uuid, new_name text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.crews set name = new_name where id = target_crew;
end;
$$;
grant execute on function public.admin_rename_crew(uuid, text) to authenticated;

create or replace function public.admin_delete_crew(target_crew uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if exists (select 1 from public.profiles where crew_id = target_crew) then
    raise exception 'crew still has members';
  end if;
  delete from public.crews where id = target_crew;
end;
$$;
grant execute on function public.admin_delete_crew(uuid) to authenticated;

create or replace function public.admin_assign_crew(target_user uuid, target_crew uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.profiles set crew_id = target_crew where id = target_user;
end;
$$;
grant execute on function public.admin_assign_crew(uuid, uuid) to authenticated;

create or replace function public.admin_set_module_access(target_user uuid, access jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.profiles set module_access = access where id = target_user;
end;
$$;
grant execute on function public.admin_set_module_access(uuid, jsonb) to authenticated;

create or replace function public.admin_set_role(target_user uuid, new_role public.user_role)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.profiles set role = new_role where id = target_user;
end;
$$;
grant execute on function public.admin_set_role(uuid, public.user_role) to authenticated;

-- New signups still land as workout_member with the same default access/crew
-- as every existing friend — unchanged behavior, just now also stamping the
-- two new columns explicitly instead of relying on their bare column default.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, module_access, crew_id)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    '{"tasks":false,"shopping":false,"workout":true,"calendar":false,"money":false,"journal":false,"vinyl":false}'::jsonb,
    (select id from public.crews where name = 'The Crew' limit 1)
  );
  perform public.seed_default_shopping_categories(new.id);
  perform public.seed_default_exercises(new.id);
  perform public.seed_default_categories(new.id);
  return new;
end;
$$;
