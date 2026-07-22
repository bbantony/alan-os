-- Alan OS — Phase 3: Reminders & Calendar.
-- All four tables here are strictly per-user (no crew-sharing exception like
-- workout) — standard `user_id = auth.uid()` RLS on every operation.

create type public.reminder_status as enum ('active', 'paused', 'done');

-- remind_at is a MUTABLE next-fire pointer, not an immutable RRULE anchor:
-- one-off reminders (rrule null) flip status to 'done' when they fire instead
-- of advancing it; recurring ones get remind_at advanced to the next
-- occurrence by the dispatcher. last_fired_at records when it last actually
-- sent. linked_task_id has no DB-level ownership check (Postgres FKs can't
-- express "same user_id as the referencing row") — the server action that
-- sets it must verify the task belongs to the same user before insert.
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  notes text,
  remind_at timestamptz not null,
  rrule text,
  status public.reminder_status not null default 'active',
  last_fired_at timestamptz,
  mirror_to_gcal boolean not null default false,
  gcal_event_id text,
  linked_task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.reminders enable row level security;

create policy "reminders_all_own"
  on public.reminders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index matches the dispatcher's exact due-reminder query shape.
create index reminders_due_idx on public.reminders (status, remind_at) where status = 'active';
create index reminders_user_idx on public.reminders (user_id, remind_at);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  device_label text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_all_own"
  on public.push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- refresh_token_encrypted packs iv:authTag:ciphertext (see src/lib/crypto.ts)
-- since AES-GCM needs a fresh IV per encryption that must travel with it.
create table public.gcal_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  refresh_token_encrypted text not null,
  calendar_id text not null default 'primary',
  sync_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.gcal_connections enable row level security;

create policy "gcal_connections_all_own"
  on public.gcal_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ai_briefing is schema-only for Phase 3 — its generation is Phase 7 (AI
-- morning briefing cron). This phase only writes top_goals/evening_reflection.
create table public.day_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_date date not null,
  top_goals jsonb not null default '[]'::jsonb,
  ai_briefing text,
  evening_reflection text,
  created_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

alter table public.day_plans enable row level security;

create policy "day_plans_all_own"
  on public.day_plans for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
