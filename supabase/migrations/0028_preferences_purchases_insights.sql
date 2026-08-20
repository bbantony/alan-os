-- Alan OS — the foundations for interconnecting the modules.
--
-- Three unrelated-looking things in one migration because they're the
-- groundwork for one request: "innovative ways to interconnect these different
-- sections", answered with the Life Ledger, learned shopping behaviour, and a
-- Settings screen that can actually change how the app behaves.

-- ---------------------------------------------------------------------------
-- 1. Preferences
-- ---------------------------------------------------------------------------
--
-- One jsonb column rather than thirty columns, following the `theme_settings`
-- precedent from 0001. Settings in this app arrive in batches and get reshaped;
-- a column per toggle would mean a migration every time a checkbox moves.
--
-- Everything it will hold is currently a hardcoded constant somewhere:
-- STAPLE_RESURFACE_DAYS (shopping/actions.ts), MONTHLY_BUDGET_MICROS
-- (lib/ai/usage.ts), the 8/18 work-hours window and the 8pm evening-ritual
-- hour (lib/time.ts), and Monday week-start (lib/streaks.ts). None of them were
-- ever decisions Alan got to make.
--
-- Read through resolvePreferences() in src/lib/preferences.ts, never directly:
-- stored JSON is always partial (an account saves one toggle and the other
-- twenty keys are simply absent), so a resolver that fills defaults is the only
-- safe way in. Same reasoning as resolveModuleAccess and normalizeThemeSettings.
alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;

-- 0005 revoked blanket update on profiles and granted specific columns instead,
-- so `role` and `module_access` can't be self-assigned. `preferences` is
-- genuinely the account holder's own business, so it joins the granted list.
grant update (preferences) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Shopping purchase history
-- ---------------------------------------------------------------------------
--
-- THE GAP THIS FILLS. `finishTrip` overwrites a single `last_purchased_at` per
-- item and records nothing else, so the app knows *that* you last bought milk
-- but not that you buy it every nine days — which is why every staple
-- resurfaces on the same hardcoded 14-day timer whether it's milk or
-- washing-up liquid.
--
-- Receipts make it richer: `receipts.line_items` has carried a `price_cents`
-- per item since Phase 5 and nothing has ever read it. Each approved receipt is
-- a dated, priced, merchant-stamped observation. Enough of them is a personal
-- price book.
--
-- One table, three payoffs: shopping events on the Life Ledger, staple timers
-- that learn each item's real rate, and "that's dearer than you usually pay".
create table public.shopping_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The name as it was at the time. Deliberately denormalised: the shopping
  -- item may be renamed or deleted later, and that must not rewrite history.
  item_name text not null,
  -- Lowercased, punctuation-stripped, for grouping "Milk 2L" with "milk 2l".
  normalized_name text not null,
  -- Nullable and ON DELETE SET NULL for the same reason: deleting an item off
  -- your list is not a claim that you never bought it.
  shopping_item_id uuid references public.shopping_items (id) on delete set null,
  purchased_on date not null,
  -- Only receipts know the price; a hand-ticked trip doesn't.
  price_cents bigint,
  merchant text,
  source text not null check (source in ('trip', 'receipt')),
  receipt_id uuid references public.receipts (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.shopping_purchases enable row level security;

create policy "shopping_purchases_all_own"
  on public.shopping_purchases for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- "How often do I buy this" and "what does this usually cost" are both a scan
-- of one item's history, newest first.
create index shopping_purchases_item_idx
  on public.shopping_purchases (user_id, normalized_name, purchased_on desc);

-- The Life Ledger asks a different question: what happened on these dates.
create index shopping_purchases_date_idx
  on public.shopping_purchases (user_id, purchased_on desc);

-- ---------------------------------------------------------------------------
-- 3. Insights — the cached weekly pattern
-- ---------------------------------------------------------------------------
--
-- One model call a week, over a summary of the Life Ledger, looking for things
-- across modules that a person wouldn't notice about themselves. The result is
-- stored, not recomputed: SPEC.md Part F is explicit that briefings and reviews
-- are "CACHED in the DB — never regenerate on page load", and this is the same
-- rule. Unique on (user_id, period_start) is what enforces it — a second render
-- in the same week cannot produce a second call.
--
-- `suggested_action` is the "notice and suggest" boundary Alan chose. An
-- insight may carry at most one action, named from the existing tool registry
-- (src/lib/ai/tools.ts), rendered as a one-tap chip. Storing the *intent*
-- rather than performing it is the whole point: nothing in this table has any
-- effect until a human taps it.
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  body text not null,
  suggested_action jsonb,
  -- Set when the suggestion has been acted on, so the chip doesn't reappear.
  acted_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, period_start)
);

alter table public.insights enable row level security;

create policy "insights_all_own"
  on public.insights for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index insights_user_period_idx on public.insights (user_id, period_start desc);
