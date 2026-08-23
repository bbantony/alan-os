-- Alan OS — the daily outlook on Today: what today looks like across every
-- module, plus up to three one-tap suggestions.
--
-- WHY NO NEW TABLE. `day_plans` has carried an unused `ai_briefing text` column
-- since migration 0011, and SPEC.md Part F names that exact column as where the
-- briefing belongs ("CACHED in the DB — never regenerate on page load"). It
-- already has `unique (user_id, plan_date)`, which is the anti-regeneration
-- guard this feature needs, and RLS with the plain owner policy. Adding a
-- `daily_outlooks` table would have duplicated all three.
--
-- WHY NOT THE `insights` TABLE, which is the closest existing thing (weekly
-- patterns, cached, with a stored suggested action). Its unique constraint is
-- `(user_id, period_start)`, so a daily row and a weekly row landing on the
-- same Monday would collide and one of them would silently lose. Different
-- cadence, different table.

-- The suggestions, as INTENTS rather than performed actions. Same boundary as
-- `insights.suggested_action` and deliberately the same shape:
--   [{ "label": string, "tool": string, "args": object }]
-- `tool` must name something in lib/ai/tools.ts ALL_TOOLS, so an outlook can
-- never reach past what the assistant could already do, and nothing happens
-- until Alan taps it. Alan chose "notice and suggest" — this column is where
-- that choice is enforced structurally rather than by prompt wording.
alter table public.day_plans
  add column if not exists ai_suggestions jsonb not null default '[]'::jsonb;

-- When the outlook was written. Two jobs: it distinguishes "no outlook yet
-- today" from "an outlook was attempted and there was genuinely nothing worth
-- saying" (briefing null, generated_at set), which stops a quiet day being
-- retried and recharged on every dashboard load; and it lets the panel say how
-- old the reading is.
alter table public.day_plans
  add column if not exists ai_generated_at timestamptz;

comment on column public.day_plans.ai_briefing is
  'The daily outlook: two or three sentences across money, tasks, calendar, training and shopping. Written at most once per day per person, guarded by the unique (user_id, plan_date) constraint. Null with ai_generated_at set means "we looked, there was nothing worth saying".';

comment on column public.day_plans.ai_suggestions is
  'Up to three one-tap suggestions as intents: [{label, tool, args, actedAt}]. Executed only from a tap, only through lib/ai/tools.ts, only for modules the account has. Never performed at write time. A taken suggestion is STAMPED with actedAt, never removed: the panel addresses suggestions by array position and sends that position back, so shortening the array would make a later tap run a different action than its label.';

comment on column public.day_plans.ai_generated_at is
  'When the outlook was generated. Its presence — not the briefing text — is what stops regeneration, so a day with nothing to say costs one call rather than one per page load.';

-- Kept deliberately, with an honest note about what it does and does not do.
-- `getOutlookForDate` filters on (user_id, plan_date) only, so the planner
-- cannot prove this partial predicate and will use 0011's existing unique index
-- instead — this one will NOT serve the dashboard read. It earns its (tiny)
-- keep for the other question: "which days ever had an outlook generated",
-- which is what any future backfill, cost audit or cleanup will ask.
create index if not exists day_plans_outlook_idx
  on public.day_plans (user_id, plan_date)
  where ai_generated_at is not null;
