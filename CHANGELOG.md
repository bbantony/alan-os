# Alan OS — Changelog

A plain-English, prompt-by-prompt record of every request made to the coding agent and
exactly what was changed in response. This is separate from `PROGRESS.md` (which tracks
phase-level checklist status) and `MANUAL.md` (which explains how to use finished
features) — this file exists so that any agent (this one, a future session, or a
different AI entirely) can open the repo cold and see the full history of *why* the
code looks the way it does, not just what it currently does.

Newest entries at the bottom. One entry per user request.

---

## 1. "Let's start Phase 2" — kick off the Workout module

**Requested:** Start Phase 2 of Alan OS. Explain exactly what would be built, suggest
high-level ideas to make it "amazing," and set up sub-agents for different roles
(frontend dev, backend dev, QA, project manager) since the owner is non-technical and
wants everything explained in plain English.

**Changes made:**
- Explored the existing codebase (Next.js App Router + Supabase, Phase 0/1 already
  shipped) and read `SPEC.md` in full to confirm Phase 2 = the Workout module (Part E5).
- Presented 5 optional "make it amazing" ideas; owner picked 3 to fold in now:
  progressive overload nudge, workout templates, and a streak freeze.
- Created `CLAUDE.md` (plain-English communication rule + locked conventions) and four
  project-scoped agents in `.claude/agents/`: `frontend-dev.md`, `backend-dev.md`,
  `qa.md`, `project-manager.md`.
- Migration `0005_workout.sql`: tables `exercises`, `workouts`, `workout_sets`, `runs`,
  `prs`, `reactions`, `comments`, `workout_templates`; crew-read/author-write RLS
  (the one place in the app where read access isn't strictly per-user); a
  `crew_profiles()` function so the feed can show everyone's name; flipped the
  friend-signup default role to `workout_member`; added `profiles.weight_unit`;
  closed a self-role-escalation gap with column-level grants; seeded 43 common
  PPL exercises; added the workout tables to the Realtime publication.
- Built `src/lib/workout/` pure helper modules: `types.ts`, `units.ts` (kg/lbs
  conversion), `pr.ts` (Epley 1RM + PR detection), `streaks.ts` (streak math, with the
  one-forgiven-miss-per-week bonus rule), `progression.ts` (overload nudge),
  `exercise-match.ts` (soft duplicate detection).
- Built the whole Workout module UI: crew feed with realtime updates, new-workout
  logging flow (exercise picker, set entry, last-session display, duplicate-last-set,
  templates), reactions, comments, streak/PR display, leaderboard, owner-only invite
  page with a copyable invite message, and a Settings → Workout page for weight-unit
  preference.
- Wired the `proxy.ts` middleware to actually block `workout_member` accounts from
  reaching any non-Workout route server-side (previously only the nav hid the links —
  a real gap, now closed).
- Wired the Today dashboard's Workout widget to show a real streak flame instead of
  the "coming soon" placeholder.
- Updated `PROGRESS.md` (checked off Phase 2 items except "onboard the 3 friends," which
  is the owner's action) and `MANUAL.md` (added a full Phase 2 usage section).
- Verified everything before calling it done: ran the actual migration against the real
  database and checked the RLS policies/grants/seed data with SQL queries, ran the
  build/lint, and hand-verified the streak/PR/progression math with test cases in a
  throwaway script.

---

## 2. "Commit and live"

**Requested:** Commit the Phase 2 work and deploy it.

**Changes made:**
- Committed everything from entry 1 and pushed to `origin/master`, which auto-deploys
  via Vercel (per the project's existing setup — no new deploy config needed).
- Watched the Vercel deployment finish and confirmed the live site
  (alan-os-nine.vercel.app) was actually serving the new code before reporting done.

---

## 3. "The feed/leaderboard is broken and looks bad" — first UI fix pass

**Requested:** Fix a real bug (the Feed/Leaderboard tabs were rendering as giant
buttons down the left side of the screen), add a way to filter the feed to
just-your-own or just-everyone-else's workouts, remove comments entirely, make
reactions hidden-until-tapped instead of always visible, allow editing templates and
exercise names after creation, and add a way to enter barbell lifts as "bar + plate
weight" instead of typing the total.

**Changes made:**
- Root-caused the broken tabs: the shadcn `Tabs` component wasn't used anywhere else in
  the app, so it had never actually been proven to render correctly here. Replaced it
  entirely with the same plain segmented-button pattern already used elsewhere, adding
  Everyone / Mine / Others / Leaderboard as four filter buttons.
- Removed comments completely: deleted the `comments.tsx` component, the `addComment`
  server action, and the comments query/join from the feed data fetch.
- Redesigned reactions (`reactions.tsx`) to be hidden by default — a small "React" text
  link reveals the emoji row on tap; existing reactions only show as compact badges
  when someone's actually reacted.
- Migration `0006_workout_barbell_and_edits.sql`: added `exercises.is_barbell`, marked
  12 of the seeded exercises as barbell lifts, and changed the exercises RLS update
  policy from creator-only to crew-wide (previously *nobody* could ever fix a typo in a
  seeded exercise, since the seed rows have no owner).
- Added `updateExercise` and `updateTemplate` server actions, and built
  `src/app/(app)/settings/workout/exercise-manager.tsx` (searchable, renameable
  exercise list) and `template-editor.tsx` (rename a template, add/remove its
  exercises) under Settings → Workout.
- Added the "Bar (45) + plate weight" entry mode to `set-row.tsx` for barbell
  exercises — the lifter types what's actually loaded on the bar, and the true total
  (still what's stored for PRs/history) is computed underneath.
- Committed and deployed (per the project's own standing "commit after every working
  feature" rule in `SPEC.md`).

---

## 4. "Past workouts look bad, I want more history, don't stack everything on one
   screen, and Load Template does nothing"

**Requested:** Feed cards should show a short summary with full detail only on tap.
When picking an exercise while logging, show the last 3-4 sessions, not just the most
recent one. Don't show every exercise's full card stacked on one long page — something
"different and more beautiful." Fix the broken template Load button.

**Changes made:**
- Replaced `getLastSessionSets` (one session) with `getExerciseHistory` (last 3-4
  sessions, most recent first) in `actions.ts`, and updated the new-workout form to use
  it.
- Redesigned the new-workout logging flow: exercises now show as tappable chips across
  the top, with only the currently-selected exercise's full panel
  (`exercise-panel.tsx`, new file) shown below — not every exercise stacked at once.
- Found and fixed the actual "Load does nothing" bug: `TemplatePicker` kept a
  `selectedId` in React state that never re-synced when the list of matching templates
  changed (e.g. after switching workout type), so it could silently point at a
  template no longer in the dropdown. Fixed by deriving the effective selection at
  render time instead of trying to keep local state manually in sync.
- Redesigned `feed-card.tsx` to a compact one-line summary ("4 exercises · 16 sets") by
  default, with a tap-to-expand chevron revealing the full per-exercise set breakdown
  and notes.
- Committed and deployed.

---

## 5. "Only workouts should load for templates, get rid of Push/Pull/Legs, better
   number entry, unit toggle, running needs a standard form, make it clean, and the
   app feels slow with no touch feedback"

**Requested:** Collapse the workout-type taxonomy to just two categories: Resistance
training and Running (drop Push/Pull/Legs/Other). Templates should only ever apply to
resistance training. Fix the clunky number-entry UI and make the on-screen keyboard
numeric-only. Add an lbs/kg toggle right on the logging screen that converts correctly
both ways. Running should have a clean standard form: distance, time, live pace, avg
heart rate, date. Make resistance training start with a clear choice between "load a
template" or "log freely." General visual cleanup, consistent with the rest of the
app's design system. Also: the whole app feels laggy on the phone with no feedback on
taps — fix that if possible.

**Changes made:**
- Migration `0007_workout_categories_and_templates.sql`: collapsed the `workout_type`
  Postgres enum from `push/pull/legs/run/other` to just `resistance/running`
  (converting existing rows automatically — `run` → `running`, everything else →
  `resistance`), and dropped `workout_templates.type` entirely since templates only
  ever apply to resistance training now.
- Updated `WORKOUT_TYPE_LABELS`, `logWorkout`/`logRun`, and every place that branched on
  the old 5-way type to use the new 2-way type.
- New-workout screen: resistance training now opens with a clear choice — pick a saved
  template (shown as cards) or "Start blank" — instead of a small inline dropdown.
- Redesigned `set-row.tsx`: bigger tap targets, clearer reps/weight steppers with
  tabular numerals, `inputMode`/`pattern` hardened so the on-screen keyboard is
  numbers-only.
- Added an lbs/kg toggle directly on the logging screen — switching it re-renders every
  entered set's displayed value instantly (the underlying stored weight never changes,
  only how it's displayed) and also saves the preference for next time.
- Running form now shows a live-computed pace ("Pace: 5:26/km") as soon as distance and
  duration are both filled in, without needing to save first. (Distance, duration, avg
  heart rate, and date were already present in the running form — see entry 6 below for
  a follow-up on this specific point.)
- App-wide perf/feel fix in `globals.css`: added `touch-action: manipulation` and
  removed the mobile tap-highlight flash. This targets the classic ~300ms delay mobile
  browsers add after a tap (waiting to see if it's the start of a double-tap-zoom
  gesture) — very likely the main cause of "every touch feels slow with no feedback."
  Added a reusable `.tap-press` class (instant scale-down on `:active`) to the custom
  buttons touched in this pass.
- Committed and deployed.

---

## 6. "Apply the smoothness app-wide, don't break anything, track every change from
   now on in a changelog file, and you forgot avg BPM on the running workout"

**Requested:** Extend the `.tap-press` tap-feedback fix from the Workout module to the
rest of the app. Don't break existing functionality or over-complicate things while
doing it. Start keeping a running log of every request and every change made — a new
file, not just `PROGRESS.md` — so a future session (this agent or another AI) can see
the complete history. Also, the running workout form is missing avg BPM.

**Changes made:**
- Swept every `.tsx` file outside `components/ui/` (which already has built-in press
  feedback) and the Workout module (already done in entry 5) for raw `<button>`
  elements, and added `.tap-press` to each one: the palette swatches in
  Settings → Appearance, the category/known-item rows in Settings → Shopping, the
  check/star/delete buttons and staple suggestion chips in Shopping, and the
  complete/subtask/delete/chip buttons in Tasks. No logic was touched — purely additive
  styling, confirmed with a before/after count of `<button>` vs `.tap-press` occurrences
  per file so nothing was missed or duplicated.
- Checked the avg-BPM report against the actual code: the "Avg heart rate (optional)"
  field has been present in the running form since it was first built in entry 1, and
  is still there — it lives under the **Running** tab specifically (the two categories
  are now separate tabs, so it won't show while "Resistance training" is selected).
  Nothing needed fixing here; flagged clearly in the response rather than silently
  assuming the report was mistaken.
- Created this file (`CHANGELOG.md`) and added a standing instruction to `CLAUDE.md` so
  every future session updates it automatically after each request, without needing to
  be asked again.
- Verified with build + lint (both clean) before committing.

---

## 7. "Equipment tags for BB/DB/KB, exercises and templates should be per-user,
   ability to delete workouts, different weight increments, and make taps feel
   more responsive"

**Requested:** Add tags for barbell/dumbbell/kettlebell (not just barbell). Each user
should have their own private list of exercise names and their own templates (not one
shared crew list). Add the ability to delete a logged workout. Change the weight
steppers to 2.5 lb / 1 kg increments. And: every tap should have some kind of subtle
animation so it's obvious something happened during the wait for a page/menu to change
— right now it just feels like nothing happened.

**Changes made:**
- Migration `0008_exercises_per_user_and_equipment.sql`: replaced the single
  `is_barbell` boolean with an `equipment_type` enum (`barbell`/`dumbbell`/
  `kettlebell`/`other`); gave every user their own private exercise list instead of
  one shared crew list (added `exercises.user_id`, made insert/update/delete
  strictly own-rows-only, kept select crew-wide so the feed can still resolve
  other members' exercise names); added a `seed_default_exercises()` function so
  every new signup gets their own starter set of 43 exercises, and backfilled
  the existing accounts. (Templates needed no change here — they were already
  private per user from the start.)
- Hit a real ordering bug applying this migration (dropped `created_by` before
  dropping the RLS policies that referenced it) — caught immediately because the
  migration failed outright rather than silently, fixed the statement order, and
  re-verified with SQL queries against the live database afterward, as usual.
- Found and fixed two data-consistency gaps from that same migration in follow-ups
  `0009` and `0010`: the retroactive equipment tagging for already-existing exercise
  rows didn't cover every exercise the new seed list tags as barbell/dumbbell (Skull
  Crusher, Preacher Curl, and 6 dumbbell exercises), so the owner's original rows
  were briefly inconsistent with freshly-seeded accounts. Verified afterward with a
  SQL query grouping by exercise name across all users to confirm zero remaining
  inconsistencies.
- Updated the exercise picker, exercise editor (Settings → Workout), and set-entry UI
  to use the new equipment tag: an "Equipment" dropdown replaces the old barbell
  checkbox, and BB/DB/KB badges show next to tagged exercise names. The barbell
  "Bar + plate weight" entry mode still only applies to `equipment: "barbell"` —
  dumbbell/kettlebell are informational tags only.
- Added workout deletion: a `deleteWorkout` server action (workout_sets/runs/prs/
  reactions already cascade-delete via their existing foreign keys, so no schema
  change was needed there) and a delete icon on your own feed cards, with a confirm
  prompt before it actually deletes.
- Changed `smallestIncrementKg()` in `units.ts` from 5 lb/2.5 kg to 2.5 lb/1 kg,
  hand-verified with a throwaway script.
- Responsiveness fix: added `src/app/(app)/loading.tsx`, which uses Next.js App
  Router's built-in navigation-loading mechanism to show a thin top progress bar the
  instant any in-app navigation starts (bottom nav taps, "New workout," saving and
  returning to the feed, etc.), and removes it the instant the destination page is
  ready — no extra dependencies or manual event wiring, just the framework's existing
  Suspense-based `loading.tsx` convention applied to the app shell. Paired with the
  `.tap-press` instant-feedback fix from the previous entry, every tap that changes
  the page now gets an immediate visible response.
- Verified with build + lint (clean) and a route smoke-test before committing.

---

## 8. "Sign-up email confirmation link goes to localhost, and let me delete
   exercises, not just rename them"

**Requested:** A friend tried to sign up and their confirmation email links to
`localhost` instead of the real site, so they can never confirm their account. Also,
Settings → Workout → Exercises only supports renaming an exercise — add real delete.

**Changes made:**
- The localhost link is a Supabase project setting (Authentication → URL
  Configuration → Site URL), not something in the app's code — it's almost certainly
  still set to the `http://localhost:3000` default from initial setup and was never
  updated for the live site. Gave plain click-by-click steps to fix it in the Supabase
  dashboard (see the response for this entry) rather than a code change, since this
  genuinely lives outside the repo.
- Hardened the code anyway so this can't quietly happen again: `src/app/signup/actions.ts`
  now explicitly passes `emailRedirectTo` to `supabase.auth.signUp()`, derived from the
  actual incoming request's host rather than hardcoded — so it's automatically correct
  whether someone signs up from localhost in development or the real deployed domain,
  with no environment-specific config to keep in sync. (Supabase's Redirect URLs
  allowlist still needs the production domain added, which is part of the same
  dashboard fix.)
- Added exercise deletion: a `deleteExercise` server action and a delete icon (with a
  confirm prompt) next to each exercise in Settings → Workout → Exercises. Deliberately
  does **not** cascade-delete workout history — `workout_sets`/`prs` reference
  exercises with no cascade, so Postgres blocks the delete with a foreign-key error if
  the exercise has ever been logged, and the action catches that specific error and
  shows "Can't delete — you've already logged workouts with this exercise" instead of
  a raw DB error. Exercises never used in a workout delete cleanly. Verified both
  paths directly against the live database (found a real used exercise and a real
  unused one, confirmed the expected success/failure for each) rather than just
  trusting the logic.
- Verified with build + lint (clean) before committing.

---

## 9. "Let's move on to the next phase" — Phase 3, built overnight without check-ins

**Requested:** Plan and build Phase 3 (Reminders & Calendar) completely — Web Push
infra, reminders with recurrence, Google Calendar OAuth, an agenda view, the
day-planner ritual — "ramped up to 10" against what SPEC.md describes. The owner then
said he was going to sleep and asked for the whole phase to be built through fully
autonomously overnight, without pausing for plan approval or further check-ins
(explicitly extended to future phases too, not just this one).

**Changes made:**
- Planned the full phase (migration schema, RPC-based architecture, UI layout) and had
  a second agent pass independently critique it before writing any code — that review
  caught several real issues fixed before implementation: a foreign-key ownership gap,
  a dispatcher race condition, DST drift in naive recurrence math, and — most
  importantly — that relying on session cookies for the push notification's Done/Snooze
  buttons would silently fail once a dormant PWA's session expired.
- **Hit a real, unplanned blocker**: `SUPABASE_SERVICE_ROLE_KEY` (the conventional way
  to bypass RLS server-side, and what the original plan assumed) turned out to be an
  empty/unfilled env var, both locally and on Vercel — never actually set up despite
  being listed in SPEC.md. Rather than stop and wait for it, re-architected the
  cross-user data access (the reminder dispatcher, crew workout-PR push) around
  `security definer` Postgres functions instead — the same pattern already proven
  working in this codebase (`crew_profiles()` from Phase 2) — gated by a secret stored
  in a locked-down table (`app_secrets`, RLS enabled with zero policies) after
  discovering Supabase's managed Postgres blocks the more obvious `ALTER DATABASE ...
  SET` approach to superuser only. Verified this whole mechanism directly against the
  live database using the real public anon key (not the privileged migration
  connection): confirmed the secrets table is genuinely unreachable directly, a wrong
  secret is rejected, and the correct one is accepted.
- Migrations `0011`–`0015`: `reminders`, `push_subscriptions`, `gcal_connections`,
  `day_plans` tables (strict per-user RLS); the security-definer RPCs for the
  dispatcher (`claim_due_reminders` with an atomic `for update skip locked` claim so
  retried/overlapping cron ticks can never double-send, `get_push_subscriptions_for_user`,
  `get_gcal_connection_for_user`, `advance_reminder`, `delete_push_subscription_admin`,
  `get_reminder_admin`) and for crew push (`crew_push_subscriptions`,
  `delete_crew_push_subscription`). Hit and fixed a real ordering bug applying `0012`
  (dropped a column before the policies referencing it) and a return-type change that
  needed a `drop function` first in `0015` — both caught immediately because the
  migration failed outright, both re-verified after fixing.
- `src/lib/reminders/rrule.ts`: recurrence presets (daily/weekdays/weekly-on-X/every-N-
  days/monthly/custom) built on the `rrule` package, with next-occurrence computation
  made DST-aware by reconstructing wall-clock time in `America/Winnipeg` rather than
  trusting the library's internal UTC math (new `zonedTimeToUtc`/`utcToZonedParts`
  helpers in `src/lib/time.ts`). Hand-verified with test cases spanning both the March
  and November 2026 DST boundaries, weekday-skipping, and every-N-days/monthly
  recurrence before trusting it.
- `src/lib/push/`: Web Push sending (`web-push` package) with self-healing dead-
  subscription cleanup, and a signed HMAC action-token scheme
  (`src/lib/reminders/action-token.ts`) so the notification's Done/Snooze buttons work
  even when the PWA's session has expired — verified for real: generated a token,
  called the actual route with valid/tampered/missing/mismatched-id tokens, and
  confirmed the reminder's status changed correctly in the database only for the
  valid case.
- `src/lib/gcal/client.ts`: Google Calendar OAuth (`googleapis` package), AES-256-GCM
  refresh-token encryption (`src/lib/crypto.ts`), agenda reads, and event creation.
  Reused the same request-host-derived redirect URI pattern that already fixed the
  signup email-confirmation bug so both localhost and production work without
  hardcoding a domain.
- `/api/cron/reminders` (the actual dispatcher, hit by an external cron-job.org pinger
  rather than native Vercel Cron — confirmed via a live web search that Vercel's free
  Hobby tier caps cron at once/day, too infrequent for reminders) plus
  `/api/reminders/[id]/complete` and `.../snooze` (the notification-action routes) and
  `/api/auth/google/start` / `.../callback` (OAuth). Tested the dispatcher for real:
  seeded a one-off and a recurring reminder both due in the past, hit the route,
  confirmed the one-off flipped to `done` and the recurring one advanced to the correct
  next day, then hit it again immediately and confirmed zero reminders were
  double-claimed.
- Full UI under `/calendar` (Agenda + Reminders tabs, replacing the old placeholder
  page) and `/settings/calendar` (Google connect/disconnect/sync toggle, push device
  list with a "send test notification" button), plus the day-planner ritual as a new
  `<DayPlannerCard>` on the Today dashboard (day-mode focus display / evening-mode
  planning form, auto-pulling overdue-then-today tasks when nothing's been planned) and
  a real "Calendar & Reminders" Today widget replacing its Phase-3 placeholder.
- Two bonus items folded in: a one-tap "Remind me" button on any task with a due date
  (which required first adding minimal due-date UI to the Tasks module, since it had
  none before this), and finally wiring the real crew push notification for workout
  PRs that Phase 2 had explicitly deferred to "once Phase 3's Web Push infra exists"
  (logged in `LATER.md` at the time).
- Added `vercel.json` with a once-daily native Vercel Cron hitting the same dispatcher
  route as a backup + to keep the Supabase project from pausing on inactivity (Hobby
  tier's one allowed cron frequency).
- Two things need the owner's own action and are clearly flagged in `PROGRESS.md` and
  walked through step-by-step in `MANUAL.md`: creating Google OAuth credentials in
  Google Cloud Console, and signing up for the free cron-job.org pinger — both require
  a browser and an account the agent has no access to. Everything else was built,
  verified against the live database and real HTTP requests (not just read over), and
  deployed without waiting for those two steps.

## 10. Phase 4 — Finance core, continuing the same autonomous overnight build

**Requested:** Continuation of the standing "build the next phase without stopping to
ask" permission from entry 9 — no new user message, this is Phase 4 (Finance core)
per `SPEC.md`.

**Changes made:**
- Migration `0016_finance_core.sql`: `accounts`, `categories` (unique per user+name),
  `transactions`, `budgets` (unique per user+category), `savings_goals`, `debts` — all
  with the same strict `auth.uid() = user_id` RLS pattern used everywhere else in this
  app (no service-role client, no new architecture needed here). `seed_default_categories()`
  seeds the 13 categories SPEC.md names, wired into `handle_new_user()` plus a backfill
  for the already-existing owner account.
- Money math kept deliberately boring and testable: `formatCents`/`dollarsToCents` for
  cents-as-integers everywhere, `balanceDeltaCents` (income/expense × account type,
  credit cards flip sign) extracted into its own file specifically so it could be unit
  tested in isolation, `currentPeriodBounds` for payday-anchored weekly/biweekly/monthly
  budgets with short-month-end clamping (a budget anchored to the 31st correctly resets
  on the 28th in February), and `projectPayoff` (avalanche/snowball debt simulation,
  monthly compounding, 600-month safety cap against a payment too small to ever finish).
  Hand-verified all of these with throwaway `tsx` scripts before trusting them — the
  debt-payoff one caught a wrong assumption in my own test (expected the higher-APR debt
  to numerically finish first under avalanche, but a smaller low-APR balance can still
  clear first off its own minimum payment alone; the real signal is total interest paid,
  which avalanche correctly minimizes).
- Full `/money` module UI: Overview (account tiles with credit-utilization bars,
  remittance summary, recent transactions), a 2-step quick-log flow (amount keypad →
  category/account/merchant with autocomplete from transaction history) reachable from
  a **Log** button (not a floating button — a global quick-capture FAB is reserved for
  Phase 7's AI capture), Budgets (safe-to-spend banner + per-category progress bars),
  Goals (progress rings, add-to-goal), Debts (avalanche/snowball payoff plan with an
  extra-payment input), Reports (spend-by-category donut chart and 6-month trend bar
  chart built per the `dataviz` skill's validated categorical palette — colors assigned
  by rank at render time and capped at 6 series with the rest folded into "Other", not
  stored per-category — plus a top-merchants list and month navigator).
- INR remittance logging with a live CAD→INR rate pulled from the free frankfurter.app
  API (falls back to manual entry if the fetch fails), logged as a regular expense
  transaction so it folds into the same reports.
- Wired the real "Money" widget into the Today dashboard (replacing its Phase-4
  placeholder) and added a Settings → Money page for category management (add/archive),
  matching the existing Shopping/Calendar settings pages' pattern.
- Verified against the live database for real: confirmed RLS is enabled with exactly
  one policy on all six new tables, confirmed the owner account actually has all 13
  seeded categories, and ran a full insert → query → rollback round trip (account +
  category + budget + transaction) confirming the period-spend calculation the Budgets
  tab depends on returns the exact right number — then confirmed the rollback left zero
  trace.
- `npm run build` and `npm run lint` both clean; fixed one real TypeScript error along
  the way (Recharts v3's `Tooltip formatter` types its `value` param as possibly
  `undefined`, needed a small guard rather than the naive `number` type I first wrote).
- No owner action needed for this phase — everything works immediately, unlike Phase 3
  which is still waiting on the two external setup steps logged there.

## 11. Phase 5 — Finance AI, with a genuine blocker surfaced instead of silently skipped

**Requested:** Asked "so what's next," which per the standing overnight-build permission
meant continuing to Phase 5 (Finance AI: receipt scanning, shopping cross-check, CSV
import). Before starting, flagged a real dependency: receipt vision and CSV
categorization both need a paid AI API key that only the owner can obtain (account +
billing). Asked two questions instead of guessing: which AI provider (owner picked
Google AI Studio/Gemini over Anthropic) and whether to build everything else while
waiting for the key (owner said yes — build the non-AI scaffolding now).

**Changes made:**
- Confirmed via a live web search that `gemini-2.0-flash` (the obvious model choice)
  was retired June 2026 — used the current `gemini-2.5-flash` instead, isolated in one
  constant (`src/lib/ai/gemini.ts`) so a future model rename is a one-line fix.
- Migration `0017_finance_ai.sql`: `receipts` table (same strict per-user RLS as every
  other table in this app), a private Supabase Storage bucket (`receipts`, first Storage
  usage in this codebase) with a per-user-folder RLS policy, and the real foreign key on
  `transactions.receipt_id` (that column existed since Phase 4 but had no FK yet since
  `receipts` didn't exist). Verified directly against the live database: RLS enabled and
  policied on the table, the bucket exists private, the FK genuinely rejects a bogus
  receipt id, and — the one genuinely new kind of check this phase needed — simulated
  Supabase's own `auth.uid()` mechanism via the `request.jwt.claims` Postgres setting
  (switching to the non-RLS-exempt `authenticated` role) to prove a real user can upload
  into their own storage folder and is blocked from writing into anyone else's.
- `src/lib/ai/gemini.ts`: the one shared AI call point SPEC.md Part F requires, forcing
  JSON-mode output, with the "retry once then fail gracefully to manual entry" rule
  built in directly — a null return is the expected/handled case everywhere, not an
  error path. `src/lib/ai/receipt-vision.ts` and `csv-categorizer.ts` build on it; both
  return `null` immediately if `GEMINI_API_KEY` isn't set, which is what makes "build
  everything except the AI calls" actually work today with zero half-built states.
- `src/lib/finance/fuzzy-match.ts` (plain string similarity, not AI — the owner's second
  answer flagged this doesn't need it) and `src/lib/finance/csv-parser.ts` (dependency-
  free CSV parser + bank-format column guessing + date normalization). Both hand-
  verified with throwaway scripts before trusting them, and both verifications caught
  real bugs: the column-guesser matched "Transaction Date" as both the date AND
  description column (fixed by claiming columns as they're matched, most-specific
  first); a debt-payoff-style false assumption in my own fuzzy-match test (raw
  unprocessed receipt text like "GV 2% MLK" correctly does NOT match "Milk" — that
  de-abbreviation is specifically the AI's job per SPEC.md, not the fuzzy matcher's).
- Full receipt flow: `receipt-scan-button.tsx` (camera/photo picker → upload → AI read
  attempt → review dialog opens either way), `receipt-review-dialog.tsx` (editable
  merchant/date/line-items/categories, save-as-one vs split-by-category), wired into
  Overview as a new "Receipts" card. Approving now returns the created transaction(s)
  and updated account balance to the client (not just revalidating server-side) so the
  Recent Transactions list and account balance update immediately — caught this gap
  myself while wiring it up, since the rest of the module already follows that
  optimistic-update pattern everywhere else.
- The Shopping ↔ Finance cross-check hook from SPEC.md Part B4: on receipt approval,
  each line item fuzzy-matches against the still-on-list shopping items; matches get
  checked off and staples get their timer advanced — plain string matching, no AI call
  spent on it.
- CSV import (`src/app/(app)/settings/money/csv-import.tsx` + `csv-actions.ts`): upload
  → column-mapping step (handles both single signed-Amount and separate Debit/Credit
  bank export formats, North American MM/DD/YYYY and ISO dates) → review table with
  duplicate detection (date+amount+merchant match against existing transactions) and
  per-row categorization (recent-merchant heuristic first, one batched AI call only for
  rows the heuristic couldn't resolve — never one AI call per row, per SPEC.md's cost
  guardrails) → bulk import.
- `.env.local.example` and `.env.local` both document the new `GEMINI_API_KEY` var;
  `MANUAL.md` walks through getting one from Google AI Studio with a billing safety net
  (a budget alert, not just "add a card"), plus how to scan a receipt and import a CSV.
- `npm run build`/lint clean; every non-AI piece verified against the live database with
  real inserts/rollback, exactly as in every prior phase.

## 12. Admin/Permissions Overhaul + App-Wide Design Polish — Part 1 (Admin & Permissions)

**Requested:** "Analyze the whole app... I am the only admin user and the others will be
all ordinary users. I want user management rights where I can manage what each user can
see and use, and also see what users can see [in] workout of other users." Plus a full
UI beautification pass across every module ("refine refine refine"), built "bottom-up,
nothing breaks, no jerry-rigging," planned in plan mode first. Two architecture questions
were asked and answered before any code was written: per-user custom module toggles
(not more fixed roles), and real owner-managed crew groups for Workout (not the existing
fully-global model, and not a bigger multi-crew-per-user system than needed).

**Changes made:**
- Audited the existing role/permission architecture (via a research pass) before
  designing anything: found `role` checks had already drifted across three independent
  places (`proxy.ts`, `nav-items.ts`, `settings/page.tsx`), and — more importantly — that
  workout's "crew-readable" RLS policies had **no group concept at all**: literally
  `auth.uid() is not null`, meaning any authenticated user (including a hypothetical
  future `full_user`) sees every workout in the whole project. This was the real thing
  needing a redesign, not a guess.
- Migration `0018_admin_permissions.sql`: a `crews` table, `profiles.crew_id` (one crew
  per user — a deliberate scope call, flagged rather than silently assumed, since a
  many-to-many membership model would have been a bigger change than what was asked
  for), `profiles.module_access` jsonb (a fully-resolved per-user access grid, not
  sparse — avoids "missing key means what?" ambiguity everywhere it's read), two new
  security-definer helpers (`is_admin()`, `same_crew()`), and 8 new owner-only
  `admin_*` RPCs (list/create/rename/delete crews, assign a user to a crew, set a
  user's module access, set a user's role) — each checks `is_admin()` internally and
  raises rather than silently no-op-ing, matching this app's existing RPC-gating
  discipline (no service-role client anywhere, same as every phase so far).
- **Caught and fixed a real regression before it ever shipped**: the first backfill
  draft assigned every *non-owner* profile to the new default crew, which would have
  made the owner's own workouts invisible to his 3 existing friends (since the owner
  wasn't a crew member and the new same-crew RLS check has no other path to see
  someone outside your crew). Caught this via the actual verification pass (a friend's
  visible-workout count dropped to 0 after the rewrite) rather than after deploying —
  fixed by putting the owner in the default crew too, while `is_admin()` separately and
  independently still grants him visibility into *any other* crew regardless.
- Verified the whole migration against the live database, not just read over: a real
  regression check (existing friend sees the exact same workout count before/after),
  a real isolation check (a second test crew's member sees only their own workout, the
  original crew is unaffected), a real admin-override check (owner sees both crews), and
  real rejection checks for every `admin_*` RPC called by a non-owner — using the same
  `SET ROLE authenticated` + `request.jwt.claims` simulation proven earlier this session
  for the Storage RLS check. Hit and fixed two bugs in the verification script itself
  along the way (a nested-transaction bug where an inner helper's rollback was wiping
  the outer transaction's own test data before a later check ran, and a false failure
  from comparing jsonb objects by naive string equality instead of per-key) — both
  caught by the checks actually running, not assumed correct.
- **A second, real finding, surfaced rather than silently touched**: discovered two
  profiles with `role = 'owner'` in the live database (the real owner's account and a
  second one, both created the same day Phase 0 shipped, before the signup default was
  changed away from `owner`). Left both untouched — deciding who should and shouldn't be
  an admin isn't this agent's call to make unilaterally on real account data — flagged
  clearly in `PROGRESS.md` and the plain-English summary instead.
- `src/lib/permissions.ts`: the one shared resolver (`resolveModuleAccess`,
  `canAccessPath`) now used by all three previously-drifting call sites —
  `proxy.ts` (redirects to `/today` instead of the old hardcoded `/workout` target,
  since Today is now universally reachable), `nav-items.ts` (bottom nav and the More
  menu now build themselves from module_access instead of a hardcoded 2-branch role
  switch), and `settings/page.tsx` (module settings links filtered the same way, plus a
  new owner-only Admin section). Hand-verified with a standalone script covering owner
  override, restricted defaults, a custom per-user override (the actual point of this
  whole feature — a `full_user` with Money on and Workout off), null/missing
  module_access defaulting safely to false rather than true, and settings sub-page
  routing.
- Since `/today` is now reachable by every account (previously `workout_member` was
  blocked from it entirely), made the Today dashboard itself module_access-aware — a
  restricted account no longer sees dashboard tiles or fetches data for modules it can't
  open, avoiding dead-end widgets that would otherwise link nowhere for them.
- New `Settings → Admin` page (`src/app/(app)/settings/admin/`): Crews (create/rename/
  delete, member counts) and Users (role badge, crew reassignment, a module-access
  toggle grid per person, and an expandable per-user workout summary — streak, recent
  PRs, last logged session — reusing the existing streak-computation helper, now able to
  query any user thanks to `is_admin()`'s RLS override) — replacing the old
  `/workout/invite` page entirely (its invite-code card moved here; the standalone page
  and its `getCrewProfiles()` helper, both now fully dead code, were deleted rather than
  left around).
- `npm run build`/lint clean (including a stale Next.js typed-route cache from the
  deleted `/workout/invite` page, cleared by removing `.next`).
- Part 2 (design system foundation: motion, shadow tokens, new Select/Switch/
  SegmentedControl/Toast primitives) and Part 3 (module-by-module polish pass) are next,
  continuing without further check-ins per the owner's explicit standing instruction.
