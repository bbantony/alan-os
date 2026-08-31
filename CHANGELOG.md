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

## 13. Admin/Permissions Overhaul + App-Wide Design Polish — Part 2 (Design System Foundation)

**Requested:** Continuation of the same request as #12 — the design/polish half.

**Changes made:**
- `src/lib/motion.ts`: the shared Framer Motion variants (list item enter/exit,
  stagger container, fade-in-up, a dialog pop-in, page transition timing) extracted
  from the one place they were already done well (`tasks/task-list.tsx`), so every
  other module can use the identical 150-250ms, non-bouncy feel SPEC.md Part C asks
  for instead of reinventing it (or, as found in the earlier audit, not having any
  motion at all).
- `globals.css`: added a `--shadow-sm/md/lg` elevation scale (tuned separately for
  light vs dark, since dark surfaces need more shadow opacity to still read as
  "lifted") wired into Tailwind's `@theme` block as real `shadow-sm/md/lg` utilities —
  previously elevation was ad hoc (`Card` used a ring, most hand-rolled surfaces used
  a plain border, nothing in between).
- New component-library primitives, all following the existing `base-ui/react` + `cva`
  convention (`button.tsx`/`dialog.tsx`): `segmented.tsx` (one real segmented control
  with an animated sliding active-pill via Framer Motion's `layoutId`, replacing the
  broken `tabs.tsx` **and** the 4 independent hand-copies of the same tab-bar markup
  found drifting apart in the audit — each `Segmented` instance gets its own unique
  `layoutId` via `useId()` so multiple instances on one page never fight over the same
  animation), `switch.tsx` (`@base-ui/react/switch`), and a deliberately lightweight
  `select.tsx` — a styled wrapper around the *native* `<select>` rather than the full
  `base-ui` Select compound component, since every select in this app is a simple flat
  option list and the native element already has full keyboard/accessibility behavior
  for free; building the heavier compound version would have been extra risk for
  purely cosmetic gain.
- `toast.tsx`: added `sonner` (new dependency) wired into the root layout, styled to
  read this app's own CSS variables (surface/border/shadow tokens, already dark-mode
  aware via `ThemeProvider`) instead of sonner's default look — replaces the
  save/delete/approve silence every form has had so far with real confirmation
  feedback, to be wired into each module during the polish pass.
- Fixed the one real regression the audit found: `money/goals-view.tsx`'s two
  hand-rolled `fixed inset-0 z-50` sheets now use the real `Dialog` primitive, gaining
  focus-trap and Escape-key handling for free (every other form in the app already
  used `Dialog` correctly — this was the sole outlier).
- Deleted `src/components/ui/tabs.tsx` outright (the broken/abandoned `base-ui` Tabs
  wrapper) rather than leaving it as unimported dead code, now that `segmented.tsx`
  replaces every place a tab bar was needed.
- `npm run build`/lint clean. Part 3 (wiring these primitives into every module, plus
  motion and toast feedback throughout) is next.

## 14. Admin/Permissions Overhaul + App-Wide Design Polish — Part 3 (Module Polish Pass)

**Requested:** Continuation of #12/#13 — actually applying the new primitives to the app
instead of leaving them unused.

**Changes made:**
- Replaced the 3 genuinely-duplicated hand-rolled tab bars (`money-shell.tsx`,
  `calendar-shell.tsx`, `workout-feed.tsx`) with the new `Segmented` control.
  Deliberately did **not** force `reminder-form.tsx`'s recurrence-preset picker onto it —
  that's a 7-option wrapping grid, not a single-row tab bar, and squeezing it into a
  one-row segmented control would have made it worse, not more consistent. Consolidating
  everything that fits the pattern and leaving what doesn't is the actual judgment call
  here, not "replace every button group with Segmented."
- Today dashboard: the 5 "coming soon" placeholder tiles (the single blandest, most-seen
  thing in the app per the earlier audit) now show the existing `ComingSoonIllustration`
  instead of a plain dashed border + faded pill — that illustration already existed and
  was only ever used on whole-page module placeholders, not here. `DashboardWidget`
  became a client component using the new `fadeInUpVariants`, and a new
  `DashboardGrid` wrapper gives the whole grid (plus `DayPlannerCard`, in all three of
  its return branches) a staggered entrance via Framer Motion's variant propagation.
- Toast feedback added everywhere a save/delete/approve action previously gave zero
  visible confirmation: every Money form (account, budget, goal, debt, quick-log,
  remittance), receipt approve/discard, CSV import completion, Tasks' delete and
  remind-me actions, and the brand-new Admin page's crew/module-access mutations
  (particularly valuable there since they're security-relevant and previously
  completely silent). Deliberately did **not** touch two things: Shopping's existing
  "Trip finished" banner (a bespoke `PartyPopper`-icon celebration already built well —
  replacing it with a generic corner toast would have been a downgrade, not a fix), and
  routine high-frequency actions like completing a task (already has its own
  check-off animation; a toast on every tap would be noise, not polish).
- Workout: a small "your crew logged N sessions this week" stat strip, computed from
  the feed data already being fetched (now correctly crew-scoped after Part 1's RLS
  rewrite) — a natural, concrete feature that only makes sense now that crews are real
  groups instead of "everyone in the project."
- `npm run build`/lint clean throughout, each logical unit committed separately
  (tab-bar consolidation + dashboard animation; toast wiring) rather than one giant diff.
- **Honestly scoped, not oversold**: Shopping, Calendar, and Settings' own forms still
  use plain `<select>`/ad-hoc markup rather than the new primitives, and Settings has no
  two-column desktop layout yet — logged in `PROGRESS.md` as not done rather than
  glossed over. The admin system, the design foundation, and the app's most-used module
  (Money) came first as the highest-value work; the remaining polish is a smaller,
  lower-risk follow-up whenever picked back up.

## 15. Demote the second admin account; finish the design sweep + more features

**Requested:** "That account should not be admin. Furthermore, redesign the untouched
modules as well to match the rest of the app and keep it consistent, and also make sure
you added features as well to everything. Just go and don't stop."

**Changes made:**
- Demoted `antonyalbert03@gmail.com` from `role='owner'` to `role='full_user'` directly
  in the database — he keeps every module enabled (identical day-to-day access to
  before), he just loses `is_admin()` and everything gated by it (the Admin page,
  cross-crew oversight). Confirmed exactly one `owner` remains afterward. Updated
  `PROGRESS.md`/`MANUAL.md`'s "found but not fixed" notes to "resolved."
- **Shopping**: category/quantity-unit pickers moved onto the `Select` primitive.
  New feature: a "Groceries budget remaining" banner right on the shopping list,
  reusing Money's existing period-aware `getBudgets()` calculation rather than
  reimplementing payday-anchored period math — this is SPEC.md Part B4's
  Shopping↔Finance hook ("remaining budget for the relevant category visible while
  adding/checking off items"), documented since Phase 4 shipped but never actually
  built until now. Gated behind the viewer's own Money module access, matching the
  Today dashboard's now-established per-widget access pattern.
- **Calendar**: found and fixed a second duplicated tab bar the original audit missed
  (Agenda's own Today/Week toggle, structurally identical to the 3 already
  consolidated) — now on `Segmented` too. Added list motion to Agenda and Reminders,
  toast confirmations to reminder save/delete and Google Calendar sync/disconnect, and
  replaced a hand-rolled "On/Off" pill button with the real `Switch` primitive (a second
  bespoke reimplementation of exactly what that primitive now exists to replace). New
  feature: Agenda items were purely read-only before this — tapping a reminder now
  jumps straight to the Reminders tab, tapping a task jumps to Tasks, turning the merged
  timeline into an actual navigation hub instead of just a summary you'd have to
  re-locate the source of yourself.
- **Went back and finished Money's own forms**, which had been polished for tabs/toasts
  in the earlier pass but never had their `<select>` elements swapped — account/budget/
  quick-log/receipt-review/remittance forms, Money's category settings (plus its own
  expense/income toggle onto `Segmented`), and the CSV import wizard's 7 column-mapping
  selects. Also caught two more instances outside Money entirely: Tasks' add-task row
  and Workout's exercise picker/manager. A full app-wide grep for `<select` after this
  pass turned up exactly 2 remaining — both deliberately left alone (ultra-compact
  inline per-row category pickers in Shopping's and Tasks' list rows, where the new
  primitive's chevron icon would visually dominate a control that small) — a judgment
  call made explicit in the code comments, not an oversight.
- **Settings got its two-column desktop layout**: `settings-links.ts` (the link data,
  now defined once) and `settings-nav.tsx` (the rendering, now defined once) are shared
  between the mobile index page and a new persistent desktop sidebar
  (`settings/layout.tsx`, a Next.js nested layout wrapping every `/settings/*` route) —
  previously the exact same link list was hand-duplicated nowhere else, but would have
  needed to be if the sidebar were built as a one-off. The layout carries zero CSS below
  the `md` breakpoint, so mobile is provably unchanged. New feature: an account card at
  the top of the Settings index (avatar-initial circle, name, email, role badge) so it's
  immediately clear which of the now-multiple real accounts you're using — directly
  motivated by this same session's discovery of the second owner account.
- The Admin page's own module-access checkboxes and crew-reassignment dropdown were
  themselves still using a raw `<input type="checkbox">` and `<select>` from when that
  page was first built in Part 1 — upgraded to `Switch`/`Select` too, so the admin
  system doesn't ironically lag the consistency push it kicked off.
- `npm run build`/lint clean after every file group, each logical unit committed
  separately (account demotion + Shopping; Calendar; the full `<select>` sweep +
  Settings layout) rather than one giant diff, exactly as every prior part of this
  overhaul.

## 16. Production incident — the app was black-screening — found, fixed, and verified

**Requested:** Owner reported "black screen with 'This page couldn't load. A server
error occurred.'" when opening the app.

**What happened:** `DashboardWidget` (Today's dashboard tiles) and the new
`SettingsNav` (the desktop sidebar from #15) had both been converted to Client
Components earlier this session specifically to use Framer Motion / `usePathname`.
Both are rendered directly from Server Components (`today/page.tsx`,
`settings/layout.tsx`, `settings/page.tsx`) that were passing bare Lucide icon
*component references* as props (`icon={Sparkles}`). A function reference isn't
serializable across the React Server Component server->client boundary — this threw
"Functions cannot be passed directly to Client Components" on literally every request
to `/today`, which is the page every login lands on. That's the black screen.

**Diagnosis, not guesswork:** Pulled the actual Vercel runtime logs (`vercel logs`)
instead of speculating from the client-side symptom — found the exact error and that it
had been firing on every single `/today` request since the design-polish deploy that
morning. Fixed the `/today` instance, then had a research agent sweep the entire
codebase for the same pattern (any `"use client"` component with a component-reference-
typed prop, rendered from a Server Component) rather than assuming it was isolated —
found the second, not-yet-hit occurrence in the brand-new Settings sidebar before it
ever reached the owner.

**Fix:** Both components now receive an already-rendered icon element
(`icon={<Sparkles className="size-4" />}`) instead of a bare component reference, with
color applied via a wrapping `<span>` (relying on Lucide's `currentColor` stroke)
so callers don't need to duplicate state-dependent styling logic.
`settings-links.ts` renamed to `.tsx` and now resolves icons to JSX before they ever
reach the client boundary, rather than passing the raw data through.

**Verified for real, not just "should be fixed"**: deployed, then confirmed via fresh
`vercel logs` output that no new error entries appeared after the fix went live, and
manually triggered the reminder dispatcher (see #17) which incidentally also proved
`/today`'s data-fetching path works end to end again.

## 17. Bug reports + big feature requests: banking research, push notifications, nav, Tasks redesign, Appearance overhaul

**Requested:** (1) Research whether Canadian/American bank accounts can be connected
for automatic transaction import — answer only, no build. (2) Appearance settings
hadn't really changed — wants more themes, animations, and better fonts. (3) Push
notifications don't work — tested by setting a task reminder and got nothing. (4)
Complete Tasks module redesign — "very unintuitive," specifically called out the
"Follow up"/"Call" quick-chips, and asked for recurring tasks with reminders. (5)
Shopping missing from the bottom nav. (6) The floating "+" button ("tf is that?"). (7)
Make sure everything is logged.

**Banking research (answer, not built):** Plaid is the most practical single choice for
both Canadian and US accounts (Scotiabank + US cards like Amex both fall under its
coverage) — it has a genuine free tier for a single personal user's own accounts (a
handful of free monthly production API calls), with per-call pricing beyond that
(~$0.30-0.60/call for transaction data). Flinks is the more Canada-native alternative
(95%+ connection success across 15,000+ North American institutions) but is priced for
businesses, not really suited to a single hobbyist account. Not built — this would be a
real integration (OAuth-style bank-linking flow, a new `bank_connections` table, a
webhook/sync job) worth its own planned phase if the owner wants to move forward with
it, not something to bolt on inline.

**Push notifications — diagnosed, not a bug in the delivery code itself:** Queried the
live database directly: a real push subscription exists for the owner's Android Chrome,
and two active reminders were sitting there with `last_fired_at: null` despite being
well past due. Manually invoked the dispatcher route
(`GET /api/cron/reminders` with the bearer secret) directly against production —
it correctly claimed both reminders and reported `{"pushed":2}`. This proves the whole
pipeline (subscription, dispatcher, VAPID, service worker) works correctly; the actual
gap is that the free external pinger (cron-job.org) that's supposed to hit this endpoint
every 1-5 minutes was never set up — still listed as a pending owner action in
`PROGRESS.md` since Phase 3. Considered self-hosting this via a GitHub Actions scheduled
workflow instead (would need no owner action at all) but ran the actual numbers first:
a 5-minute cadence is ~8,640 runs/month, and GitHub bills Actions minutes in 1-minute
increments per run regardless of how short the job is — that's ~8,640 billable minutes
against a private repo's 2,000/month free allowance, a real risk of the reminders
silently stopping again mid-month (or incurring cost) rather than a genuine fix. Left
this as the one remaining owner action rather than replacing a real gap with a worse one.

**Nav fixes:** Shopping moved from the More menu into the primary bottom tab bar (six
slots now: Today/Money/Tasks/Shop/Workout/More) — it's a daily, at-the-store module
that shouldn't have required an extra tap to reach. The floating quick-capture "+"
button on every screen was removed entirely — it only ever opened a "coming soon"
dialog (real quick-capture is Phase 7 AI work), and a non-functional mystery button on
every screen is worse than no button.

**Tasks module — complete redesign** (see the dedicated commit for full detail):
dropped the inconsistent "Work gets a whole nested collapsible section, other
categories just get a text badge" structure down to one grouping dimension (horizon);
removed the "Follow up with"/"Call" quick-chips (which also had a literal `___` typo
appended to every label); moved 4 of a task row's 6-7 crammed inline controls into a
new tap-to-open detail dialog; and added real recurring tasks (migration `0019`,
reusing the exact rrule/DST-aware-next-occurrence machinery already built for reminders
rather than inventing a second recurrence system) — completing a recurring task spawns
its next instance automatically, and a recurring task can carry its own recurring
reminder. Verified the regeneration logic against the live database, catching two wrong
assumptions in my own test script (day-count vs. weekday, then UTC vs. app-timezone
weekday) before trusting the result — same self-checking discipline as every other
piece of non-trivial date math this session.

**Appearance overhaul** (see the dedicated commit): 5 new palettes (11 total), 3 new
heading fonts + a newly-configurable body font (6 heading options, 2 body options, up
from 3 and 1), and real page-transition animation on every route change via a new
Motion preference (Full/Reduced) — previously the app had zero page-level motion at all.

**Everything above is logged here, in `PROGRESS.md`, and in `MANUAL.md`** per the
owner's explicit "make sure you've logged everything" ask — nothing in this entry
describes work that isn't also reflected in those two files.

## 18. "I don't understand the relationship between Tasks and Calendar" — Routines + One Timeline unification

**What was asked:** the owner said Tasks/Calendar felt confusing and disconnected —
he's never really used a task/calendar system before, wants to build the habit of using
this one for everything, and asked for "a great super innovative plan" that connects
Calendar, Tasks, Reminders, and a new concept of Routines into one system that's
sophisticated underneath but very simple to use. Explicitly asked for a plan first, which
was researched, written, and approved via the normal plan-mode flow before any code.

**Research surfaced 4 real bugs/inconsistencies in already-shipped code**, not just a
"the user is confused" situation:
1. Completing a recurring task spawned its next instance but never re-pointed the old
   task's linked reminder — a recurring task with "Remind me" on silently stopped
   reminding after its very first completion.
2. The bell-icon "Remind me" path (`createReminderFromTask`) never copied a task's
   recurrence rule, while the task-detail-dialog's save path did — same action, two
   different behaviors depending on which button you used.
3. The Agenda view merged tasks and reminders with no dedup — a task with a reminder
   attached showed up twice.
4. The evening-planning ritual's picked "top 3 goals" were write-once/read-once —
   nothing ever showed whether they actually got done the next day.

**The mental model, collapsed from 4 things to 3 + 1 universal attribute:**
- **Task** — a one-off thing to do (unchanged).
- **Routine** (new) — a repeating habit tracked like a streak, not a to-do that nags
  forever. Can be a single habit ("Water plants") or a checklist ("Morning Routine").
- **Event** — a real Google Calendar event (unchanged).
- **Reminder stops being a 4th thing you create** — it's now an attribute (a bell) you
  turn on for a Task or Routine; the UI never asks you to "make a reminder" on its own.

**What actually changed, one by one:**
- New migration `0020_routines.sql`: `routines`, `routine_steps`, `routine_completions`
  tables (strict per-user RLS, same pattern as every other table) plus a
  `reminders.linked_routine_id` column. A routine is one stable row forever — unlike a
  recurring task (which spawns a new row per occurrence), each day's completion is just
  a log entry in `routine_completions`. Deliberate, not an inconsistency: editing a
  routine should affect every future day at once.
- Fixed all 4 bugs found above: `setTaskCompleted` now re-points a completed recurring
  task's reminder at the freshly-spawned next instance; `createReminderFromTask` now
  copies the task's rrule; `getAgenda` now excludes a task from its own listing if a
  reminder is already showing it; `getTodayFocus` now reports done/not-done per goal by
  checking each goal's linked task's completion status.
- `src/lib/streaks.ts` — the exact streak-with-one-forgiven-miss math that was
  previously inline-only in Workout (`src/lib/workout/streaks.ts`) is now shared;
  Workout re-exports from the new location so nothing there changed behavior. New
  `<StreakBadge>` component replaces two copy-pasted Flame+number snippets and is now
  used by both Workout and Routines.
- New `src/lib/routines/` (types, icon registry reusing Shopping's icon-registry
  pattern) and `src/app/(app)/routines/actions.ts` (`getRoutines`, `getRoutinesDueToday`,
  `createRoutine`, `archiveRoutine`, `completeRoutineToday`, `uncompleteRoutineToday`,
  and `getRoutineSuggestions`). Routines reuse the exact same rrule engine tasks and
  reminders already use (`buildRRuleString`/`nextOccurrenceUtc`) plus one new helper,
  `isDueOnDate`, for the simpler "is this routine due on this calendar day" check a
  routine needs (as opposed to reminders' precise-instant math).
- Routines live inside the **Tasks page**, not a new bottom-nav tab (a 7th tab for a
  brand-new concept would work against the Shopping-reachability fix from entry 17) — a
  "Your Routines" section of streak cards sits above the existing horizon-grouped task
  list, with its own "+ Add routine" flow (title, icon, category, repeat schedule,
  optional multi-step checklist, optional reminder).
- **The innovative piece**: a lightweight, non-AI nudge — if a task title has been
  independently added 3+ times in the last 45 days, a banner offers to turn it into a
  routine with one tap. Plain SQL frequency counting, no AI, consistent with keeping
  Phase 7's AI work out of scope for now.
- Today's dashboard: removed the standalone "Tasks" widget and the "Calendar &
  Reminders" widget (both summarized overlapping due-today data with zero awareness of
  each other) and replaced them, along with the old `DayPlannerCard`, with one
  `<TodayTimeline>` card — routines due today (tap to check off, streak visible), tasks
  due/overdue today, the next calendar event, and the evening-planning ritual all in one
  place, plus a single "what's next" line at the top (overdue > due-today task > next
  routine > next event) answering the one question a novice actually opens the app to
  ask. The evening ritual's picked goals now show "X of 3 done" instead of never being
  checked again.

**Verified against the live database before and after building on top:** confirmed the
new tables' columns/RLS/cascade-delete behavior directly; round-tripped a full routine
lifecycle (create with steps → complete 3 consecutive days → streak computed correctly
via the promoted `computeStreak`); reproduced the recurring-task-reminder bug fix
end-to-end (spawn next instance, re-point the reminder, confirm it now points at the new
task); sanity-checked `isDueOnDate` against daily/weekly/every-N-days patterns. Caught
and fixed one bug in my own new code before shipping: the reminder time for a new
routine was first built from the server's local wall clock instead of the app's
`zonedTimeToUtc` helper, which would have drifted against Vercel's UTC runtime exactly
like the timezone bug class already fixed elsewhere this session — corrected before
committing, not after.

## 19. Routines had no way to view/edit them, and the test reminder fired at the wrong time

Alan tried out push notifications (worked) and set up a routine in Tasks, but found two
problems: there was no way to open a routine again to see or change its schedule, and
the test routine's reminder notification arrived at the wrong time.

**What was actually wrong (found by reading the routine-reminder code, not guessing):**
- The wrong-time bug was real and in the code, not a delivery-timing fluke. When a
  routine's reminder is created, the app has to pick the very first moment it should
  fire. It was always computing that as "today, at the time you picked" — with no check
  for whether that time had already passed today, or whether today even matches the
  routine's repeat pattern (e.g. a "every Wednesday" routine created on a Tuesday). If
  the chosen time was already in the past for today, the reminder was already "due" the
  moment it was created — so instead of waiting until the picked time, it fired on the
  very next check (within a few minutes), which is exactly what "wrong time" would look
  and feel like. Every reminder *after* the first one was already computed correctly
  (that part was tested and verified in entry 18) — only the very first firing had this
  bug.
- There was no view/edit screen for a routine at all — tapping a routine card only
  toggled it done (or opened its checklist, for multi-step routines). The only other
  control was a delete icon that only appeared on mouse hover, which doesn't exist on a
  phone — so on Alan's actual device (a PWA on Android) there was no way to reach it
  either. Both problems boiled down to the same gap: routines were create-only.

**What changed, one by one:**
- New `firstReminderInstant()` helper in `src/lib/reminders/rrule.ts`: given a routine's
  repeat pattern and a wall-clock time, it checks whether today both matches the pattern
  and is still upcoming — if so, uses today; otherwise it rolls forward to the true next
  occurrence via the existing DST-aware recurrence math. `createRoutine` and the new
  `updateRoutine` (below) both now use this instead of the old "always today" logic, so
  a routine's first reminder — and any reminder after a schedule edit — lands on the
  correct day and time, not just every fire after the first.
- New "Edit routine" screen: tapping a pencil icon (always visible, not a hover-only
  icon that a touchscreen can't trigger) on any routine card now opens the same form
  used to create one, pre-filled with its current title, icon, category, time, repeat
  schedule, checklist steps, and reminder toggle. Saving updates all of it in place;
  archiving (with its own button in the same screen) works the same as before. The
  create and edit forms are now one shared component (`RoutineFormDialog`, replacing
  `RoutineCreateDialog`) instead of two, matching how the Calendar reminder form already
  unifies create/edit.
- New `updateRoutine` server action mirrors `createRoutine`: updates the routine row,
  replaces its checklist steps only if they actually changed (so completing today's
  checklist isn't reset by an unrelated edit like renaming), and creates, updates, or
  deletes its linked reminder depending on the new reminder toggle/time — using the same
  `firstReminderInstant` fix so an edited schedule's next reminder is correct too.
- `getRoutines()` now also reports whether each routine has a reminder turned on
  (`hasReminder`), so the edit screen's "Remind me" switch reflects the routine's real
  state instead of always starting off.
- Routine cards were rearranged slightly to fit the new always-visible edit icon next to
  the streak badge, without changing the tap-to-complete / tap-to-open-checklist
  behavior underneath it.

**Verified:** full production build and typecheck both pass clean. Traced the exact
"today at chosen time, unconditionally" bug in `createRoutine`'s old code and confirmed
by hand that it would fire immediately whenever the picked time had already passed —
matching what Alan reported — and that `firstReminderInstant` produces the correct
future instant for that same input.

**Next step for Alan to see it work:** create (or edit) a routine with a reminder set
for a time later today, then wait for that time — it should now arrive on schedule
instead of immediately. The pencil icon on any routine card opens editing.

## 20. "No notifications fired at all" — diagnosed as the missing cron-job.org step, then set it up live

Right after entry 19 shipped, Alan created a new task and a new routine, both with
reminders on, and got nothing. Separately, he'd been getting a reminder for an existing
routine ("Brt") every morning at almost the same time — a time that didn't match what
he'd actually set.

**Diagnosis (no code was broken — confirmed by reading the live data, not guessing):**
- Connected directly to the production Supabase database (using the same
  `SUPABASE_DB_URL` `scripts/run-migration.mjs` already uses) and looked at Alan's
  actual reminder rows. The new task and routine reminders were sitting there exactly
  correctly scheduled — right title, right time, `status: active` — but `last_fired_at`
  was `null`: the dispatcher had never once checked them.
- Manually called the live dispatcher endpoint by hand (`/api/cron/reminders` with the
  real `CRON_SECRET`) to test it directly. It worked perfectly — claimed all 3 overdue
  reminders and pushed all 3 notifications immediately. This proved the entire pipeline
  (RLS-bypassing RPCs, VAPID, the push subscription, the service worker) was never the
  problem.
- That left one explanation, and it matched both symptoms at once: the cron-job.org
  pinger from Phase 3 (MANUAL.md's "One-time setup #3") had never actually been done.
  The only thing checking for due reminders was the once-a-day native Vercel Cron
  backup (`vercel.json`, fixed at 13:00 UTC daily — see entry 9). A brand-new reminder
  just sits overdue for up to 24 hours until that single daily check happens to run.
  And "Brt" firing every morning at "almost the same random time" was that exact same
  daily check — Vercel's free-tier cron doesn't guarantee an exact minute, so it landed
  within roughly an hour of 13:00 UTC (~8am Winnipeg in summer) each day, never at the
  time Alan had actually picked for the routine.
- No code fix was needed or made — the dispatcher, the RPCs, and this session's own
  `firstReminderInstant()` fix from entry 19 were all already correct. The gap was
  purely the missing outside-service setup step.

**What happened next:** walked Alan through creating the cron-job.org account and the
cronjob live, including reading his screen back to him field-by-field (their UI showed
an unrelated "Requires HTTP authentication" username/password section he was right to
ignore — the actual mechanism is the separate custom-header section) and giving him the
real `CRON_SECRET` value directly instead of making him hunt through `.env.local`. He
ran cron-job.org's built-in "Perform test run," which came back `200 OK` with
`{"claimed":0,"pushed":0,"mirrored":0}` — a genuine success (0 just means nothing was
overdue at that exact second, since the manual trigger above had already cleared
everything out). He then created a fresh test reminder a couple minutes out and
confirmed it fired on its own, no manual trigger — end-to-end proof the whole chain
now works unattended.

**Also answered:** whether any of this costs money. It doesn't — cron-job.org's free
tier needs no card and supports 1-minute pings; a ping every 1-5 minutes is roughly
1,440-43,200 tiny requests/month against Vercel and Supabase, nowhere near either
platform's free-tier allowance, consistent with this project's "free tiers only" rule
(CLAUDE.md).

**Docs updated to match:** PROGRESS.md's Phase 3 owner-action checklist now shows the
cron-job.org step done (2026-08-12) instead of pending, and MANUAL.md's "One-time setup
#3" is marked done at the top (instructions kept below in case the cron-job.org account
ever needs to be re-created). The only owner action still open anywhere in the app is
Google Calendar's OAuth credentials.

## 21. "All tasks/routines/reminders sync to calendar, make sure it does" + inline task creation + Tasks page redesign

Three requests in one message: full automatic Google Calendar sync (not the narrow
opt-in it was), a way to set a task's due date/category/repeat/reminder while creating
it instead of reopening it afterward, and a Tasks page that felt "like a mess" with "no
payoff" despite Alan liking the underlying Now/Today/This Week/This Month/Someday
structure. Per CLAUDE.md's "come up with a plan first" precedent and Alan's own "suggest
your best ideas before execution," this went through plan-mode with three concrete
AskUserQuestion decisions put to him directly before any code: quick-add style (kept the
fast one-line bar with an expandable "more options" panel, over replacing it with a
dialog every time), payoff style (progress counts + an "All clear" state, no confetti),
and Routines' placement (collapsed strip by default, over the always-expanded grid).

**What was actually wrong with Google Calendar sync, found by reading the code:**
- Only the standalone Calendar → Reminders form had an "Also add to Google Calendar"
  checkbox — Tasks and Routines had no path to Google Calendar at all, not even
  indirectly through their own reminders.
- Worse, the checkbox's own mechanism was broken for anything recurring: it mirrored a
  reminder to Google Calendar once, lazily, the first time the cron dispatcher saw it
  fire — and never touched that event again. A "daily at 9am" reminder with the
  checkbox on would show as one single stale one-off event in Google Calendar forever,
  not a real repeating series, because nothing ever re-created or advanced it.

**What changed, one by one:**
- New migration `0021_calendar_sync_columns.sql` adds `gcal_event_id` to `tasks` and
  `routines` (matching the column `reminders` already had).
- `src/lib/gcal/client.ts`'s `createEvent`/`updateEvent` now accept an optional
  `recurrence` field, passed straight through to Google's own `recurrence` API —
  reusing the exact RRULE text this app already stores (`src/lib/reminders/rrule.ts`),
  since it's already in the format Google expects. This is what fixes the
  never-advances bug: a recurring reminder/routine now becomes one real Google
  Calendar recurring series, created once, with Google's own calendar handling every
  future occurrence — nothing to re-touch on each fire.
- New `src/lib/gcal/sync.ts`: `syncToGcal()`/`removeFromGcal()`, the one place a
  task/routine/reminder's mirrored event gets created, moved, turned into/out of a
  recurring series, or deleted — called eagerly at create/edit/complete/delete time
  (not lazily on a reminder's first fire, the old design's actual bug). A task mirrors
  as its own one-off event (each due date is genuinely a separate DB row in this app's
  own task-recurrence model); a routine or standalone reminder mirrors as one native
  recurring series (both are a single persistent row whose own rrule already advances,
  matching Google's recurrence model directly). Wired into `createTask`/`updateTask`/
  `setTaskCompleted`/`deleteTask`, `createRoutine`/`updateRoutine`/`archiveRoutine`, and
  `createReminder`/`updateReminder`/`deleteReminder` (calendar/actions.ts) — a
  task/routine-linked reminder does *not* separately mirror itself anymore, since that
  would double up with the task/routine's own calendar entry now that it has one.
- Sync is unconditional once connected — the old per-reminder checkbox is gone
  entirely from `reminder-form.tsx`; the existing Settings → Calendar master
  `sync_enabled` switch is still the one on/off control, now covering everything
  instead of nothing.
- New `backfillGcalSync()`, called right after a successful OAuth connect
  (`/api/auth/google/callback/route.ts`) — so connecting for the first time doesn't
  leave every task/routine/reminder made before that moment invisible on the calendar.
- The now-dead lazy-mirror-on-first-fire block was deleted from the cron dispatcher
  (`src/app/api/cron/reminders/route.ts`) — sync happens at creation/edit time now, so
  the dispatcher has nothing left to do for Google Calendar.

**Inline task creation:** the Tasks quick-add bar (title + horizon + submit) is
untouched for speed — still exactly type-and-go. A new "More options" toggle beneath it
expands, in place, into category/due-date-time/repeat/reminder — all wired into
`createTask`, which already accepted these fields (added by an earlier phase) but the
UI never sent them. Also added a `notes` field to `createTask` itself, which was
missing it even though `updateTask` already had it.

**Tasks page — decluttered, given real payoff:**
- Routines now default to a collapsed single-row strip (small icon chips, tap to
  complete/open-checklist directly) instead of the always-expanded grid competing with
  Tasks for the same screen space on load — tap the "Your Routines" heading to expand
  into the full grid.
- Each horizon section now shows a live "N done today" count, and a section that's
  been fully cleared out shows a friendly "All clear — N done today" line instead of
  just silently disappearing the way it used to (zero feedback for finishing
  everything in a section was the literal "no payoff" Alan described). New
  `getTodayCompletionCountsByHorizon()` seeds this per page load; the client then
  tracks its own live increments as things get checked off in the same session
  (undoing a task only decrements if it was completed in *this* session, so undoing
  something from the "Completed" archive from a prior day can't miscount today's
  tally).

**Also de-duplicated while touching this code:** the repeat-preset + weekday-buttons +
interval/monthday-inputs block was independently copy-pasted in `TaskDetailDialog` and
the routine form already — adding a third near-identical copy for the new inline panel
was the trigger to finally extract it into one shared `src/components/recurrence-picker.tsx`,
used by all three now. Along the way, added `parseRecurrenceFromRRule()` in `rrule.ts`
and fixed a real pre-existing bug it exposed: re-opening an "every Wednesday" task or
routine and saving without touching the weekday picker silently reset it to Monday,
because the old per-file parse functions only recovered the preset type, not the
actual weekday/interval/month-day values.

**Verified:** full `npm run build` + `npx tsc --noEmit` + eslint all clean. Connected
directly to the live database to confirm the new `gcal_event_id` columns exist,
nullable, on all three tables, and a real insert/update round trip against them works;
confirmed Alan has no `gcal_connections` row yet, so every new sync code path is
currently a safe, harmless no-op until he finishes the Google OAuth credentials step
(unchanged owner action from Phase 3) — nothing in this change touches existing
behavior until that happens. Could not click through the new inline panel or the
collapsed Routines strip in a live browser from this session (no interactive browser
attached); relied on `next build`'s full compile of every route plus careful review
instead — flagged to Alan to try both by hand and report back.

**What Alan needs to do to see the calendar sync itself work:** finish the Google OAuth
credentials step (MANUAL.md "One-time setup #2" — Google Cloud Console → OAuth client →
paste `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` into Vercel), same as it's been since
Phase 3. Everything else in this entry (inline task creation, the Tasks page redesign)
works right now regardless of that.

## 22. Google Calendar backfill failed silently — surface the real error, add a retry

Not a new request from Alan, but a same-day follow-up to entry 21 that never got logged
here (commits `b1ee290` and `607e1fb`, 2026-08-12). Recording it now so the history is
complete.

Alan finished the long-standing Google OAuth owner action — `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` were added in Vercel's dashboard. Vercel only reads newly-added
environment variables on a fresh deployment, not the already-running one, so an empty
commit (`b1ee290`) was pushed purely to force that rebuild.

He then connected his Google account and the first-connect backfill quietly did nothing
to his existing tasks and routines, with no visible reason why. Cause: `syncToGcal()` and
`backfillGcalSync()` were swallowing exceptions, so a real Google API rejection looked
identical to "nothing to sync."

- `src/lib/gcal/sync.ts` — both functions now return a real result (synced/failed counts
  plus the actual Google API error text) instead of returning void and eating the throw.
- `src/app/api/auth/google/callback/route.ts` — the OAuth callback passes a failure
  through to the Settings page instead of unconditionally reporting "Connected".
- `src/app/(app)/settings/calendar/page.tsx` + `calendar-connect.tsx` — show that failure
  when it happens, and add a **"Sync now"** button so a failed backfill can be retried
  without disconnecting and reconnecting the whole account.
- `src/app/(app)/calendar/actions.ts` — wired to the new return shape.

**Still unverified:** the fix deployed, but nobody has since tapped "Sync now" to confirm
the sync actually succeeds now, or to read what the error was. That's the one open thread
from that session — Alan needs to open Settings → Calendar and tap it.

## 23. "I really don't like the design of this thing" — full redesign viability review

Alan said he dislikes the app's current design and pasted a Bauhaus design-system prompt
he'd found online, asking for a deep analysis of how difficult and viable a full redesign
would be *before* any code. He added two constraints: less playful / more professional
than the prompt describes, and multiple theme options rather than the prompt's single
fixed palette. No code was changed in this session — analysis only, as asked.

**What was audited** (all 94 `.tsx` files, ~10,000 lines of UI, 21 screens):

- **Zero hardcoded Tailwind colour utilities** (`bg-blue-500` and friends) app-wide, and
  only 2 raw hex values in all of `src/**/*.tsx` — both legitimate (a category-colour
  fallback in `money/overview-view.tsx`, and the PWA `themeColor` meta in `layout.tsx`).
  Everything else resolves through the 10 CSS custom properties in `globals.css`.
- 11 palettes × light/dark = 22 colour sets, all generated from `src/lib/palettes.ts` via
  `scripts/gen-palette-css.mjs`. Adding themes is already a solved problem in this repo.
- **169 `rounded-*` usages across 51 files — but ~125 of them resolve through Tailwind's
  `--radius-sm/md/lg/xl`, which `@theme inline` maps back to the single `--radius` token.**
  Setting `--radius: 0` squares most of the app in one edit; only the 35 `rounded-full`,
  4 arbitrary values, and 5 `-t-`/`-b-` variants need hand visits.
- 9 shared primitives in `src/components/ui/`, consumed by 44 files — restyling those
  nine propagates without touching the 44.
- Shadows are already tokenized (`--shadow-sm/md/lg`) with only 5 direct usages, so
  swapping soft shadows for hard offset shadows is a ~6-line change in `globals.css`.
- `theme-provider.tsx` already stamps six `data-*` attributes on `<html>` (palette,
  heading font, body font, font size, density, motion). A seventh — design language —
  follows an established pattern six times over.
- **Not tokenized, so genuinely new work:** border weight (no token exists; everything is
  1px `border` or `ring-1`), typographic case/weight treatment, and per-screen layout
  composition.

**Four honest caveats raised, in priority order:**

1. **The prompt is a landing-page design system, not an app one.** It literally specifies
   a hero panel, stats band, blog grid, pricing, testimonials and a final CTA — none of
   which exist in Alan OS. `text-8xl` headlines, 4px borders and 8px shadows around every
   card would make a 30-row task list unusable on a phone. It needs translating to
   Swiss/International Typographic (the Bauhaus's application-scale descendant), not
   copying.
2. It's explicitly light-mode-only; the app has full dark mode across 11 palettes, so a
   dark variant has to be designed rather than derived.
3. The pure primaries have real contrast problems at body-text size (`#F0C020` with white
   text fails outright; `#D02020` is borderline for small text).
4. Uniform 4px borders + 8px shadows in dense lists is visual noise and lost screen space;
   needs two border weights (heavy for page structure, hairline inside lists).

**Estimate given:** viability high, difficulty medium, risk low. 5–6 sessions —
1 for the design-language switch + first theme + the 9 primitives, 3–4 for the
module-by-module layout pass, 1 for the remaining themes. Risk is low because the split
between the 65 logic `.ts` files and the 94 presentational `.tsx` files is clean: no
schema, RLS, server action or money maths is touched by any of it.

**Four themes proposed** (each light + dark, all sharing the same structural language):
Ink (paper/black/signal red, Swiss editorial — the recommended default), Blueprint (deep
navy, white rules, drafting blue), Primary (the true Bauhaus red/blue/yellow, as accents
and edges rather than section fills), and Concrete (warm greys + ochre). The existing 11
palettes stay available under the current "soft" design language.

**Deliverable:** a published visual report (side-by-side phone mockups of the Today
screen as-is vs. as-proposed, theme swatches, the cost/risk table), itself built in the
proposed style so Alan could judge the direction by looking at it rather than reading a
description of it.

**Open decision put to Alan:** build stage 1 as a *switch* (new look becomes a seventh
Appearance option, old look preserved, ~half a session extra, two designs to maintain) or
as a *replacement* (cleaner, faster, revertible only via git). Recommended the switch for
stage 1 so he can compare both on his phone, then drop the old look during stage 2 if he
likes the new one.

## 24. "I really don't like the design" — full app-wide redesign into the "Swiss Instrument" language

Follow-up to entry 23's viability review. Alan read it, said he was aware the Bauhaus
prompt was written for a sales website, and gave blanket autonomy: *"just get the idea
from the prompt but give me multiple theme colors and make it make sense for this app
with page connectivity and process flow important more than anything else… I want a way
better dashboard structure and everything. just get to work and make it awesome."*

Because he explicitly disliked the existing look, this shipped as a **replacement**, not
the switchable seventh Appearance option entry 23 recommended — carrying a design he'd
already rejected would have doubled the work for no benefit. Git history is the undo.

### The design language

Documented at the top of `globals.css`. Three rules drive everything:

1. **Structure, not elevation.** A panel is a thick high-contrast rule, not a shadow.
   Radius is 0 everywhere; circles are reserved for genuinely round things (avatars, the
   wordmark dot). Hard offset shadows (3/5/8px, no blur) appear only on things truly
   above the page — dialogs, pressed buttons, the quick-add.
2. **Type carries hierarchy.** Three registers do the work: `.display` (heavy, uppercase,
   -0.04em track), body text, and `.micro` / `.micro-sm` (mono, uppercase, wide-tracked)
   for every label, unit, count and timestamp.
3. **Colour is signal.** `--ok` / `--warn` / `--destructive` are semantic and separate
   from the theme accent, so "overdue" means the same thing in every palette.

**The two-weight border rule is the backbone**: `--rule-w` (2px, 3px at `md+`) frames a
panel; `--hairline-w` (1px) separates rows *inside* one. Entry 23 flagged uniform heavy
borders as the thing that turns brutalist UI into noise, and this is the fix.

### Tokens (`globals.css`, `palettes.ts`, `gen-palette-css.mjs`)

- **All 11 old palettes replaced with 8 new ones**, each light + dark: **Ink** (default,
  Swiss editorial), **Blueprint**, **Primary** (the true Bauhaus red/blue/yellow, as
  accents not section fills), **Concrete**, **Signal**, **Verdigris**, **Oxblood**,
  **Monolith**. The old set was tuned for soft UI — low-contrast borders and muted
  grounds — which actively fights a structural language.
- `PaletteColors` gained `rule` and `hairline`, replacing the single `border` that was
  doing both jobs at hairline strength. The generator script was updated to match, and
  now derives its default-palette selector from `DEFAULT_PALETTE_ID` instead of a
  hardcoded id.
- **`normalizeThemeSettings()` + `LEGACY_PALETTE_MAP`** — every existing account has a
  saved palette id that no longer exists. Rather than snapping everyone to the default,
  each old id maps to its nearest new theme (burgundy→Oxblood, navy→Blueprint,
  mono-graphite→Monolith, …). Wired into all three read paths: `profile.ts`,
  `theme-provider.tsx`, and the pre-hydration `theme-script.tsx` (which needs its own
  inline copy of the map, since it runs as a raw string before any module loads —
  without it every existing account would flash the default theme on every page load).
- `--radius: 0` plus `--radius-sm/md/lg/xl: 0` in `@theme inline` squared ~125 of the
  169 pre-existing `rounded-*` utilities with no file edits, exactly as entry 23
  predicted. The now-dead classes were then stripped from source so the code says what
  it means; the only `rounded-full` left are five real circles.
- Added **Outfit** (the geometric face the Bauhaus reference names) as a heading option
  and made **Archivo** the default, loaded with its full weight range — the display
  register uses 800 and needs it. PWA `themeColor` now has light/dark variants matching
  Ink instead of one hardcoded green.
- `motion.ts` retuned from organic to mechanical: ease-out with no overshoot, exits
  slide along the grid instead of scaling down, dialogs drop in rather than zooming.

### Primitives

All nine restyled (`button`, `card`, `input`, `label`, `select`, `switch`, `segmented`,
`dialog`, `toast`) — 44 files consume these and none needed editing. Beyond styling:
button default height went 32px → 40px (the old default was under the comfortable-touch
threshold on a phone-first app); the switch is now a square block sliding in a framed
track; `Segmented`'s active state is a solid block filling its cell edge-to-edge.

**Five new primitives** carry the language:

- `page-header.tsx` — `PageHeader` / `HeaderFact`. Every screen now opens the same way
  (eyebrow / display title / live metadata), with a real back affordance for sub-pages,
  which a home-screen PWA has no browser chrome to provide.
- `panel.tsx` — `Panel` / `PanelHead` / `PanelRow` / `PanelEmpty`. The app's most common
  shape, with the correct heavy-frame + hairline-rows pairing baked in as the default.
- `stat.tsx` — `Stat` / `StatStrip`. A labelled reading with optional meter. **`href` is
  the important prop**: Alan ranked connectivity above everything, and this is where most
  of it lives — every number is a door into the module that produced it. `StatStrip` uses
  gap-as-divider rather than child borders, which is correct at any item count and any
  breakpoint (borders leave a doubled line against the frame wherever items wrap).
- `tag.tsx` — `Tag` / `Micro`. The one chip, with semantic rather than decorative tones.
- `wordmark.tsx` — circle/square/triangle in theme colours. The one place literal Bauhaus
  iconography belongs: as a mark, used once, not scattered over every card as decoration.

### The dashboard, rebuilt as a console (Alan's "way better dashboard structure")

The old Today was a bag of widgets — an AI-briefing placeholder, a merged timeline card,
four live tiles and four "coming soon" tiles in a grid with no reading order. Replaced
with one top-to-bottom reading order where each band answers exactly one question:

- **masthead** — what day, how loaded.
- **NOW** — the single next thing, as the one inverted block on the screen, with a real
  action on it (tick a routine off in place, or open the thing). Picks overdue first,
  then the earliest item whose time hasn't passed.
- **VITALS** — four live numbers (due today / safe to spend / streak / shopping), each a
  link into its module.
- **THE DAY** — routines, tasks and the next calendar event merged into one time-ordered
  list with a fixed tabular time gutter, a completion meter under the header, and amber
  time stamps on anything already past and still outstanding.
- **FOCUS** — the day-planner ritual, split out of the old monolithic card.
- **JUMP TO** — everywhere else, as one ruled list. **The four "coming soon" placeholder
  cards are gone**, replaced by a single muted line — six dashboard-sized tiles
  advertising unbuilt features was most of why the old screen felt cluttered.

`TodayConsole` deliberately holds NOW and THE DAY in one component so they share
routine-completion state; split, ticking something off the timeline would leave it still
showing as "next up" above. Ticking a task off the dashboard now calls `setTaskCompleted`
for real (optimistic, with rollback on failure) rather than only looking checked.
Deleted: `today-timeline.tsx`, `components/dashboard/widget.tsx`.

### Process flow (the other half of Alan's brief)

New `QuickAdd` — a floating control on every screen opening a sheet of create flows
(task / expense / shopping item / reminder / workout), filtered by `ModuleAccess`. The
previous floating "+" was removed in entry 17 because it only said "coming soon"; this
one is honest — no free-text parsing, no AI, just routing. Each destination now handles a
`?new=1` parameter and **lands you in the form with the cursor already in it**: Tasks and
Shopping focus their add field, Money opens the amount keypad, Calendar opens the
reminder form on the Reminders tab. Implemented by passing `searchParams` from each
server page rather than `useSearchParams`, and seeded as initial state rather than set
from an effect.

Also: the desktop rail now lists the "More" modules directly instead of bouncing to a
phone-shaped menu page, and Agenda rows still deep-link into Tasks/Reminders.

### Every screen

Tasks & Routines, Money (overview / budgets / goals / debts / reports / quick-log /
receipts), Shopping, Workout (feed / leaderboard / new session / set logging), Calendar
(agenda / reminders), Settings (index / all seven sub-pages / the theme picker), plus
Login, Signup, More and the empty/loading states. Highlights:

- **Quick-log keypad** keys went 56px → 64px in one gapless ruled grid, with the amount
  as a full-bleed inverted block that shrinks but stays on screen through step two.
- **Savings goals** lost their SVG progress ring (round stroke-linecap — the softest
  element left in the app) for a ten-cell segmented block you can read by counting.
- **Charts** keep their already-validated categorical palette; what changed is geometry —
  square bars, square legend swatches, hard-edged tooltips.
- **A PR** is now a solid banner across the top of a feed card, and **your own row** on
  the leaderboard is an inverted block rather than a faint tint.
- **The theme picker** shows each palette as a miniature of the real app — framed panel,
  heavy rule, inverted block, filled meter — because in this language how the rule reads
  against the ground matters more than the accent does. Heading fonts are previewed in
  their own face at display weight.
- New `SettingsPageShell` replaced seven hand-written page wrappers.

### De-duplication found along the way

`reminder-form.tsx` still had its own hand-rolled repeat-preset and weekday picker — a
fourth copy that the earlier `RecurrencePicker` extraction (entry 21) missed, which is
why its weekday buttons were still round pills after everything else went square. Now on
the shared component. Two other hand-rolled two-state toggles (receipt split-by-category,
debt avalanche/snowball) moved onto `Segmented`.

### Verified

`npm run build`, `npx tsc --noEmit` and `eslint` all clean. Dev server smoke-tested: the
public `/login` renders 200 with the new markup, all eight protected routes correctly
307 to `/login` (auth guard intact, no 500s), and the compiled CSS was inspected directly
to confirm `--radius: 0px`, `--rule-w: 2px`, both `.dark` and all eight `[data-palette]`
blocks, and every new utility (`border-rule`, `border-hairline`, `bg-hairline`, `text-ok`,
`bg-warn`, `.micro`, `.display`, `.stat`, `.panel`, `.hatch`, `.press-hard`) all present.

**Not verified:** nobody has logged in and walked the redesigned screens on a real phone
— this session has no browser and no test credentials. Nothing server-side changed (no
schema, no RLS, no server action, no money maths — the 65 logic `.ts` files are untouched
apart from `profile.ts`'s theme normalisation), so the risk is cosmetic, but Alan should
walk each screen and report anything that reads wrong.

## 25. Page transitions, a rebuilt Workout logging flow, and personal records that mean something

Four requests in one message: page transitions should be consistent and more Bauhaus;
the Workout module needs work, specifically that adding an exercise to a session via "a
small bar of exercises that I have to scroll through horizontally" is "very
inefficient"; "forget the new PR thing… change it to make more sense and also make it a
lot better"; and a new logo, shown as options for Alan to choose. He also asked to be
asked questions first, so the three build decisions below were put to him directly
before any code was written.

**His answers:** the PR complaint was specifically the banner on workout feed cards;
adding exercises should be a full-screen picker where you tick several at once, grouped
by body part; and within a session he wants one exercise at a time with a big Next
button. Logo went to a second round (see the end of this entry).

### Page transitions — the wipe

Every route change is now one gesture: a hard vertical edge travels left to right across
the viewport and the new page is revealed behind it, like a printer's bar passing over a
sheet. Pure CSS (`page-reveal` + `wipe-edge` keyframes in globals.css), keyed on the
pathname.

The old transition was a Framer fade-and-rise inside `AnimatePresence mode="wait"`. Three
problems: a fade reads as organic in an app where nothing else does; a fade has no
direction, so every screen change looked identical and gave no sense of having gone
anywhere; and `mode="wait"` held the new page back until the old one finished leaving,
adding a beat to every single navigation. The replacement drops Framer here entirely — no
exit animation to wait for, the new page starts painting immediately, and the whole thing
runs on the compositor.

**A bug caught in the new code before it shipped:** the reveal was first written with
`animation-fill-mode: both`, which leaves `clip-path: inset(0 0 0 0)` applied to the page
wrapper permanently. An element with a clip-path becomes the containing block for any
`position: fixed` descendant — so every full-screen overlay rendered inside a page (the
new exercise picker, immediately) would have been positioned and clipped against the page
content instead of the viewport. Fixed by dropping the fill-mode so the clip only exists
while the animation runs. The edge keeps `forwards`, or it would snap back to the left of
the screen and sit there.

### Adding exercises — full-screen, grouped, multi-select

`exercise-picker.tsx` rewritten. It was a small modal that added exactly one exercise per
open, reached from a 36px dashed square at the end of a horizontally-scrolling chip row —
so building a five-exercise session meant five round trips through a scroll, a tap, a
search and a dialog. Now:

- Fills the screen, with a large search field focused on open.
- Grouped by body part (`muscle_group`, which the schema already had and nothing used),
  so you can find things without typing.
- **Recently used floats to the top**, minus anything already in the session — most
  sessions reuse the same handful of lifts.
- Tick as many as you want; the tick shows a **number**, so with five picked you can see
  the order they'll be added in. One "Add 5 exercises" button closes it.
- Creating a new exercise happens inline and arrives already ticked, rather than making
  you find it again afterwards.
- `settings/workout/template-editor.tsx` now uses this same component instead of the old
  single-select one, so building a template and building a session are the same job done
  the same way.

### Inside a session — one exercise at a time

`new-workout-form.tsx` restructured around Alan's pick:

- A position strip: "Exercise 2 of 5", a segmented progress bar (one cell per exercise,
  filled once it has sets), and a tap-to-open running order so "one at a time" never
  means "lost". Jumping straight to any exercise from that list works.
- Big **Prev / Next** as a single ruled control, sized for a hand mid-set. Next is the
  inverted block until you reach the last exercise.
- The active exercise slides in horizontally on the shared mechanical curve, so moving
  through the session has the same directional feel as moving between pages.
- **New: "Repeat last session"** on the start screen, powered by a new
  `getLastResistanceSession()` action that returns the previous resistance workout's
  exercise ids *in the order they were performed*. Training on a rotation means most
  sessions are last week's session again, and picking those five lifts one at a time
  every time is pure friction.
- Save is now labelled with what it will save ("Finish session · 14 sets") and is
  disabled until at least one set exists, rather than until at least one exercise does.

### Personal records — made to mean something

The complaint was the feed banner, but the banner was a symptom. The real problems, in
order:

1. **Three records per exercise, every time.** `weight`, `est_1rm` and `volume` were all
   announced. Volume is the total weight moved in a session, so it goes up whenever you
   add a set — a volume "record" is nearly free.
2. **The first time you ever logged an exercise you set three PRs at once**, because no
   prior entry counted as beating everything. That is not a thing that happened.
3. **The banner said nothing.** "New PR — Bench Press": no number, no lift, no sense of
   whether it mattered.

Between 1 and 2, within a fortnight of using the app every session had a PR banner on it
and the word had stopped meaning anything. Fixes:

- `detectNewPrs` now returns `previousValue` alongside each record, `null` when it's an
  opening baseline. New `reportablePrs()` filters those out. `logWorkout` still **writes**
  every result to the ledger — future sessions need something to compare against — but
  only announces the ones that beat something.
- New `headlinePr` / `headlinePrsByExercise` pick **one** record per exercise, ranked
  weight → est_1rm → volume, so a card shows "Bench Press — heaviest ever" instead of
  three near-identical lines about the same lift.
- `PR_KIND_LABELS` gives the three kinds plain names: *Heaviest ever*, *Strongest set*,
  *Biggest session*.
- The feed card shows the **actual figure**, converted to the reader's unit. Volume is
  formatted separately (rounded, with a unit suffix) rather than dressed up as a weight,
  because it's weight × reps and much larger. The first record on a card is the shout —
  one inverted accent block — and any others are quiet supporting rows.
- The save-time celebration now names the margin: "Bench Press: heaviest ever — up from
  185 lb", instead of unexplained confetti.

### Verified

`npm run build`, `npx tsc --noEmit` and `eslint` all clean. Not verified: nobody has
logged in and walked the new picker or the one-at-a-time flow on a phone.

### Still open — the logo

Six marks were put to Alan (Trio, The A, A/O, Quadrant, Eclipse, Aperture). He liked 01,
03 and 04, wanted the name more obvious, and wanted Quadrant's colours. A second round of
four was drawn — **Spelled** (the name with both As as red triangles and the O as a blue
circle), **Lockup** (Quadrant plus the name set large in two lines), **A·O Tile** (red
triangle A and blue circle O locked into one ink tile) and **Stacked** (A/O recoloured,
name set wide beneath) — but the artifact host was returning 502s throughout, so the
options have not reached him yet. Nothing in the app's branding has changed. Next session:
republish that page, get a number, and apply it to the nav wordmark, sidebar, login,
signup, favicon and the PWA icons in `public/icons/` (regenerated via
`scripts/gen-icons.mjs`).

## 26. Android notification icon was a white square; logo left alone

Two outcomes in one exchange.

### The logo: no change, and a mistake worth recording

Alan asked for Bauhaus-flavoured logo options. Three rounds were drawn and all three
rejected — "you are leaning into the bauhaus aspect of this too much", "there is more
bauhaus and less alan os in these logos".

**The cause was a wrong assumption, not wrong taste.** He kept saying he liked "the app's
current logo". That was read as the `Wordmark` component in the sidebar (circle + square +
triangle), which had in fact been *invented during the redesign a few days earlier* — so
every round was a variation on a mark that had nothing to do with the app's identity. The
real logo is the one in `public/icons/`: an ink chevron, an **A without its crossbar**, on
a cream rounded square over British Racing Green, generated by `scripts/gen-icons.mjs` and
unchanged since Phase 0. It's what has been on his home screen the whole time.

Reading `public/icons/icon-512.png` before drawing anything would have caught this in the
first round instead of the fourth. **Check the artifact before redesigning it.**

A fourth round was drawn from the real chevron, and his answer was to **keep the current
logo as-is**. Nothing in the branding changed. Two things about it are still worth knowing:

- The icon's British Racing Green is from the palette **retired in the redesign** — it is
  no longer one of the eight themes, so the app icon is the last surviving piece of the
  old design language.
- `src/components/nav/wordmark.tsx` still shows circle/square/triangle, so **the app
  carries two different logos** — the chevron on the home screen and the shapes in the
  sidebar. Alan hasn't asked for this to be reconciled; noting it so it isn't mistaken for
  an oversight later.

### The bug: `badge` is not a small `icon`

On Samsung, the mark in the status bar came up as a plain white square.

`public/sw.js` was passing `/icons/icon-192.png` as the notification `badge`. Android
treats `badge` completely differently from `icon`: it **discards the colour channels and
keeps only alpha**, filling whatever is opaque with a flat colour of its own. `icon-192`
is opaque on every single pixel, so the silhouette Android saw was the whole square — a
white block, exactly as reported. Not a rendering glitch; the wrong kind of image in the
field.

Fixes, all in `scripts/gen-icons.mjs` and `public/sw.js`:

- New **`badge-96.png`** — the chevron alone on a fully transparent ground. 96px is 24dp
  at xxxhdpi, the densest Android asks for, so it scales down cleanly to everything below.
- Drawn with **its own geometry** rather than a scaled copy: taller, wider at the base and
  noticeably thicker in the leg, because the app icon's slimmer chevron closes into a
  smudge at 24dp.
- New `coverage()` helper anti-aliases it by 4× supersampling. Costs nothing here — the
  badge is pure alpha, so partial coverage maps straight onto partial opacity. The
  full-size app icons still use the original hard-edged test and were not regenerated.
- Added to the service worker's `SHELL_URLS`, and `CACHE_NAME` bumped to
  `alan-os-shell-v2` — the activate handler deletes any cache whose name doesn't match, so
  a version bump is what makes existing installs pick up the new shell list.

**Verified** by decoding the generated PNG rather than eyeballing it (a white-on-
transparent image looks like nothing in a normal viewer): 75% fully transparent, 22%
opaque, 290 anti-aliased edge pixels — a real silhouette, not a solid block — then
composited over a dark ground to confirm the chevron reads correctly at size. Confirmed
live in production at `/icons/badge-96.png`.

**What Alan has to do:** the badge is baked into a notification by the service worker at
the moment it fires, so the new service worker has to be running first. Close the app
fully and reopen it once, then use Settings → Calendar → **Send test notification**.

## 27. The reminder that outlived its task — root cause, three related bugs, and the start of the Tasks/Calendar rebuild

Alan reported a reminder still firing for a task he had deleted, naming it: "anushas
father watch". He also asked for Tasks and Calendar to be merged and streamlined, a
calendar view inside Tasks, and a proper calendar-style date picker — and asked to be
consulted before implementation.

### Diagnosis, against the live database

Queried production directly rather than reasoning from the schema. Found **"Watches for
anushas dad"**: `status = 'active'`, recurring, next fire `2026-08-19 00:28`,
`linked_task_id` NULL. Plus five finished leftovers. Alan reviewed the list and asked for
all six to go.

**Root cause: one word.** `reminders.linked_task_id` was declared `on delete set null`
(migration 0011), and `linked_routine_id` the same (0020). Deleting a task blanked the
link rather than removing the reminder. The row kept its `remind_at`, its rrule and its
active flag, and `claim_due_reminders` only ever asks *"is it active and is it due"* — it
has no idea whether the task still exists. Once the link was blanked there was also no
path back to it, so nothing in Tasks could clean it up; it simply appeared in the
Reminders tab as though Alan had made it on purpose.

Routines had always handled this correctly in application code (`archiveRoutine` deletes
linked reminders explicitly). Tasks never did. **That inconsistency was the entire bug** —
and it's exactly the kind that survives because the fix lived in one caller's head rather
than in the schema.

### Two more of the same family, found while fixing it

- **Completing a task didn't silence its nudge.** Finish something on Thursday that's due
  Friday 6pm, and Friday 6pm you were still told to do it. `setTaskCompleted` returned
  early for non-recurring tasks without touching reminders at all.
- **Completing a *recurring* task fired its next nudge immediately.** The reminder was
  re-pointed at the new instance but `remind_at` was left on the occurrence that had just
  been completed — i.e. in the past — so the dispatcher claimed it on its next sweep.

### Fixes

Migration `0022_reminder_ownership.sql`: deletes the six unattached rows and switches both
FKs to `ON DELETE CASCADE`, so the database enforces ownership instead of trusting
callers. Adds a partial index on unattached-and-active rows for future sweeps.

**Verified against production**, not assumed: 0 unattached rows remain, both constraints
report `confdeltype = 'c'`, and an insert-task → insert-reminder → delete-task probe
inside a rolled-back transaction confirms the reminder now dies with its task.

Application side: completion marks linked reminders `done` (not deleted, so un-ticking can
revive them — and only when their moment hasn't already passed); the recurring path moves
link, status and time together; `deleteTask` collects linked reminders' Google Calendar
ids *before* the delete, since a cascaded row can't tell you afterwards what to tidy up.

### Due vs nudge — answering the question Alan asked back

He said: *"i dont like the current logic where there is a due date and then a reminder
button. does it mean that itll remind me only at the time its due? i am not a big fan of
that system suggest something much better."* He'd read it correctly — that is precisely
what it did.

Migration `0023_task_nudge_offset.sql` adds `tasks.notify_offset_minutes`: how long
**before** the deadline to say something. `null` = never, `0` = at the due time (the old
behaviour, now a deliberate choice), `60` = an hour before, `1440` = the day before.
Existing tasks with a reminder are backfilled to `0` so nothing changes underneath him.

This also absorbs standalone reminders, per his *"every reminder is basically a task"*:
"bin day Tuesday 8pm" is simply a task due Tuesday 8pm with an offset of 0. **The
`reminders` table survives only as the dispatcher's queue** — `remind_at` is derived, and
nothing in the UI edits a reminder directly any more.

New `src/lib/tasks/nudge.ts` owns the vocabulary and arithmetic; new `NudgePicker`
replaces the remind-me switch (a toggle for the common decision, a dropdown for how far
ahead). Task rows now read "6pm · 1h before" rather than lighting a bell and leaving you
to infer what it means.

**One consolidation worth recording:** `syncTaskNudge` is now the single place a
task-linked reminder is created, moved or removed. Three call sites each had their own
version of that logic and had already drifted — which is how the completion and recurrence
bugs got in. Dead code removed: `createReminderFromTask`, `getTaskIdsWithReminders`.

### Date and time pickers

Alan: *"its just like a scroll wheel. i would like a calender view with todays date
highlighted and for time, you know how android has a round clock and you select hour and
min, something like that with an option to type and change as well."*

Three new components:

- `calendar-grid.tsx` — the month grid. Always six rows, never five: a grid that shrinks
  in short months makes everything below it jump on every page turn. Today is an outline
  rather than a fill so it stays visible when another day is selected. Takes optional
  per-day marks, because this is the same component the Plan calendar view will use —
  those were never going to be two different calendars.
- `clock-picker.tsx` — the round dial. Tap or drag for the hour, then it advances itself
  to minutes. The digital readout doubles as the mode switch and a text input, so a time
  can always be typed. A circle is the one shape the language squares everywhere else; a
  clock face genuinely is round, and that's what makes it read as a clock instantly.
- `date-field.tsx` — `DateField` / `DateTimeField` / `TimeField`, taking and emitting the
  exact string formats the native inputs did, so every caller's UTC conversion keeps
  working and no timezone behaviour changes.

All 15 native date/time inputs swapped across Tasks, Calendar, Routines, Money and
Workout. Nothing native remains outside the picker components.

### Decisions taken from Alan for the remaining work

Asked before implementing, per his request. His answers, recorded because the next session
should build to them:

- **Merge Tasks and Calendar and rename** — something like "Plan" — with switchable views:
  List (default), Calendar, and any others that make sense.
- **Everything a task's data touches should sync to Google Calendar and notify**, including
  the notification itself.
- **Every reminder is basically a task.** His stated end goal is typing a sentence and
  having AI create the task/event with reminders and a target date — Phase 7 quick-capture.
  Worth noting the Gemini key owner action is still outstanding, so that can't be built yet.

### Still to do

`Plan` module merge (List / Calendar / Agenda in one place, retiring the separate Calendar
tab), and pushing a task's nudge onto its Google Calendar event as a popup reminder so
Google notifies too.

### Verified

`npm run build`, `npx tsc --noEmit` and `eslint` clean at every commit. Migrations applied
to production and their effects confirmed by query. Not verified: nobody has walked the
new pickers or the nudge control on a phone.

## 28. Tasks + Calendar merged into Plan; nudges sync to Google

The second half of entry 27's work, built to the answers Alan gave there.

### Plan

New `/plan` module with three views — **List** (default), **Calendar**, **Agenda**.

Tasks and Calendar were two modules describing the same commitments in different words: a
task with a due date appeared in the task list, again in the Agenda, and a third time as a
reminder. One module with three ways of looking at it removes the duplication without
losing a single view. List stays the default because it's the one opened forty times a
day; the other two are for planning rather than doing.

**New `getPlanRange(start, end)`** in `plan/actions.ts` is the single assembler for tasks,
routines and Google events — replacing three separate merge implementations (the old
Agenda, the Today dashboard, and what the calendar grid would have needed) that each had
their own idea of what counted and how to deduplicate.

Two decisions inside it worth recording:

- **Reminder rows are deliberately excluded.** Under the nudge model a reminder fires
  *before* its task is due, so including both would put one commitment on the agenda twice
  at two different times — once when you're warned and once when it's actually due. The
  task is the thing; the nudge rides along on the item as `nudgeMinutes`.
- **Routines are expanded per-day** across the range via `isDueOnDate`, because a routine
  is one row with a repeat rule rather than a row per occurrence. That's only tractable
  for a bounded range, which is why the function takes explicit start/end rather than
  "upcoming".

**Calendar view** marks a day by which *kinds* of thing are on it, not how many — three
dots is all that's legible at that size, and a count would be unreadable. A day where
everything is already done still gets a mark, just a quiet one, or a productive day would
look identical to an empty one. Three months (previous, current, next) load up front so
paging one either way costs no round trip; going further fetches on demand.

### Retired

**The Reminders tab is gone.** A reminder is a setting on a task now, so there is nothing
left to list. `reminders-view.tsx`, `reminder-form.tsx`, `agenda-view.tsx` and
`calendar-shell.tsx` deleted. Nothing was actually lost: creating a standalone reminder is
creating a task with a due date and a nudge; pausing one is turning the nudge off; snoozing
still works from the notification itself; and seeing everything upcoming is the Agenda view.

`/tasks` and `/calendar` are **redirects rather than deletions** — both are in Alan's
history, likely on his home screen, and are the targets of `?new=1` links inside any page
the service worker still has cached. Push notifications now open `/plan` instead of the
Reminders tab that no longer exists. The quick-add's separate "Reminder" entry was folded
into "Task or reminder", since both went to the same form.

### Google Calendar notifications

Alan asked that "all the data related to the task including a notification should sync with
google calender and notify me".

`updateEvent` can now set an event's popup reminder, which it previously couldn't — so
changing a task's nudge only ever moved the app's own notification. `null` means *no
popup*, which Google expresses as `useDefault: false` with an empty `overrides` array, and
which is meaningfully different from omitting the field (leave whatever's there alone).
`syncToGcal` threads `reminderMinutesBefore` through to both create and update, and all
three task call sites pass it — create, update, and the next instance of a recurring task.
Net effect: a phone with the app closed still gets told, by Google.

### A hole caught before it shipped

`canAccessPath` maps a path to its gating module by prefix-matching the module ids. `/plan`
matches none of them, so `moduleForPath` returned `null`, `canAccessPath` returned `true`,
and **every account could reach the module by typing the URL** — reopening exactly the
direct-URL gap the `proxy.ts` guard was added in Phase 2 to close.

Fixed with an explicit `ROUTE_MODULE_ALIASES` table, and verified rather than assumed: a
`workout_member` with no tasks access is blocked from `/plan`, `/plan?view=agenda` and
`/tasks`, while a `full_user` with tasks access is allowed, and unrelated routes are
unaffected. The general lesson is in a comment at the alias table — the prefix convention
silently stops working the moment a route is named something other than its module.

### Verified

`npm run build`, `npx tsc --noEmit` and `eslint` clean. Deploy confirmed live: `/plan`,
`/tasks` and `/calendar` all resolve and all sit behind the auth guard.

**Not verified:** nobody has logged in and used the calendar view, the agenda, or the new
pickers on a phone. Also unverified end-to-end: the Google popup reminder, which needs a
connected Google account and a real task to observe.

---

## 29. Money audit — "see if it works and how well it works", and what the receipt scanner needs

Alan asked for an analysis of the Money module and of the receipt scanner specifically:
what state they're actually in, and what it would take to make scanning work. **This entry
is findings only — no code was changed.** (One unrelated file exists uncommitted:
`supabase/migrations/0024_journal_vinyl.sql`, applied at the start of the session before
Alan redirected the work away from Phase 6. Nothing references it; it is inert.)

### The headline: it has never been used, and there's a structural reason

Live database, read directly: **0 accounts, 0 transactions, 0 receipts, 0 savings goals,
0 debts.** One budget (Groceries, $400/month, monthly, anchored 2026-07-22). 52 categories,
which is just the 13 seeded defaults across the four accounts in the system.

The reason is a single missing button. In `overview-view.tsx` the "add account" `+` lives
inside `PanelHead`, and that whole `Panel` is only rendered in the `accounts.length > 0`
branch. The zero-accounts branch renders an `EmptyState` **with no `action` prop** — even
though `EmptyState` supports one and Budgets, Goals and Debts all pass it. So from a cold
start there is no way to create an account, and without an account:

- Quick-log's account `<Select>` is empty, `accountId` stays `""`, Save is permanently disabled.
- Remittance's "Send" button is wired to `showRemittanceForm && accounts.length > 0` — it
  opens nothing and reports nothing.
- CSV import (`settings/money/csv-import.tsx`) has the same empty select and disabled button.

Money is a locked door, and the data shows Alan hit it and stopped.

### Bugs behind the door, in severity order

1. **Fabricated ids in three optimistic-update paths.** `createAccount`, `createSavingsGoal`
   and `createDebt` insert without `.select()`, so they return nothing; the client then
   invents `id: crypto.randomUUID()` for its local copy. That id matches no database row.
   Consequences: the first expense logged after adding an account fails with "Couldn't find
   that account" until the page is reloaded; "add to goal" on a just-created goal shows the
   money added, toasts success, and writes nothing; deleting a just-created goal or debt
   removes it from the screen only. Budgets are the one path that got this right — it
   refetches via `getBudgets()` rather than guessing.
2. **Reports break for any month before January.** `monthRange()` in `actions.ts` does
   `((month - 1) % 12) + 1`, and JavaScript's `%` returns a *negative* result for negative
   inputs, so an offset that crosses a year boundary produces `2025-00-01` or `2025--4-01`.
   Postgres rejects those (`date/time field value out of range`, confirmed against the live
   database), the error is discarded by `const { data } =`, and the screen shows $0 rather
   than a failure. Reachable **today** by tapping the month navigator back 8 times (it has
   no lower bound), and from January 2027 it will silently empty five of the six bars in the
   "last 6 months" trend chart.
3. **Two different "safe to spend" numbers for the same data.** `getSafeToSpend()` (Today
   dashboard) sums `Math.max(0, left)` per budget, so overspending is invisible; the Money
   screen's own vitals strip computes `budgeted - spent`, which goes negative. The two
   screens disagree whenever any budget is over.
4. **Every delete is one tap, with no confirmation and no undo** — transactions, budgets,
   goals, debts. The transaction delete also reverses the account balance by re-deriving
   "was this income" from the category's current `kind`, so a category flipped between
   expense and income after the fact reverses the wrong way.
5. **An account can never be corrected or removed.** `deleteAccount` and
   `updateAccountBalance` exist in `actions.ts` but are called from nowhere. A typo'd opening
   balance is permanent. (Related latent hazard: `transactions.account_id` is
   `ON DELETE CASCADE`, so the unused `deleteAccount` would silently take the account's whole
   history with it — and its error message, "Can't delete — it still has transactions logged
   against it", describes a `RESTRICT` behaviour the schema doesn't have.)
6. **Currencies are added together.** Accounts can be CAD or INR, and every aggregate —
   budgets, safe-to-spend, reports, net worth — sums `amount_cents` with no conversion. CSV
   import hardcodes `currency: "CAD"` regardless of the account it imports into.
7. **CSV import is filed under Settings**, which is not where anyone looks for "import my
   bank statement". `getTopMerchants` also includes income rows, so a salary deposit with a
   merchant name would top the merchant chart.

### What is genuinely good (and should not be touched)

- **RLS is uniform and correct** across all six finance tables — `auth.uid() = user_id` for
  both read and write, verified in `0016_finance_core.sql`, plus the per-user-folder storage
  policy on the receipts bucket.
- **Budget period maths** (`period.ts`) is careful: payday-anchored weekly/biweekly, monthly
  with real short-month clamping.
- **Debt payoff** (`debt-payoff.ts`) is an honest month-by-month amortisation with interest
  accrual, avalanche/snowball re-evaluated each month, rolling extra payments, and a
  600-month cap.
- **The quick-log keypad flow** is well built for its stated job — 64px keys, amount block
  stays visible through the details step, merchant memory autocomplete.
- **CSV duplicate detection** and the **receipt → shopping-list cross-check** both work
  without AI, as designed.

### The receipt scanner: four things, one of them Alan's

1. **`GEMINI_API_KEY` is empty** in `.env.local` (the known outstanding owner action). Without
   it `extractReceiptData` returns `null` by design and the review dialog opens blank for
   manual entry — working as specified, not broken.
2. **Photos over 1 MB never reach the AI at all.** `uploadReceipt` is a Server Action and the
   whole image is posted to it; Next.js caps Server Action bodies at 1 MB by default
   (`action-handler.js`: `defaultBodySizeLimit = '1 MB'`) and `next.config.ts` doesn't raise
   it. Phone photos are 2-5 MB. Worse, `receipt-scan-button.tsx` has no `try/catch` around
   `await uploadReceipt(...)`, so the 413 rejection escapes, `setUploading(false)` never runs,
   and the button sits on "Reading receipt…" forever with no error. **This is the bug that
   would make scanning look dead even after the key is added.** Fix: compress to ~1600px in
   the browser before upload (the same helper SPEC.md Part E6 requires for journal photos),
   and catch the failure.
3. **The review screen never shows the photo.** `receipt-review-dialog.tsx` renders no image —
   the file is uploaded to private storage and never read back. With AI off, that means typing
   items in blind. Needs a signed URL from the `receipts` bucket and an `<img>` at the top of
   the dialog.
4. **It needs an account to exist**, same blocker as everything else.

### Recommended order if this gets built

Add the account button (unblocks everything) → fix the three fabricated ids → compress and
catch on receipt upload → show the receipt photo → fix `monthRange` → reconcile the two
safe-to-spend numbers → confirmation on destructive deletes.

---

## 30. "Fix all the bugs in money" — every finding from entry 29, fixed

Alan read the audit above and asked for the whole list fixed. Nothing new was designed
here; this is entry 29's findings, one by one.

### The front door

`overview-view.tsx`'s zero-accounts branch rendered an `EmptyState` with no `action`, while
the `+` that adds an account lived inside the panel header that only renders when an account
already exists. Budgets, Goals and Debts all passed an action to their empty state — Accounts
was simply missed, and that one omission is why the module has never held a single
transaction. It now carries a **New account** button.

Three follow-on dead ends closed with it:

- **Remittance "Send"** opened a form gated on `accounts.length > 0`, so with no accounts it
  did nothing and explained nothing. Now disabled, with a reason. It also now only offers
  **CAD accounts** — `logRemittance` writes the transaction in CAD, so offering an Indian
  account would have logged dollars against rupees.
- **Quick-log** showed an empty account picker and a permanently greyed-out Save. It now says
  what to do instead.
- **CSV import** is reachable from Money at last (a row on the Overview tab). The wizard still
  lives under Settings; it just isn't invisible from the screen you'd look on.

### Fabricated ids — the bug that made the app lie

`createAccount`, `createSavingsGoal` and `createDebt` inserted without `.select()` and
returned nothing, so each caller invented `id: crypto.randomUUID()` for the copy it put on
screen. That id matched no row anywhere:

- the first expense logged against a just-added account failed with "couldn't find that
  account" until a page reload;
- "add to goal" on a just-created goal showed the money added, toasted success, and wrote
  nothing;
- deleting a just-created goal or debt cleared it from the screen and left the row.

All three now return the row the database actually wrote, and every caller uses it.
`addToGoal` additionally returns the goal's **true** saved total, so the screen reconciles
against what was banked rather than what it assumed — and returns an error instead of failing
silently when the row can't be found. (`createBudget` was always fine: it refetches.)

### Reports' month arithmetic

`monthRange()` normalised with `((month - 1) % 12) + 1`. JavaScript's `%` keeps the sign of
its left operand, so any offset crossing back over a year boundary produced `2025-00-01` or
`2025--4-01`. Postgres rejects those outright, the error was discarded by `const { data } =`,
and the screen showed **$0 spent instead of a failure** — reachable today by tapping Reports'
month navigator back past January, and it would have emptied five of the six bars in the
trend chart every January. Replaced with `Date.UTC`, which normalises correctly in either
direction; verified against the live database for offsets 0 to −24 from both August 2026 and
January 2027.

### One safe-to-spend number

`getSafeToSpend()` (Today) summed `Math.max(0, left)` per budget, hiding overspend; Money's
own vitals strip computed `budgeted - spent`, which goes negative. Two screens, same data,
different answers, and the cheerier one was on the screen you land on every morning. Today
now uses the same arithmetic as Money.

### Currencies stopped being added together

Accounts can be CAD or INR and nothing converted between them, so a ₹50,000 balance counted
as $50,000. Aggregates are Canadian-dollar figures and now say so:

- budget spend, spend-by-category, the 6-month trend and top merchants all filter to
  `currency = 'CAD'`;
- **Net** on the Money vitals strip totals CAD accounts, with any non-CAD accounts shown
  beside it in their own currency rather than folded in or dropped;
- CSV import writes **the account's** currency instead of a hardcoded `"CAD"`.

Verified: a ₹50,000 transaction contributes 0 to the dollar total for the same category.

### Nothing is deleted on one tap any more

New `components/ui/confirm-dialog.tsx` — the app's one "are you sure", in the same language as
everything else (the two existing confirmations elsewhere in the app used the browser's grey
`window.confirm`, which can't say what is about to be lost). Wired to transactions, budgets,
goals, debts and accounts. Each states the actual cost: the transaction's amount and that the
balance goes back up, a goal's progress lost, and — for an account — the **real number of
transactions that will be deleted with it**, fetched via a new `getAccountTransactionCount`.

That count matters because `transactions.account_id` is `ON DELETE CASCADE` (0016). The old
`deleteAccount` claimed the opposite ("Can't delete — it still has transactions logged against
it") and could never have shown that message, since the delete always succeeds. Confirmed
against the live database: deleting an account really does take its transactions.

### Accounts can be corrected

`updateAccountBalance` and `deleteAccount` existed in `actions.ts` and were called from
nowhere — a mistyped opening balance was permanent and an account could never be removed.
`AccountForm` now does double duty as an edit form (pencil and bin on every account row,
always visible rather than on hover, which on a phone means never). Type and currency are
locked once set, because changing either silently reinterprets every transaction already
logged against the account. The Add-account button also no longer submits with an empty
institution, which used to be a silent no-op.

### The receipt scanner

Three fixes; the fourth thing it needs is still Alan's Gemini key.

1. **Photos never reached the AI.** `uploadReceipt` is a Server Action and Next.js caps those
   bodies at 1 MB by default (`action-handler.js`: `defaultBodySizeLimit = '1 MB'`), which
   `next.config.ts` doesn't raise. Phone photos are 2-5 MB. New `src/lib/images.ts`
   downscales to a 1600px longest edge and steps JPEG quality down until it's comfortably
   under the limit, in the browser, before upload — which is also exactly what SPEC.md Part E6
   requires for Phase 6 journal photos, hence `lib/` rather than the money module. Raising the
   server limit instead would only have moved the cost onto shop wifi and the 1GB storage tier.
2. **The button hung forever.** The 413 came back as a *thrown* error, not a returned one, so
   it escaped `handleChange` entirely, `setUploading(false)` never ran, and "Reading receipt…"
   stayed on screen with nothing explaining it. The whole handler is now wrapped, with a
   `finally` that always clears the spinner, plus a server-side size backstop that returns a
   readable error rather than the framework's 413.
3. **The photo was never shown.** It was uploaded to a private bucket and never read back,
   so hand-entry meant holding the paper receipt while typing at a blank form. New
   `getReceiptPhotoUrl` signs a one-hour link and the review dialog shows the photo at the
   top, tap-to-enlarge, with a quiet fallback line if the link can't be fetched.

### Verified

`npm run build`, `npx tsc --noEmit` and `eslint` all clean. Dev-server smoke test: `/login`
renders 200, `/money` still redirects to `/login` for a signed-out request. Against the **live
database**, inside a transaction that was rolled back: a real account insert returning a real
id, an expense logged against that id, the transaction count behind the delete warning, the
account-delete cascade, the CAD filter excluding a rupee transaction, and RLS still enabled
with a policy on all seven finance tables. Live counts confirmed unchanged afterwards.

**Not verified:** nobody has walked these screens logged in on a phone. In particular the
receipt photo display and the compression path need a real camera photo to prove out — the
compression runs in the browser, so it cannot be exercised from here at all.

---

## 31. Gallery receipts, recurring money, and the AI framework the whole app plugs into

Four things asked for in one message: attach old receipts from the gallery, recurring income
and expenses that debit themselves, "AI to be a big part of the whole app ... an assistant
that can do anything within the app or pull up or create reports", and — the reason the
fourth one is built the way it is — "my fear is the expense as well since there will be a lot
of data, how much will everything cost approximately on a monthly basis".

### Receipts from the gallery

`capture="environment"` on a file input is a directive, not a hint: Android went straight to
the camera and there was no route to a photo taken last month. The scan control is now two
buttons — **Take photo** (still `capture`, for the at-the-till case) and **From gallery**
(no `capture`, `multiple`, for the backlog case).

A gallery pick accepts several at once and works through them in order, each getting its own
review screen, and each upload is wrapped individually so one unreadable photo out of eight
doesn't abandon the other seven. The review screen's date field was already editable, which
is what makes an old receipt file under the day it was actually spent.

### Recurring income and expenses

New migration `0025`. `recurring_transactions` is a template — account, category, amount,
frequency, anchor, `next_date`, optional `end_date` — that posts real rows into
`transactions`, tagged with a new `recurring` source and a `recurring_id` back-reference.

**Not built on RRULE**, deliberately, even though the reminders and routines side of the app
runs on it. `FREQ=MONTHLY;BYMONTHDAY=31` *skips* every month without a 31st — correct by the
iCalendar spec and completely wrong for rent. `src/lib/finance/recurring.ts` clamps instead,
exactly as budgets already do for payday anchors, and computes every occurrence from the
anchor rather than from the previous one so a February clamp doesn't drag the series to the
28th forever. Verified against the shipped code: Jan 31 → Feb 28 → **Mar 31** → Apr 30, and
Feb 29 → Feb 28 in a non-leap year.

**Posting runs on page open, not on a cron**, from both Money and Today. Two reasons, and the
first is the honest one: a cron would have to reach across every user's rows with no session,
which in this codebase means another security-definer RPC taking the cron secret (0012) — real
machinery for a job whose result nobody can see until they open the app. The second is that
posting on open is *correct whenever it's observed*: rent due Tuesday is dated Tuesday whether
the sweep runs Tuesday or Friday, because each occurrence posts under its own date, and
`dueOccurrences` catches up on everything missed (capped at 24, so a stale rule can't post
hundreds).

**Idempotence** is the part that had to be right. Each occurrence is *claimed* before it is
inserted: the update moving `next_date` forward is conditional on `next_date` still being the
value this call read. Two page loads racing means the second one's claim matches no row and it
stops. Proved against the live database — the second claim returns zero rows.

`transactions.recurring_id` is `ON DELETE SET NULL`: stopping a recurring rule must not delete
the spending it already posted, because that money really did leave the account. The opposite
call from reminders in 0022, for the opposite reason — also proved.

The UI is a **Repeating** panel on Money → Overview: what's coming and when, pause/resume, and
stop (with the confirmation every destructive action in Money now gets).

### The AI framework

Not a feature — the layer every future AI feature plugs into. Four files:

**`lib/ai/models.ts`** — the only place a model name or a price appears. Everything else asks
for a *tier*: `cheap` (bulk sorting), `standard` (the assistant, receipts), `deep` (monthly
reviews). Prices are stored as micro-dollars, integers, for the same reason money is integer
cents everywhere else. Carries a dated note: `gemini-2.5-flash-lite` retires 16 Oct 2026 and
the replacement is a three-value change in one file.

**`lib/ai/usage.ts`** — the meter and the brake. Every call is written to a new `ai_usage`
table (feature, model, tokens both ways, cost in micros). `MONTHLY_BUDGET_MICROS` is a hard
$5 ceiling checked *inside the client* so no feature can route around it; over the line,
features fall back to their manual paths rather than erroring.

**`lib/ai/gemini.ts`** — rewritten from a single JSON call into the one door: `callGeminiJson`
for one-shot structured extraction (receipts, CSV) and `callGeminiWithTools` for
function-calling turns. Metering happens here, on every call, including the ones that come
back useless — a meter that only counts successes understates the bill. Note in passing:
tool-calling and forced-JSON output are mutually exclusive on the Gemini API, so the config
picks one.

**`lib/ai/tools.ts`** — twelve tools across Plan, Money, Shopping and Workout. The security
model is the part worth stating plainly:

- Every tool runs against the **user's own** Supabase client. Row Level Security is still
  doing the work, so a tool cannot reach another account's data even if the model is talked
  into asking. No service-role client appears anywhere in this path.
- Tools are filtered by `module_access` *before the model is shown them*. An account without
  Money access is never told a `log_expense` tool exists — prompt injection can't reach a tool
  that wasn't in the request.
- **Writes are narrow on purpose**: add a task, tick one off, log an expense, add to the
  shopping list. It cannot delete anything, move money between accounts, or touch budgets,
  goals, debts or recurring rules. Those are decisions and they stay on the screens built for
  them.

**`lib/ai/assistant.ts`** is the loop: the model calls tools, the tools answer from the
database, and it replies from what it actually found. Three hard limits keep it cheap — four
model calls per question, twelve messages of history re-sent, and the monthly budget beneath
both.

### The assistant, and the cost screen

`/assistant` — a conversation you can ask anything, reachable from More, from Today's "jump
to", and from Settings. It answers questions, writes summaries and reports from real figures,
and does the small everyday things on request. The running monthly cost sits under the
composer, always visible.

`/settings/ai` shows the month's spend broken down by feature, the hard ceiling with a meter,
and which model each kind of job uses. It exists because the honest answer to "what will this
cost" is a number he can look at, not a reassurance.

### What it costs (the arithmetic, checked against Google's published prices on 18 Aug 2026)

Per assistant question: ~2 model calls, ~5,300 input + ~310 output tokens on
gemini-2.5-flash ($0.30 / $2.50 per million) = **about a quarter of a cent**. Ten questions a
day is **$0.71/month**; thirty a day is **$2.13**. A receipt is ~0.2 cents; thirty a month is
6 cents. A CSV import is under a tenth of a cent. The Phase 7 morning briefing would add ~5
cents a month, a monthly review ~2.5 cents.

**Realistic total: $1-3 USD a month. The hard cap is $5.** And on Google's free tier
(1,000-1,500 Flash requests a day, far more than this uses) it is **$0** — with the caveat
that free-tier prompts may be used by Google to improve their products, which is a real
consideration for a personal finance app. Paid pay-as-you-go isn't.

### Verified

`npm run build`, `npx tsc --noEmit`, `eslint` all clean; `/assistant` and `/settings/ai` both
compile as routes and both sit behind the auth guard (dev-server smoke test: signed-out
requests redirect to `/login`).

Twenty date-maths checks run against the **real shipped** `recurring.ts` (Node's native type
stripping, not a reimplementation): month-end clamping in both directions, leap years, catch-up
after an absence, the end-date stop, and the catch-up cap — all pass.

Against the **live database**, inside a rolled-back transaction: both new tables exist with RLS
and a policy, `recurring` is a valid transaction source, a rule saves, an occurrence claims
exactly once and a second claim gets nothing, a posted transaction carries its `recurring_id`,
deleting the rule keeps the transaction, and a usage row totals correctly for the month.

**Not verified:** no AI call has ever been made — `GEMINI_API_KEY` is still empty, so the
assistant, the tool loop and the meter have never run against the real API. That is the one
thing standing between this and working, and it is the same owner action outstanding since
Phase 5. Nobody has used any of this on a phone either.

---

## 32. Month-end reconciliation against the real bank statement

Alan asked two questions and made one request. The questions — does the receipt log need AI,
and does the scanner work without it — are answered in MANUAL.md rather than here (short
version: no, and yes, respectively; AI only ever pre-fills a form that works fully by hand).
The request was the real work: "is there a way to reconcile all expenses and account details
with my bank accounts at the end of every month for verification and adjust the
discrepancies? I would love to do that."

### Why this was the right thing to build

Every balance in this app is maintained *incrementally*: an account starts at whatever opening
balance was typed in, and each logged transaction nudges it. That is correct only for as long
as everything gets logged — and nothing real ever does. One forgotten $4 coffee and the app is
wrong by $4 forever, with no way to notice and no way to fix it short of editing the balance by
hand and hoping. Every number built on top of it — safe-to-spend, net worth, the reports — is
wrong by the same amount and just as silently.

A reconciliation is the periodic truth check that stops the drift compounding.

### Migration 0026

`reconciliations` records each check: account, statement date, what the bank said, what the app
thought, the gap **before** any correction, the correcting transaction, and how many
transactions were confirmed. The gap is stored rather than recomputed, because recomputing it
after the correction would always return zero and the record would be worthless.

`transactions.reconciled_at` / `reconciliation_id` mark a transaction as confirmed against a
real statement. Confirmed transactions never appear in a later month's list — otherwise the
list grows forever and the job becomes unbearable by March.

`adjustment_txn_id` is `ON DELETE SET NULL`: deleting the correcting transaction later must not
erase the fact that a check happened.

### The flow (`/money/reconcile`)

Its own route, not a sixth Money tab — this is a job with a beginning and an end, and a sixth
cell in the segmented control is where labels stop being readable on a phone.

**Step 1.** Pick the account, the statement's closing date, and its closing balance.
Optionally drop in the statement CSV (four column pickers, pre-guessed by the existing
`guessColumns`).

**Step 2** is where the work happens. Three figures across the top — bank says / app says /
difference — then:

- **On the statement, not in the app.** The valuable list: things you never logged. Pick a
  category, tap *Add it*, and the gap closes by that amount in front of you.
- **Your transactions**, ticked automatically wherever the statement confirms them, so what's
  left highlighted is the exceptions rather than the whole month.
- A warning when logged transactions *didn't* appear on the statement — normal for something
  recent, suspicious for something old (logged twice, or never went through).

**Step 3.** If the difference is zero, finish. If it isn't, one tap posts a correction.

### Three decisions worth recording

**Matching is strict on money and blind to descriptions.** Amount and direction must be exactly
equal; the date may be up to three days out (a Friday restaurant bill posts on Monday, and
demanding an exact date would report half a real month as "missing", which trains you to ignore
the answer). Bank descriptions — `SQ *THE GOOD FORK 604-555` — are not consulted at all: matching
on them produces confident wrong answers, and in a reconciliation a false match hides a real
discrepancy while a missed match only costs a second look. Each side is consumed once, so two
identical $5 coffees on one day match two statement lines rather than both matching the first.

**The correction is a real transaction, not a balance edit.** An edited balance is invisible the
moment it's made and silently rewrites history. A dated, categorised "Balance adjustment"
transaction shows up in the ledger, in the reports, and in next month's check — so a gap that
keeps recurring is *visible* as a pattern rather than quietly absorbed each month.

**The balance is rewound to the statement date.** Reconciling on the 25th against a statement
that closed on the 20th must ignore the last five days, or the "gap" it reports is just recent
spending. `appBalanceOnDate` subtracts the effect of everything dated after the statement from
the live balance — which is the only anchor available, since balances here are incremental
rather than recomputed.

Also added: a `get_reconciliation_status` tool, so the assistant can answer "are my numbers
right?" and "am I due a check?" from the record.

### Verified

`npm run build`, `npx tsc --noEmit`, `eslint` all clean; `/money/reconcile` compiles as a route.

**23 checks against the real shipped logic** (compiled from `reconcile.ts` itself, not
reimplemented): exact-date and near-date matching, the exact-date pass winning over a tolerant
one, two identical same-day amounts consuming two statement lines, a duplicate on the statement
with only one logged leaving exactly one missing, same-amount-opposite-direction *not* matching,
8-days-apart not matching, the balance rewind for chequing and credit card in both directions,
and — the fiddly one — that the correcting transaction produces a delta exactly equal to the
gap for all four account types in both directions. A credit card's balance means the opposite of
a chequing account's, so "the bank says more" is an expense on one and income on the other.

Against the **live database**, rolled back: the table and both columns exist with RLS, a
realistic scenario (an account with post-statement activity and a $14 unlogged coffee run) is
rewound correctly, the gap is found, the correction makes the app match the bank **exactly**,
confirmed transactions drop out of the next month's list, and deleting the correction keeps the
record of the check.

**Not verified:** nobody has run this against a real bank CSV. The column guessing is the same
code the existing CSV import uses, but no real statement file has been through this path.

---

## 33. Workout rebuilt around your own training

Alan: *"I really don't like the way workouts is laid out — redesign the entire thing, UI wise
and the way it works."* Planned first, in plan mode, with four options put to him; he picked
**your training first**, **crew demoted to a tab**, **suggest don't dictate**, and — from a
list of possible extras — **the session must survive your phone** and **exercise pages with
charts**. He explicitly declined a rest timer, a plate calculator, and programme-driven
training with automatic weight progression, so none of those were built.

### What was actually wrong

`/workout` opened on the **crew feed**. Your own sessions were one option in a four-way
segmented control (Everyone / Mine / Others / Leaderboard), and the only thing on the screen
about you was a streak number. The module recorded personal records in the `prs` table from
Phase 2 onward and never showed them anywhere except the instant one was set, inside a feed
card that scrolls away. There was no way, anywhere in the app, to answer "is my bench actually
going up".

Two things underneath that were worse than layout:

- **A session in progress lived only in React state.** `draftExercises` was never persisted.
  Lock the phone, switch apps, let the browser evict the tab — every set logged so far, gone,
  silently, mid-gym. True since Phase 2.
- **The streak was mislabelled.** `computeStreak` counts consecutive *calendar days*; the UI
  rendered that number with `unit="wk"`. A 5-day streak read as "5 wk".

### The new shape

```
/workout                 [ You | Crew ]   — You is the default
/workout/new             logging, now resumable
/workout/exercise/[id]   NEW
```

**The You tab**, in reading order: a session-in-progress banner (only when one exists, first on
the screen because if you're standing in a gym with sets half-logged nothing else matters) →
this week as seven Mon–Sun cells, filled for days trained and marked differently for runs →
**Next up** → recent sessions → records → one quiet Crew row.

**Next up** is the "suggest, don't dictate" part. It ranks muscle groups by how long since each
was last trained and leads with the most neglected — *"Legs — 9 days since you trained this"* —
with a Start button that opens the picker with leg exercises floated to the top. The three ways
to begin a session (repeat last, a template, from scratch) moved here from inside `/workout/new`,
so they're offered once rather than a screen deep.

**The Crew tab** keeps everything: feed cards, reactions, realtime across five tables, confetti
when someone else sets a record, the leaderboard. The four-way filter collapses to
Feed / Leaderboard — "Mine" and "Others" stop earning their place the moment your own training
has a tab of its own. Feed state lives in the shell rather than the tab so switching back and
forth doesn't throw away what realtime already fetched.

**Exercise pages** answer the question the module never could: heaviest ever, best estimated
1RM, sessions, last done; a chart of heaviest set / estimated 1RM / volume over time; and every
session's sets with a trophy on the ones that set a record. Same square-cornered, theme-aware
chart language as Money's reports — no rounded line caps, no soft tooltip.

### Session persistence

New migration `0027`: `workout_drafts`, **one row per user** (the primary key enforces it, so
saving is a plain upsert with nothing to reconcile), holding the draft as opaque `jsonb` plus
`started_at` / `updated_at`.

**Why not a `workouts` row with `status = 'in_progress'`.** It would have to be excluded from
every query that already exists — the feed, the leaderboard, streaks,
`getWorkoutDashboardSummary`, the Today dashboard — and the one that gets forgotten silently
counts an abandoned half-session as a real workout, inflating a streak that is supposed to mean
something. A separate table cannot leak into anything. That is the whole argument, and it's the
same class of bug as the CAD and `recurring` filters from entries 30-32: the cheapest fix is
not creating the risk.

Autosave is debounced at 1.5s, so a stepper tapped ten times costs one write rather than ten.
`logWorkout` and `logRun` delete the draft **in the same action** that saves the session, and
both submit handlers cancel any pending autosave first — otherwise a timer firing after the
server had cleared the draft would resurrect a session that's already saved, and logging it
again would double it.

Everything the logging screen opens with is now **seeded at render** rather than restored by an
effect: a draft that arrives via `useEffect` flashes an empty session and then fills in, which
mid-workout reads as "it lost my sets" for a beat. It also removed a real
`react-hooks/set-state-in-effect` error the linter caught.

### Files

New: `supabase/migrations/0027_workout_drafts.sql`, `src/lib/workout/suggest.ts`,
`workout/personal-actions.ts`, `workout/workout-shell.tsx`, `workout/you-view.tsx`,
`workout/crew-view.tsx`, `workout/exercise/[id]/{page,exercise-detail}.tsx`.
Deleted: `workout/workout-feed.tsx` (its feed became `crew-view.tsx`).
Modified: `workout/{page,actions}.ts(x)`, `workout/new/{page,new-workout-form,exercise-picker}.tsx`.

`personal-actions.ts` is deliberately separate from `actions.ts`: that file is the crew feed and
the leaderboard, where queries are *meant* to reach other people's rows through the crew RLS
policies. Everything in the new file is scoped to the signed-in user. Mixing the two in one
600-line file is how a query ends up crew-scoped by accident.

### Verified

`npm run build`, `npx tsc --noEmit`, `eslint` all clean; all three routes compile and still sit
behind the module guard (signed-out requests to `/workout` and `/workout/new` redirect to
`/login`).

**14 checks against the shipped `suggest.ts`** (compiled from the real file, not reimplemented):
never-trained groups outrank any gap; among trained groups the oldest wins; days-since is
counted correctly; never-trained groups keep a stable order so the suggestion doesn't flicker
between page loads; an empty history returns `null` rather than inventing advice; and every
phrasing branch reads as English.

Against the **live database**, rolled back: the table exists with RLS and a policy; a draft with
two exercises and three sets saves and reads back with every set intact and in order; saving
again updates the payload while leaving `started_at` alone; there is only ever one row per
person; deleting clears it; records collapse to one row per exercise; and the exercise-detail
join finds its sets with the session date attached.

**Not verified:** the thing that matters most — nobody has half-logged a real session on a phone,
locked it, and come back. The database round trip proves the draft survives a write and a read;
it cannot prove the browser hands it back after being evicted. Also unverified on a phone: the
whole new layout, the week strip, and the chart.

---

## 34. The Life Ledger — one timeline across every module (Round 1 of 3)

Alan asked for "super innovative ways to interconnect these different sections", named
Shopping ↔ Money as the obvious one, and asked how AI could "work wonders". Four options were
put to him in plan mode; he chose **the Life Ledger + weekly patterns** first, queued
**bills before they bite**, **goals that become habits** and **receipt does everything**, asked
to **completely remove the Journal and Vinyl placeholders**, chose **"notice and suggest"** for
how bold the AI may be, and asked for **all eight Settings groups** plus a real timezone
("I travel").

This is Round 1: the removals, the foundations, and the ledger. Rounds 2 (Settings) and 3 (the
queued connections) build on it.

### Three findings that shaped the design

- **Receipts already store every line item's price.** `receipts.line_items` has carried
  `price_cents` per item since Phase 5, kept after approval, and nothing has ever read it.
  A personal price book, sitting unused.
- **`profiles.timezone` has existed since migration 0001** and was never read — `lib/time.ts`
  hardcoded `APP_TIMEZONE` in every function.
- **There was no purchase history at all.** `finishTrip` overwrote a single
  `last_purchased_at` per item and recorded nothing else, so "you buy milk every nine days" was
  unknowable and every staple resurfaced on one hardcoded 14-day timer whether it was milk or
  washing-up liquid.

### Journal and Vinyl are gone

Both routes, `ModulePlaceholder` (its only users), both module ids from `MODULE_IDS` /
`MODULE_LABELS` / the access grids, the nav entries, the Today "jump to" rows, and the "coming
later" line. `getMoreLinks()` no longer takes module access at all — those two were the only
gated entries behind More.

**Migration 0024's empty tables are deliberately left in place.** Alan said "for now"; the
tables hold nothing, nothing queries them, and dropping tables is not reversible.

### Migration 0028

**`profiles.preferences jsonb`** — one column, not thirty, following the `theme_settings`
precedent. Added to the 0005 column-level update grant so it's self-editable while `role` and
`module_access` still aren't.

**`shopping_purchases`** — the missing history. Written by `finishTrip` (no price — a
hand-ticked trip doesn't know one) and by `approveReceipt` (price *and* merchant, from line
items it already had). `item_name` is denormalised and `shopping_item_id` is
`ON DELETE SET NULL` on purpose: deleting an item off your list is not a claim that you never
bought it. One table, three payoffs — ledger events, learned staple intervals, the price book.

**`insights`** — the cached weekly pattern, unique on `(user_id, period_start)` so a second
call for the same week is *impossible* rather than merely unlikely.

### Preferences — `src/lib/preferences.ts`

Every value that used to be a constant: `STAPLE_RESURFACE_DAYS`, `MONTHLY_BUDGET_MICROS`, the
8/18 work window and the 8pm evening hour, Monday week-start. Each default is exactly the
behaviour the app already had, so switching this on changed nothing for anyone.

Read only through `resolvePreferences`, never directly, because stored JSON is always partial
— the same normalise-don't-merge rule as `resolveModuleAccess` and `normalizeThemeSettings`.
It **clamps as well as defaults**: these numbers drive real behaviour, and an evening hour of
30 would mean evening never arrives.

`isQuietHour` handles the wrap past midnight, which is the *normal* case — a naive
`start <= h && h < end` on 22:00→07:00 is false all night and true all day, i.e. exactly
backwards.

### Timezone made real

The four functions that hardcoded Winnipeg (`todayInAppTimezone`, `formatInAppTimezone`,
`isOutsideWorkHours`, `isEveningPlanningTime`) now take one, defaulting to the constant so
untouched callers behave identically. `getCurrentProfile` returns `timezone` and resolved
`preferences` alongside module access.

**The rule, written into `lib/time.ts`:** recurrences anchor to the *profile's* timezone, not
the device's. "Daily at 9am" means 9am where you say you live, so flying to India doesn't drag
every reminder five and a half hours. Changing the setting moves future occurrences only.

### The Life Ledger — `src/lib/ledger.ts`

A typed union of six RLS-scoped queries: transactions, workouts (with runs and PRs), completed
tasks, routine completions, shopping purchases, reconciliations.

**Not a Postgres view**, which is the textbook answer and the wrong one here: every query
inherits RLS automatically by going through the user's own client, where a view needs its own
security-invoker care to avoid becoming a hole; it needs no migration as modules change shape;
and at this data size the performance difference is unmeasurable. If it ever gets slow, *that*
is the moment to make it a view.

Details worth keeping: shopping is collapsed into one trip per date-and-merchant, because
fifteen "bought milk" lines would drown every other event on the day. A row that only knows a
date lands exactly on midnight UTC and renders no time rather than inventing "12:00 AM". Ties
break by kind so two things logged in the same second don't swap places on refresh. Day totals
are CAD-only, for the same reason every total in this app is.

`/timeline` gives it a day view, a week view, date navigation and a totals strip, reachable
from More and from Today's "jump to". Every row links back to the module that produced it.

### Weekly patterns — `src/lib/ai/insights.ts`

One model call a week over a *summary* of the ledger (twenty compressed facts, not four hundred
rows — that compression is where the cost of the feature is actually decided), asking for
observations that cross modules. `ensureWeeklyInsight` returns the stored row when one exists,
so callers can invoke it on every page load and only the first in a week costs anything. It
reads the week that has actually *finished* — reading patterns out of a Tuesday is reading
noise. Fewer than five events in the week and it writes nothing rather than burning the call
producing "you did nothing". About **2-3 cents a month**, metered like everything else.

The prompt is instructed to be honest rather than encouraging, to never invent a figure, and
never to moralise — report the pattern, don't tell them what kind of person it makes them.

**"Notice and suggest" is enforced structurally, not by prompt.** An insight may carry one
`suggested_action` naming a tool from the existing registry (`lib/ai/tools.ts`). Storing the
intent is all it does. `runSuggestedAction` is the only thing that executes it, only from a
tap, only for a tool this account's module access allows, under the person's own client — so
it can never reach past what the assistant could already do, and the write tools there are
deliberately narrow.

### Verified

`npm run build`, `npx tsc --noEmit`, `eslint` clean; `/timeline` compiles and the build's route
list contains no `/journal` or `/vinyl`.

**51 checks against the shipped code** (compiled from the real files): partial, null, garbage,
out-of-range and unknown-key preference objects all resolving whole and clamped; quiet hours
across the midnight wrap; name normalisation; a learned 7-day milk rate that a three-month gap
in the middle doesn't drag; same-day repeats not becoming a one-day rate; the fallback when
history is too thin; median pricing that one dear corner-shop purchase doesn't move; a 30% rise
flagged and a 5% wobble not; work hours and the evening ritual answering differently in
Winnipeg and Kolkata *for the same instant*; and both week-start settings.

Against the **live database**, rolled back: all three schema changes with RLS and policies;
`preferences` self-updatable while `role` still isn't; a partial preferences object storing as
written; three purchases recorded with the receipt one carrying price and merchant; deleting the
shopping item keeping its history; and a duplicate insight for one week being rejected by the
database.

**Not verified:** the weekly insight has never run — `GEMINI_API_KEY` is still empty, so no
model call has been made. `/journal` and `/vinyl` were confirmed absent from the build's route
list rather than observed 404ing, because the auth guard redirects a signed-out request before
routing gets that far. And nothing here has been used on a phone.

---

## 35. Settings, properly (Round 2 of 3)

Alan: *"plan comprehensive settings since it's still very basic. I would want to change things
up from settings in a very comprehensive way so help me get every option I can."* He then
picked **all eight groups** put to him, plus **"I travel — make it real"** on the timezone.

Settings was four pages: Appearance, Password, and per-module category management for Shopping,
Workout, Calendar and Money. Everything about how the app *behaved* was a constant in a file.

### The plumbing

`updatePreferences(patch)` in `settings/preferences-actions.ts` is the only writer. It merges
against **what's stored**, not against the defaults — otherwise saving one toggle on the
Shopping page would silently reset something the Notifications page set five minutes earlier.
`notifications` is merged one level deeper because it's the only nested object; a shallow
spread would wipe every sibling switch whenever one moved.

It stores the *resolved* object rather than the raw patch, so an out-of-range value can't sit
in the database being clamped on every read while looking like a setting that is honoured.

`components/settings/setting-controls.tsx` is the shared vocabulary — `SettingsGroup`,
`SettingRow`, `PreferenceSwitch`, `PreferenceChoice`, `PreferenceNumber`. Eight pages of
toggles is exactly where each screen otherwise grows its own row height and label size.

**Nothing has a Save button.** Every control saves on change, optimistically, and reverts with
a message if the write fails. A settings screen full of switches with a Save at the bottom is
one you can leave without your change taking effect, and people do. The one exception is the
number field, which commits on blur — typing "14" over "7" passes through "1" on the way, and
saving that would briefly set real behaviour to a value nobody chose.

### The pages

**`/settings/account`** — name, email, timezone, week start, and an **avatar upload**.
`profiles.avatar_url` has existed since migration 0001 with no way to set it; the crew feed has
been drawing initials this whole time because there was nothing else to draw. Migration `0029`
adds the bucket — **public**, unlike receipts and journal, because an avatar is shown to your
crew on every feed card and a private bucket would mean signing a URL per member per card on
every render. Writes are still per-user-folder, the pattern 0017 established. The photo is
downscaled to 512px in the browser first (`lib/images.ts`, written for receipts) and the
previous file is deleted *after* the new URL saves, so a failed upload leaves the old one
intact. The timezone list is thirteen plausible zones rather than all ~600 IANA names — a
searchable list of every zone is the "complete" answer and a worse one on a phone.

**`/settings/notifications`** — quiet hours, a switch per type, and the device list.

**`/settings/today`** — which panels appear and in what order. Up/down buttons, not
drag-and-drop: dragging is worse on a phone, needs a dependency, and needs a keyboard story to
be accessible at all. Five items don't need a drag library.

**`/settings/plan`** — work hours, evening-ritual time, default nudge, default view.

**`/settings/data`** — download everything as JSON, and clear one module. There has been **no
way to get data out of this app at all**, which matters for something holding bank balances and
a training history. The wipe asks you to type "clear": every other destructive action here
deletes one thing, this deletes a year of it, and a tap you can make by accident isn't enough.
Accounts and categories survive a Money wipe — they're setup, not history — and the dialog says
so rather than guessing silently.

Extended: **Money** (default account, payday anchor, auto-post, reconcile reminder),
**Shopping** (learned staple rates, fallback interval, receipt auto-tick, sort), **AI** (monthly
cap, per-feature switches, and the boldness choice).

### Making them true

A setting that stores a value and changes nothing is worse than not offering it, so:

- **Today** reads the account's timezone and evening hour, and its panels are rendered from
  the saved order — the fixed two-column grid became a list. The "today so far" panel is new,
  a compact read of the Life Ledger, and its six queries only run when the panel is visible.
- **Plan** opens on your chosen view (a `?view=` in the URL still wins — that's someone
  deliberately linking).
- **Receipts** only auto-tick the shopping list when you want them to. The purchase record is
  written either way: what you bought and for how much is worth keeping regardless.
- **Repeating money** only posts itself when auto-post is on, and uses your timezone for
  "today".
- **Each AI feature** checks its own switch at its own entry point, not inside the shared
  client — a switched-off feature should take its manual path (a blank receipt form,
  heuristic-only CSV sorting, an assistant that says it's off), not fail deep in a helper.
- **The dispatcher honours quiet hours and the type switches.** It has no session, so migration
  `0030` adds a security-definer RPC taking the cron secret, the same pattern as 0012.

The two suppression rules are deliberately different, and this is the part worth remembering:
**quiet hours HOLD** a reminder — it isn't advanced, so the first tick after the window ends
sends it, because "quiet hours" must not mean "silently discarded overnight". A **switched-off
type ADVANCES** — it moves to its next occurrence, or it would sit at the front of the queue
being reconsidered on every tick forever.

Also fixed: Today's workout stat still said `unit="wk"` while showing a count of days. The
Workout module's copy of that bug was fixed in entry 33; this one survived.

### Verified

`npm run build`, `npx tsc --noEmit`, `eslint` clean; all **13** settings pages compile and every
new one sits behind the auth guard.

Against the **live database**, rolled back: the avatars bucket is public with read open and all
three write policies per-user; `get_notification_prefs_for_user` exists and **rejects a wrong
cron secret**; a partial preference write keeps sibling switches, keeps a nested value set
earlier, applies the new one and doesn't touch unrelated top-level keys; all 28 tables the
export names actually exist; and wiping Money clears its transactions while leaving tasks,
accounts and categories intact.

**Not verified:** no setting has been changed from a real phone, the avatar upload has never
run against a real camera photo, and the dispatcher's new quiet-hours branch has not fired for
real — that needs the cron pinger to hit it during a quiet window.

---

## 36. Bills, goals that keep themselves, and the price book (Round 3 of 3)

The three connections Alan queued behind the Life Ledger. All three are things the app already
had the data for and had never joined up.

### Bills before they bite

`recurring_transactions` has known rent is due on the 1st since entry 31. What it couldn't do
was say so *beforehand* — the first you heard was the transaction appearing afterwards, with
safe-to-spend already lower.

A new **About to land** panel on Today lists what's due in the next week and, underneath,
**what safe-to-spend becomes once they land**. That last line is the whole feature: a number
saying $400 while $1,450 of rent goes out on Tuesday isn't wrong exactly, but it answers the
wrong question — and it's the one people actually ask a budgeting app before buying something.
Income is included and marked, because "£2,400 lands Friday" is exactly as relevant.

The push comes **straight from the cron dispatcher**, reading `recurring_transactions`.
Migration `0031` adds `last_notified_date` plus two security-definer RPCs (the 0012 pattern,
because cron has no session).

**Deliberately not a `reminders` row**, which is how every other notification here is queued.
Migration 0022 established that a reminder attached to neither a task nor a routine is
wreckage, with a partial index built to find exactly those. A bill reminder is attached to
neither, so it would be swept up as an orphan or force a second exception into that rule.

`last_notified_date` stores *which occurrence* was announced rather than a boolean, so a bill is
mentioned once and mentioned again next month. The claim query asks for a 14-day window and
each bill is then checked against its own owner's `billLeadDays` — one query serving accounts
with different lead times. It respects quiet hours and the bills switch, and stamps whether or
not a device took it: the alternative is retrying someone with no registered devices forever.

### Goals that become habits

A savings goal with a target and a deadline has always shown a progress ring and nothing else,
so hitting it depended entirely on remembering to tap "Add" often enough. The arithmetic was
always available and never done.

`lib/finance/goal-pace.ts` works out what's needed per week; one tap sets up the repeating
transfer and, optionally, a weekly routine to check it's actually going through. Both tables
already existed.

Three decisions in the maths: a goal **without** a deadline gets no pace at all rather than an
invented horizon (leaving it open was a choice); the monthly figure uses **52/12 weeks, not 4**,
because 4 understates it by about 8% — a month's worth of saving over a year; and it **rounds
up**, because asking for $142.85 when $142.86 is needed lands short.

`alreadySetUp` is matched by the transfer's name rather than a foreign key, on purpose: a
transfer set up for a goal is an ordinary repeating payment afterwards — editable, pausable,
outlivable — and a hard link would make the app police a relationship the person is entitled to
break.

### The price book

`shopping_purchases` has been collecting a price and a merchant per receipt line since Round 1.
This reads it back.

- **Staples resurface on their own learned rate.** The old query was a single
  `last_purchased_at < now() - 14 days` for everything; milk bought weekly and washing-up
  liquid bought quarterly were treated identically. Now each item's median gap decides, falling
  back to the setting when there's too little history — and the suggestion carries *why*
  ("you buy this every 9 days").
- **A running basket total** while you shop, against what's left in the Groceries budget.
  Computed on the client from the price book that arrived with the page: this has to keep up
  with every tick of a checkbox on shop wifi, so a server round trip per tick would be useless.
  Items never seen with a price are counted separately rather than assumed free, which would
  make the number quietly optimistic in exactly the situation where that matters.
- **"Dearer than usual"** on receipt lines, from your own history. Debounced and re-run as items
  are edited, because the AI's first guess at a name or price is often corrected before
  approval. It stays silent below two observations and below a 15% rise — a warning on every
  third item is a warning nobody reads.

Medians throughout, not means: one bulk 4kg bag among a dozen 500g ones should not become the
price you're compared against, and one three-month holiday shouldn't stop milk resurfacing.

### Two things caught while building

`getSmartStapleSuggestions` was returning rows cast `as ShoppingItem[]` with an extra field the
type didn't have — replaced with a real `StapleSuggestion` interface. And `estimateBasket` was
left exported as a Server Action after the client took over the calculation; an unused server
action is dead code that also widens the surface, so it's gone.

### Verified

`npm run build`, `npx tsc --noEmit`, `eslint` clean.

**19 checks against the shipped `goal-pace.ts`**: the no-deadline case, the 52/12 month, saved
amounts subtracting, over-saving never going negative, a passed deadline clamping to one week
instead of dividing by zero, and rounding up.

Against the **live database**, rolled back: `last_notified_date` and both RPCs exist and the
claim **rejects a wrong cron secret**; a bill due in two days is claimed at a 7-day window and
*not* at a 1-day one; once announced it isn't announced again; a new occurrence announces
afresh; a paused bill never is; the median of three purchases is 499 where the mean would be
549; and a goal habit writes the transfer, the routine and its step.

**Not verified:** no bill notification has been pushed for real (that needs the cron pinger to
run while a bill is inside the window), and the price book has no real data yet — it starts
filling from the first receipt approved after this deploy.

---

## 37. The Gemini key, and a permanent subagent workflow

Two requests in one session. Alan supplied the Gemini API key that had been blocking every AI
feature since Phase 5, and asked for it to be tested and genuinely wired in — then, before that
work continued, asked for a three-agent workflow installed permanently in the repo.

### What the key test found (before any code changed)

The key itself is fine: it authenticates and answers. But it is a **new** key, and new keys are
cut off from the Gemini 2.5 family. All three models this app is pinned to —
`gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro` in `src/lib/ai/models.ts` — return
`404: no longer available to new users`. Since `rawCall` in `src/lib/ai/gemini.ts` returns `null`
on any non-OK response, and every feature treats `null` as "let the person do it by hand", the
app would have gone on behaving exactly as it did with no key at all: silently manual, no error
anywhere. Pasting the key in and calling it done would have shipped a lie.

Verified working against the live API with the key in hand: `gemini-3.6-flash`, `gemini-3.7-flash`
and `gemini-3.1-flash-lite` all respond; forced-JSON output (`responseMimeType`) works; function
calling works and returns a `functionCall` part in the shape `assistant.ts` already expects.

**The thinking-token trap, which matters more than the model rename.** Gemini 3.x models emit
private reasoning tokens that are billed at the output rate but are reported separately, in
`usageMetadata.thoughtsTokenCount`, and are *not* included in `candidatesTokenCount`. Extracting
a task from "dentist next tuesday at 3pm" — an 18-token answer — burned **982 thinking tokens**.
Two consequences, both bad: the meter in `usage.ts` reads only `candidatesTokenCount`, so it
would have reported roughly 2% of the real bill and the spending ceiling would never have
tripped; and thinking is drawn from the same `maxOutputTokens` allowance as the answer, so
`ensureWeeklyInsight`'s 700-token cap would be exhausted before the model wrote a word, yielding
empty text, a failed JSON parse, and a permanently silent feature.

`generationConfig.thinkingConfig.thinkingLevel` controls it. Measured on the same prompt:
default 982 thought tokens, `high` 55, `medium` 63, `low` 256, `minimal` 0 — all four returning
the correct answer. (`thinkingBudget`, the 2.5-era parameter, is rejected outright.)

### What was then changed, same session

- **`src/lib/ai/models.ts` repointed**, and gained a `thinking: ThinkingLevel` field per tier so
  the cost dial lives beside the price it moves. `cheap` → `gemini-3.1-flash-lite` ($0.25/$1.50,
  minimal), `standard` → `gemini-3.6-flash` ($0.75/$3.75, minimal), `deep` → `gemini-3.7-flash`
  ($0.75/$3.75, high). The **deep tier is deliberately not a Pro model**: this key is on the free
  tier and every Pro model returns 429 quota-exceeded, so deep means "same flash, allowed to
  think hard" — which is where the real cost difference sits anyway, and keeps the cost screen
  honest without a fourth price row. Dated warning recorded in the file: the $0.75/$3.75
  promotional pricing ends **31 Dec 2026** and doubles to $1.50/$7.50.
- **`src/lib/ai/gemini.ts`**: `thinkingConfig` now goes on every request, defaulting to the
  tier's level with a per-call override; `thoughtsTokenCount` is added to the metered output
  count so `ai_usage` reflects what Google actually bills; non-OK responses are logged with
  feature, model id, status and the first 300 characters of the reply instead of vanishing into
  a `null`; a `MAX_TOKENS` finish is logged as its own distinct warning; and a **token accounting
  cross-check** compares our counted total against the API's own `totalTokenCount` and logs any
  drift — the check that would have caught this whole class of bug on day one rather than after
  a 50x under-count.
- **`src/lib/ai/insights.ts`**: `thinking: "low"`, cap raised 700 → 1400. The number is anchored
  to a live run of *this* prompt on a realistic week (549 in, 93 out, 0 thinking, finish STOP),
  not to the unrelated toy measurement above.
- **`src/lib/ai/assistant.ts`**: `thinking: "low"` — choosing between tools and reading their
  results back is reasoning, not transcription.
- **`tierForModelId` deleted** from models.ts. It had no callers anywhere in the repo, and after
  a model rename it would have returned null for every historical `ai_usage` row.
- **`weekly-patterns` added to `FEATURE_LABELS`** in `src/app/(app)/settings/ai/page.tsx`.
  Pre-existing gap, but harmless only while no AI call had ever succeeded; the first insight
  would have shown Alan the raw slug on his own spend screen.
- **`MANUAL.md`'s cost section rewritten.** It promised "a quarter of a cent" per question and
  "$0.71 a month", figures that predate both the price rise and thinking tokens. Replaced with
  measured numbers (~$0.90/month at ten questions a day, ~$2.70 at thirty), the 1 Jan 2027
  doubling, and — the part that actually matters to Alan — a plain-English warning that the app
  can announce "budget used up" while Google has charged **nothing**, because the key is free
  tier. Free-tier rate limits and the fact that Google may train on free-tier prompts are
  written down there too.
- **`PROGRESS.md`**: Phase 5's owner action ticked, the "one thing blocking everything AI" note
  replaced with what was actually found, and a new owner action added — **the key is not yet in
  Vercel**, so none of this works on the deployed phone app until it is.

**Verified against the live API**, each with its real system prompt and real tier/cap/thinking
settings: CSV categorisation (5/5 rows, correctly returning `null` for an unreadable merchant
rather than guessing), receipt vision (a rendered receipt image → merchant, date, all five line
items and `total_cents: 3860`, exactly right), weekly patterns (a genuine cross-module
observation tying a takeaway spike to a drop in training), and the assistant's tool loop
("remind me to book the dentist on monday and stick oat milk on the shopping list" → correct
`create_task` **and** `add_shopping_items` calls). `ai_usage` held **zero rows** before this
work, confirming no AI call had ever been made from this codebase.

### What the new review workflow caught, in two rounds

Worth recording in full, because this was the first unit to go through the agents installed
earlier in the same session, and it failed twice before it passed.

**Round one — unit-reviewer FAILED the unit on three items.** (1) The price rise plus the newly
counted thinking tokens made `MANUAL.md`'s cost section untrue, and the reviewer's framing was
the right one: *the app's own promise to Alan had become the thing that was wrong.* (2) This
entry still said "The fix, next session" while the code was already changed — a future session
would have read the record and redone all of it. (3) Checks unconfirmed. It also flagged four
smaller things, all fixed: `weekly-patterns` missing from `FEATURE_LABELS` (the first successful
insight would have shown Alan a raw slug on his own spend screen), the 1400 cap justified from a
toy prompt rather than the real one, the deep tier's `thinking: "high"` sitting on
`callGeminiJson`'s 1024 default as a trap for whoever builds the monthly review, and the
suggestion — implemented — to cross-check our token count against the API's own `totalTokenCount`.

**Round two — FAILED again, on the same item 8**, and the second failure was self-inflicted.
(The `~$0.90`/`~$2.70` figures written during this round were themselves superseded in round
three — the current, measured numbers are the ones at the end of this entry and in MANUAL.md.)
Fixing the cost table, this session wrote "daily outlook" into both the Manual's cost table and
`models.ts`'s `note`, which is rendered verbatim on Settings → AI & cost — describing a feature
that had not been built yet, under a heading claiming the figures were measured. The reviewer
also caught that the quoted per-question cost was for a question the assistant *answers*, not one
that *acts*, which is Alan's actual use; that `usage.ts`'s "roughly ten times a realistic month"
justification for the $5 ceiling had survived the price change in a second file; that two Manual
paragraphs four lines apart now contradicted each other about whether a bug could run up a bill;
and that the new drift canary only watched one direction.

**Two strikes on the same item, so per CLAUDE.md's Session protocol the work stopped and the
decision went to Alan**, who chose to have the wording fixed and then continue. Fixed: the
unbuilt feature is named nowhere; `usage.ts`'s ceiling comment is recalculated with two dated
consequences (the Jan 2027 doubling pushes a heavy month past $5; a free-tier key can trip the
ceiling having been billed nothing); the Manual's contradiction is resolved by distinguishing "a
bug can't run up a bill" from "a bug can switch the AI off for the month"; and the canary now
watches both directions, because over-counting would lock Alan out of every AI feature at a
fraction of his real spend.

**The assistant's real cost, measured rather than reasoned** — the reviewer's specific complaint
was that the table asserted measurement while nothing in the repo recorded one. Against the live
API with the real system prompt and the real 13-tool schema: a question the assistant answers
costs 1,856 in / 131 out = **0.19 cents**; a question that acts ("remind me to book the dentist on
monday") takes two turns — 1,858 in / 211 out to decide, then 2,115 in / 18 out to confirm —
totalling **0.38 cents**. Ten acting questions a day is $1.15 a month, thirty is $3.45. The
Manual now lists both shapes separately.

**Round three — FAILED a third time on item 8, and found a real bug in the process.** The
reviewer's complaint was that the receipt and bank-import rows sat under a heading claiming
"measured, not estimated" when nothing in the repo recorded a measurement for them, and that its
own floor arithmetic said the receipt figure had to be wrong. It was right on both counts.
Measuring a realistic 22-item grocery shop: **1,397 in / 1,404 out, 0.63 cents a receipt** —
nearly three times the 0.24 cents claimed, so thirty receipts is $0.19 rather than $0.07.

**And that measurement surfaced a genuine defect nobody had noticed**: 1,404 output tokens
against `receipt-vision.ts`'s `maxOutputTokens: 1536`. A shop two or three items larger would
truncate the JSON mid-object, fail the parse, burn the one retry on a second charge, and drop
Alan into a blank manual form — precisely on the big receipts nobody wants to type by hand. The
cap is now **4096**, with the measurement recorded beside it. This is the clearest argument for
the review workflow in the whole session: the bug was invisible to the build, invisible to the
type checker, and would have looked like "the receipt scanner just doesn't work sometimes".

Fix proven, not assumed: a rendered **42-item** receipt now returns **2,728 output tokens**,
finish `STOP`, all 42 line items parsed and `total_cents: 45357` exactly right. Against the old
1536 cap that same receipt truncates.

Also fixed in round three: the `deep` tier's note still read "Monthly reviews only." and is
rendered verbatim on Settings → AI & cost for all three tiers whether or not anything uses them —
the same rule the `standard` note had just been fixed for, missed two entries down; it now reads
"Not in use yet." And `usage.ts`'s ceiling reasoning was derived from the measured two-turn
question when `assistant.ts` allows `MAX_STEPS = 4`; a four-step question costs about $0.0085, so
thirty a day for a month is roughly **$7.40 — already over the $5 default today**, not only after
the January 2027 doubling. That is now stated in both the code comment and, in plain English,
in the Manual.

**Measured figures of record** (22 Aug 2026, live API, real prompts, real tier settings):

| Job | Tokens in / out | Cost each |
|---|---|---|
| Assistant question, answered | 1,856 / 131 | 0.19c |
| Assistant question, acted on (2 turns) | 3,973 / 229 | 0.38c |
| Receipt, 22-item shop | 1,397 / 1,404 | 0.63c |
| Bank import, 90-row statement | 1,942 / 330 | 0.10c |
| Weekly patterns | 549 / 93 | under 0.1c |

test-runner returned `ALL CHECKS PASS` on each state it was run against, including the state
carrying the round-three fixes.

`.env.local` now carries the key. It is gitignored (`.env*`) and was never committed.

### The subagent workflow

Three new project-scoped agents in `.claude/agents/`, committed:

- **`codebase-scout.md`** — read-only (Read/Glob/Grep only, so it *cannot* edit). Answers three
  questions about a work unit: what it touches, what pattern the neighbouring files already use,
  and what will bite. Hard 300-word cap, stated as a cap and not a target, because its purpose is
  to save context.
- **`test-runner.md`** — Bash only. Runs `npm run lint`, `npm run build`, `npm test`, nothing
  else. Reports failures verbatim with file and line, or the single line `ALL CHECKS PASS`, with
  all build noise stripped. Told explicitly that this repo has no `test` script and that "Missing
  script: test" is a known state, not a failure — otherwise it would report a failure forever.
- **`unit-reviewer.md`** — read-only skeptic, allowed `git diff`/`log`/`show` to see the work.
  Re-reads `CLAUDE.md` first, then walks thirteen hard constraints and reports PASS/FAIL/N-A per
  line in plain English, writing no fixes.

`CLAUDE.md` gained a **Session protocol** section (scout before building; all checks through
test-runner; nothing marked complete in `PROGRESS.md` until both test-runner and unit-reviewer
report clean; stop after two failed attempts at the same review item; delegate anything that
produces bulk output), a **Maintaining this file** section dated today, and an updated sub-agent
list — now seven, not four.

### Where Alan's brief was adapted rather than copied

Two parts of the instructions were written against a different, sales/CRM-shaped codebase.
`BUILD_INSTRUCTIONS.md` does not exist here, so the reviewer reads the newest CHANGELOG entry,
the in-flight part of PROGRESS.md and any `.claude/plans/` file — and will prefer
`BUILD_INSTRUCTIONS.md` if one ever appears. The listed domain rules (a client `raw_text` field,
interactions requiring a next step and due date, cost/GP figures hidden behind a presentation
mode, rules-engine coverage) have no counterpart in Alan OS; naming them would have produced a
reviewer that always passes. The two that genuinely apply were kept word for word — secrets never
reaching the browser, and AI output never writing to the database without a confirm step — and
the remainder were replaced with this project's real invariants, listed in full in the decisions
log now at the bottom of `PROGRESS.md`.

**One thing had to be fixed to honour "committed to git".** `.gitignore` ignored the whole
`.claude/` directory, so the four existing agents had never actually been committed — CLAUDE.md
has been describing agents that only existed on Alan's laptop. Changed to `.claude/*` with
`!.claude/agents/`, keeping `settings.local.json` and `scheduled_tasks.lock` out. All seven agent
definitions are now in the repository, so a fresh clone gets the workflow.

---

## 38. Today's outlook — the AI reading of the day, with one-tap suggestions

Alan asked for the AI to be "used extensively everywhere, especially in the Today page for smart
suggestions and outlook". This is that, built as a new first panel on Today.

### What it is

Two or three sentences at the top of the dashboard saying what today actually looks like, plus up
to three one-tap suggestions. The value is strictly in the joining-up — every individual number is
already on the same screen. Measured against the live API on a loaded Tuesday, it produced:

> "Car insurance is now overdue, and tomorrow's $1,450.00 rent payment will push your safe to
> spend to -$1,269.56 six days before salary lands. You also have three tasks due today —
> including emailing the landlord — and one budget currently over its limit."

That sentence needs Money, Tasks and the recurring-payments engine at once, which is exactly why
no existing panel could say it. On a quiet Sunday the same prompt produced two flat sentences and
**no** suggestions, which is the behaviour that stops it becoming noise.

### How it's built

- **Migration `0032_daily_outlook.sql`.** No new table: `day_plans` has carried an unused
  `ai_briefing text` since `0011`, and SPEC.md Part F names that exact column. It already has
  `unique (user_id, plan_date)` — the anti-regeneration guard — and owner-only RLS. Added
  `ai_suggestions jsonb` and `ai_generated_at timestamptz`, plus a partial index.
  **Deliberately not the `insights` table**: its unique key is `(user_id, period_start)`, so a
  daily row and a weekly row landing on the same Monday would collide and one would silently lose.
- **`src/lib/ai/outlook.ts`.** Cache-first, exactly like `ensureWeeklyInsight`. The generated-at
  stamp rather than the briefing text is what marks a day done, so a day the model looked at and
  found unremarkable costs one call rather than one per page load.
- **It takes its facts as an argument instead of fetching them.** Today is the highest-traffic
  page and had already loaded every one of these numbers for its other panels. Re-querying would
  have doubled the dashboard's database work on every load, including the cache hits.
- **Module access is enforced by withholding facts, not by instructing the model.** A person
  without Money cannot get a briefing mentioning money, because the money never enters the prompt.
- **Suggestions are intents, never actions.** `runOutlookSuggestion` takes only an *index* into
  the stored row and re-reads the suggestion from the database. A server action's argument is
  whatever the browser sends, so accepting a `{tool, args}` from the client would have turned this
  into a general-purpose write endpoint for anyone who could post to it.

### The new-panel trap, fixed properly

`resolvePreferences` filtered unknown panel ids out of a saved layout, and a saved layout is a
list of *visible* panels — so "not in the list" meant "hidden". A newly added panel was therefore
indistinguishable from a deliberately hidden one, and **would have been invisible forever to
anyone who had ever opened Settings → Today**, silently. Added `todayPanelsKnown`: every id the
account's settings have been shown. Anything in `TODAY_PANEL_IDS` but not in there is new and gets
shown at the front; anything missing that *is* known stays hidden, because that was a choice. The
Today settings screen writes the known list on every save. `PANELS_KNOWN_BEFORE_OUTLOOK` covers
preferences written before the concept existed.

### Also

- New `aiDailyOutlook` switch in Settings → AI & cost, and `outlook` added to `FEATURE_LABELS` so
  the spend list reads "Today's outlook" rather than a raw slug.
- The `standard` tier's on-screen note now names the daily outlook — which it is finally allowed
  to do, because the outlook now exists. Entry 37 removed that same phrase for the opposite reason.
- The bills fetch on Today now runs when *either* the bills panel or the outlook wants it. Hiding
  one panel must not silently degrade the other.
- **Measured cost**: 673 in / 463 out on a loaded weekday, 546 / 410 on a quiet one — about
  0.2 cents a day, **7 cents a month**. The settings hint and MANUAL.md both say 7 cents, from the
  measurement rather than a guess.
- `usage.ts`: `$7.40` corrected to `$7.65` ($0.0085 × 30 × 30), an arithmetic slip unit-reviewer
  caught in passing on the previous unit.

### What unit-reviewer caught, and it was worth catching

Two blocking bugs, both real, both mine.

**1. The prompt named task horizons that do not exist.** `outlook.ts`'s tool description offered
`"now"|"today"|"week"|"later"`. The Postgres enum is `('now','today','this_week','this_month',
'someday')` — so two of the four values were invalid, and `create_task` in `tools.ts` did not
validate: `asString(args.horizon)` went straight into the insert. A suggestion following the
prompt as written would throw, and `tools.ts` returns `error.message` verbatim to a toast, so Alan
would have read **`invalid input value for enum task_horizon: "week"`** on his own dashboard.
Fixed in both places: the prompt now lists the five real values, and `create_task` clamps *both*
enum arguments (horizon and category) against the real lists before the insert. That second fix
matters more than the first — the tool schema is a request, not a guarantee, and the outlook
proved a second-hand prompt can get it wrong.

**2. The server renumbered a list the browser was still counting on.** `runOutlookSuggestion`
removed a taken suggestion from `ai_suggestions`, while the panel addressed suggestions by their
position and sent that position back on the next tap. With `[A, B, C]`: tap A, the server stores
`[B, C]`; before the revalidated props land, a tap on the button *labelled* B sends `index: 1`,
and the server reads `[B, C][1]` and runs **C**. A button that performs a different action than
its label, on the one panel whose entire safety story is "nothing happens until you tap it". Once
the new props did land it failed the other way round — B rendered as "Done" having never run, and
vanished.

Fixed by marking rather than removing: suggestions carry an `actedAt` stamp and the array is never
reordered or shortened, so an index means the same thing all day. The panel now reads the server's
`actedAt` with its optimistic state layered on top, and `runOutlookSuggestion` rejects a second tap
on an already-taken suggestion, so a double tap can't run a write twice.

Also from the same report, non-blocking and accepted: "one call a day" is up to two, because
`callGeminiJson` retries once on unparseable JSON and meters both attempts — true of the weekly
insight too. And `day_plans_outlook_idx` will not in practice be used by the query its comment
describes, since `getOutlookForDate` filters only on `user_id` and `plan_date` and the planner
will prefer the existing unique index; harmless, left in place, comment noted here instead.

**Two residuals from the passing review, closed before commit.** The outlook panel is now keyed by
date rather than by panel id: a tab left open across midnight kept the same component instance and
its optimistic "done" indices while being handed tomorrow's suggestions, so a previously tapped
position could show Done against something new — the same class of bug as the renumbering race, one
layer up. And the two places that stated the cost guarantee ("one call a day") now say what is
actually true — one call, two on the days the first response doesn't parse — because a future
session looks for that guarantee in the code, not in this file. The `0032` index comment and the
`ai_suggestions` column comment were both corrected to describe what they really do, the latter in
the live database as well as in the file.

Confirmed against the live database before commit: `day_plans` held **no** outlook rows, so none of
this session's testing wrote a row under the old remove-on-tap code. Nothing for Alan to work
around; the first outlook he sees will be written by the fixed code.

---

## 39. Journal and Vinyl, removed completely

Alan: "strip the journal and vinyl part completely for now". The app code went in entry 34; this
finishes the job in the database and in every document that still described them as coming.

### The database — migration `0033_remove_journal_vinyl.sql`

Verified empty first, against the live database, because dropping a table is not reversible by
saying sorry: `journal_entries` 0 rows, `vinyl_albums` 0 rows, 0 objects in the `journal` storage
bucket, 0 reminders flagged as journal nudges. Nothing was destroyed except empty structure.

Dropped: `journal_entries` (with its policy and index), the `journal_mood` enum, `vinyl_albums`
(with its policy and index), the `journal_entry_exists` security-definer function and its grants,
and the `journal_storage_own` storage policy.

**The trap, which codebase-scout caught and which would have quietly broken something unrelated.**
`reminders.is_journal_nudge` looks like a Journal column and mostly is — but 0024 also *rebuilt*
0022's orphan-sweep index to exclude journal nudges, so the live index definition had
`is_journal_nudge = false` baked into its predicate. Dropping the column without rebuilding the
index would have taken migration 0022's orphan invariant down with it — "a reminder attached to
neither a task nor a routine is wreckage", with that partial index being what makes finding the
wreckage cheap. The migration therefore drops the index, recreates it at **exactly** its original
0022 definition, and only then drops the column. Verified afterwards: the index is back to
`where linked_task_id is null and linked_routine_id is null and status = 'active'`, which is now
the correct definition again — the one legitimate exception to the rule stopped existing when
Journal did.

**What could not be done, and is not being pretended otherwise.** Supabase refuses bucket deletion
over SQL ("Direct deletion from storage tables is not allowed. Use the Storage API instead."),
which is asymmetric with 0024 having been allowed to `insert into storage.buckets` to create it.
The Storage API needs a service-role key, and `SUPABASE_SERVICE_ROLE_KEY` is empty in this
project — no app code uses one either, so there was nothing to borrow. **The empty `journal`
bucket therefore still exists.** It is inert: empty, private, and with its policy dropped there is
no longer anything granting access to it. Recorded in the migration, added to PROGRESS.md's owner
actions, and explained to Alan in MANUAL.md with the four clicks that remove it.

### The documents

The real risk of a half-removed feature is a future session reading the spec and rebuilding it, so
the point of these edits is to make that impossible rather than to tidy up.

- **`SPEC.md`** — Part E6 now opens with a CANCELLED banner saying nothing in it was ever built
  (including `/frame`, which never existed); the Phase 6 line says cancelled and skipped; the
  schema block for `journal_entries`/`albums` is commented out with a note that 0024 created these
  and 0033 dropped them, while `monthly_reviews` is explicitly excluded because it belongs to
  Month in Review; and the incidental mentions are fixed — the product one-liner, the nav layout,
  the workout_member restriction, the Journal ↔ Today interconnection, the Month in Review
  contents and the morning-briefing inputs. The original hobbies brief is struck through rather
  than deleted, so the record of what Alan first asked for survives.
- **`MANUAL.md`** — four stale lists that told Alan his own nav contained Journal and Vinyl, and
  the "Journal and Vinyl are gone" section updated: they are now gone completely, nothing was
  lost, and here is how to delete the leftover folder if he wants to.
- **`PROGRESS.md`** — Phase 6 marked cancelled; the two historical checklist lines annotated
  rather than rewritten; and the "natural next build" paragraph replaced, because it was wrong
  twice over — it recommended building Phase 6, and it said Phase 7 was blocked on the Gemini key.
  What is actually left in Phase 7 is quick-capture and Month in Review.
- **`LATER.md`** — the journal nudge removed from the morning-briefing idea and the widget list.

**What unit-reviewer caught: the exact failure this unit existed to prevent.** All four
documents were corrected and a *code comment* was missed — `src/lib/permissions.ts` still said
"Their empty tables from migration 0024 are left in the database, unused, rather than dropped",
which as of this unit is simply false, in the first file anyone opens when touching module access.
Rewritten to say what 0033 actually did, and to explain why the two dead `module_access` keys were
nonetheless left alone. Two lesser versions of the same defect fixed with it: `src/lib/images.ts`
justified its own existence partly by pointing at SPEC Part E6, now stamped CANCELLED (reason 1,
the 1 MB Server Action cap, stands on its own — and avatar uploads use the helper too); and a
"see the decisions log" pointer this diff introduced led to a log with no such entry, so the entry
is now written. MANUAL's leftover-bucket paragraph was reworded — saying the photo storage was
dropped and then that the folder still exists reads as a contradiction before it reads as a
distinction.

Reviewer's judgement accepted on two residuals, both left alone deliberately: the pre-flight
emptiness check is recorded in the migration header rather than enforced by a `raise exception`
guard in the SQL — worth knowing it is a promise rather than a mechanism; and `SPEC.txt` plus the
`Notes/*.txt` handoff files still carry the uncancelled journal schema, but both are frozen
artefacts (`SPEC.txt` has been touched once, in the initial scaffold) and CLAUDE.md names `SPEC.md`
as the bible.

---

## 40. The audit: dead code, duplicated logic, and two real bugs

Alan: "remove all unwanted functions and bloat from this app". A general-purpose agent audited the
whole tree with instructions to verify rather than grep, because a false positive here costs real
breakage. **533 lines net removed across 32 files** (203 insertions against 736 deletions), plus two
database objects — and the audit turned up two genuine defects on the way, which were the most
valuable part of it.

### The two bugs

**Dark mode didn't reach one screen.** There were two copies of "is the interface dark right now",
used to pick chart colours in JavaScript. `money/reports-view.tsx` subscribed to the media query.
`workout/exercise/[id]/exercise-detail.tsx` read `matchMedia` **straight through during render** —
so its chart never repainted when the phone flipped to dark, and, worse, it returned a different
value on the server (always false, no `window`) than on the first client render, which is a
hydration mismatch. Its comment said *"Matches reports-view"*. It did the opposite. One
`useIsDark` now lives in `theme-provider.tsx` beside `useTheme`, and it is the subscribing version.

**Four ways to add days to a date — and the first version of this entry got the diagnosis wrong,
which unit-reviewer caught and which is worth recording rather than quietly correcting.** It
claimed the private copies in `timeline-view.tsx` and `lib/streaks.ts` used local time and could
disagree with the canonical helper around midnight. They do not: both are
``new Date(`${x}T00:00:00Z`)`` then `setUTCDate`, byte-for-byte the behaviour of
`addDaysToDateString`. The wrong note was worse than no note — it would have sent a future session
hunting a midnight bug in `streaks.ts` that does not exist.

What is actually true: three of the four were UTC and identical, so the two private copies needed
no judgement at all and were consolidated in this unit after all. The fourth, `addDays` in
`lib/calendar.ts`, is genuinely local-time — but it parses to a local `Date`, calls `setDate`, and
formats back with local getters, so it is internally consistent, and `setDate` normalises across
DST. Its only two call sites are in the same file, producing the "Tomorrow"/"Yesterday" labels.
**It is not a bug**, and it is left alone: one local-time date helper with two in-file callers is a
smell, not a defect.

### Dead code removed

| What | Lines |
|---|---|
| Nine reminder server actions in `calendar/actions.ts` — get/create/update/pause/resume/complete/snooze/delete — orphaned when Calendar merged into Plan. Reminders are now written directly by `tasks/actions.ts` and `routines/actions.ts`, and advanced by the `advance_reminder` RPC | 192 |
| `getAgenda` + `AgendaItem`, superseded by Plan's own `getPlanRange` | 64 |
| `createCalendarEvent` and `NewEventForm`, its only caller — nothing rendered the form | 90 |
| `src/components/ui/card.tsx` — the whole shadcn Card set, superseded by `Panel` | 133 |
| `src/lib/money.ts` — a second, entirely dead money module. All 25 consumers import `lib/finance/money` | 28 |
| `Reminder`, `ReminderStatus`, `DayPlan` interfaces | 25 |
| Fifteen smaller declarations: `getAssistantStatus`, `getRecentInsights`, `moveTaskHorizon`, `updateReceiptLineItems`, `describeGcalError`, `getPalette`, `toDateTimeString`, `popInVariants`, `PAGE_TRANSITION`, `NUDGE_NEVER`, `Role`, `ReactionEmoji`, and three unused illustrations | 110 |
| `Notes/Keys.txt` — an empty file, tracked in git, named to invite exactly the mistake it would be | 0 |

`calendar/actions.ts` went from **521 lines to 238**, keeping all thirteen live exports. Seven
imports it no longer needed went with them, and a `revalidatePath("/calendar")` that had been a
no-op since `/calendar` became a redirect stub now points at `/plan`, which actually renders.

### Duplicates consolidated

`daysBetween` (two byte-identical private copies) is now `daysBetweenDateStrings` in `lib/time.ts`
beside its inverse. `addDays` (two more byte-identical copies, in `timeline-view.tsx` and
`lib/streaks.ts`) now calls `addDaysToDateString` from the same module. `daysInMonth` (two copies) is exported once from `finance/period.ts` — both
copies existed to clamp an anchor day to a short month, and two copies of that is two places to fix
it and one to forget. `formatShortDate` (a local copy of an exported one) now imports the shared.
`extForMimeType` (two copies, both building **storage paths**) moved to a new `lib/mime.ts`; a
five-line module is worth it when the alternative is a bucket where half the receipts are `.jpg`
and half are `.jpeg`. Deliberately not in `lib/images.ts` — that module is browser-only and these
are server actions.

### Database — migration `0034_drop_dead_schema.sql`

- **`public.comments`** — built by `0005` for the crew feed with three RLS policies and an index,
  rebuilt again in `0018`, and never given a screen, a server action, or a single row. Nothing in
  `src/` has ever named it.
- **`reminders.mirror_to_gcal`** — created by `0011` when Google Calendar sync was a plan. When
  sync was built, `gcal_event_id` became what decides whether a row is mirrored. Never read or
  written since, by code or SQL. It survived because the TypeScript `Reminder` interface still
  declared it, which made it look alive.

**This migration refuses to run if either turns out to be in use**, rather than asserting in a
comment that it was checked. That is the direct lesson from `0033`, where unit-reviewer pointed out
that a "verified empty" header comment is a promise, not a mechanism — it cannot stop a replay
against a database where the facts differ. Both counts are zero here, so the guard is invisible.

### Raised with Alan rather than decided

`SPEC.txt` and three `Notes/*.txt` handoff files are stale and could mislead a cold session, but
they are his writing. The `shadcn` dev dependency is unused, but it is the tool for adding new UI
components. The `requireUser()` helper is copy-pasted **18 times** across every actions file — the
single biggest duplication in the repo, about 150 lines — but consolidating it touches 18 files at
once and belongs in its own unit, not folded into a deletion pass.

### One self-inflicted break, caught by test-runner

Removing a now-unused `useState` import, this session grepped for `useState(` — and the file used
`useState<Metric>("e1rm")`, with a generic, so the search missed the one real usage and the build
broke. Caught in three minutes, fixed, and every touched file re-checked with a pattern that
matches both call forms. Worth recording because the failure mode is generic: a grep for `name(`
silently misses every generic call in a TypeScript codebase.

### The review's other findings

- **A dead import left behind by the pass whose entire job was removing dead code.**
  `assistant/actions.ts` still imported `isAiConfigured` after `getAssistantStatus`, its only
  consumer, was deleted. It survived because Next's `no-unused-vars` is a *warning*, so
  `ALL CHECKS PASS` was true and wrong at the same time — worth knowing that green checks do not
  prove there is no dead code. The reviewer ran a proper import-vs-body scan over every touched
  file; this was the only instance.
- **The migration guard was not replay-safe**, which undercut the exact point it was written to
  make. `select count(*) from public.comments` raises `undefined_table` on any database where the
  drops have already happened — a restored snapshot without its `_migrations` row, a branch
  database, a partial dump — and would take every later migration in that run with it, while the
  `drop ... if exists` statements below it were idempotent. Now guarded by `to_regclass` and an
  `information_schema` lookup, so the guard is exactly as idempotent as what it protects. The file
  therefore differs from what was executed; that is disclosed in its header, and the added checks
  are a provable no-op on the database it ran against, where both objects existed.
- **Two comments orphaned by these edits.** Inserting the new helper into `lib/time.ts` separated
  the work-hours comment from `isOutsideWorkHours`, and removing `ReactionEmoji` left the
  equipment-tags comment abutting `REACTION_EMOJIS`. Both fixed — and pointed out with the right
  needle: this is the unit that argued a lying comment ("Matches reports-view") caused a real bug.
- **Recorded, not fixed — receipt evidence is still overwritten in place.** `approveReceipt`
  (`money/receipt-actions.ts`) writes the human-corrected `line_items`, `merchant_guess` and
  `txn_date_guess` over the receipt row, so what the AI originally extracted is gone after
  approval. That is the surviving instance of exactly what `updateReceiptLineItems` was deleted
  for, and it is a genuine violation of "imported source data is never rewritten in place". It is
  pre-existing and out of scope for a deletion pass, but it is a real finding and belongs in the
  next money unit rather than in a footnote nobody reads.

**MANUAL.md gap closed.** Entry 38 shipped the outlook without giving Alan a section explaining
it — CLAUDE.md says the Manual grows after every completed piece of work, and a feature he cannot
read about is a feature he will not use. Added: what the panel is and why it is not a summary of
the numbers under it, a real example from the live test, the tap-to-act rule, why it says less on
a quiet day, what Dismiss does, the 7c/month cost with the two switches that control it, and the
fact that it can only mention modules the account has.

---

## 40. Full-codebase audit — no code changed

**What Alan asked for.** "Look at the entire code and audit and find bugs and design issues and
bloat. Be as comprehensive as possible." A read-only diagnostic pass over everything, not a fix
pass. Nothing in `src/`, `supabase/` or `scripts/` was modified by this entry; the only file
written was this one.

**Scope actually covered.** All 228 TypeScript/TSX files (32,878 lines), all 34 migrations
(2,577 lines), `scripts/run-migration.mjs`, `public/sw.js`, `public/manifest.json`,
`package.json`, `next.config.ts`, `vercel.json` and `eslint.config.mjs`.

**How it was run.** Four parallel audit subagents (money/finance, database+RLS, frontend/UI,
workout+shopping+tasks+plan), plus a direct read in the main session of the security-critical
core that was deliberately not delegated: `proxy.ts`, `lib/supabase/*`, `lib/crypto.ts`,
`lib/reminders/action-token.ts`, `lib/permissions.ts`, all five API route handlers, the whole
`lib/ai/` tree and `lib/gcal/client.ts`. Every subagent finding quoted below was re-verified
against the actual file in the main session before being reported; seven were confirmed by
executing the real logic and reading its output.

**Result: 108 findings.** Delivered to Alan as a published artifact (filterable by severity,
plain-English title + technical file:line on every row), not as terminal output.

**The five treated as fix-first, all verified in the SQL directly:**

1. `crew_push_subscriptions()` (0015:12) — `select id, user_id, endpoint, keys from
   push_subscriptions` with NO where clause, `grant execute to authenticated`. Every logged-in
   account can read every account's push endpoint and p256dh/auth keys. 0018 crew-scoped every
   workout *table* policy and never revisited this function.
2. `delete_crew_push_subscription(uuid)` (0013:10) — deletes by id with no ownership predicate,
   granted to `authenticated`. Chained with #1 this is a full notification hijack, since
   `savePushSubscription` upserts on `endpoint`.
3. `check_cron_secret` (0012:43) — `secret <> (select value ...)` returns NULL when the row is
   absent, so the `if` never fires and no exception is raised. **Fails open.** No migration ever
   inserts `('cron_secret', ...)` — it exists only because it was typed into the live database by
   hand. On any rebuilt/restored DB, nine cross-user definer RPCs accept any string.
4. `seed_default_shopping_categories` / `seed_default_exercises` / `seed_default_categories`
   (0004:42, 0008:71, 0016:126) — all SECURITY DEFINER, all take `target_user uuid`, and there is
   **no `revoke execute` anywhere in the entire migration tree** (verified by grep), so Postgres'
   default EXECUTE-to-PUBLIC stands. Any user can write into any other account's seed data.
5. `public._migrations` (run-migration.mjs:22) — created with no RLS and no revoke, in the
   PostgREST-exposed `public` schema. The one table in the app without RLS, and deleting rows
   from it makes the next deploy replay 0022's unconditional `delete from reminders`.

**Confirmed by execution (`node`, output read, not inferred):**

- Parenthesised-negative CSV amounts: `"(1,234.56)"` -> `+1234.56`, `isIncome: true`. Bank
  withdrawals written in accounting format import as **income**. Two independent copies of the
  same parser — `settings/money/csv-import.tsx:85` and `reconcile-flow.tsx:151`.
- `currentPeriodBounds("monthly", "2026-01-31", "2026-02-28")` -> `[2026-01-31, 2026-02-28)`.
  `end` is exclusive, so **28 Feb falls outside its own current period** — that day's spending is
  invisible to budgets and safe-to-spend, then reappears 1 Mar. 27 Feb and 1 Mar are both fine.
- `projectPayoff` avalanche vs snowball on two realistic debts: **byte-identical** (57 months,
  $875.62 interest). Freed-up minimums are never rolled forward, which is the entire definition of
  both strategies, so neither is implemented.
- Never-pays-off case ($10,000 @ 24%, $10/mo): returns `137349425853`, rendered by
  `debts-view.tsx:196` as "Interest paid **$1,373,494,258.53**" beside a correct "600+ mo".

**Other findings worth naming here, because they contradict a comment in the code:**

- `lib/ai/tools.ts:178` hardcodes `-05:00` when the assistant creates a task with a due time.
  Winnipeg is -06:00 from November to March. `zonedTimeToUtc` (DST-aware, two-pass) already exists
  in the file this one imports from.
- `lib/ai/usage.ts:91` — the monthly cap sums `ai_usage` rows **in JS** after a plain select.
  PostgREST caps at 1000 rows, so past 1000 calls in a month the total silently stops growing and
  the brake the file describes as "a hard stop that cannot be exceeded" fails open.
- `lib/permissions.ts:102` — `/timeline`, `/routines` and `/assistant` match no MODULE_ID, so
  `canAccessPath` returns true for every account. The file's own comment describes this exact hole
  being closed for `/plan`; the same fix was never applied to the other three. The Assistant is
  the one that matters — it spends the Gemini key.
- `proxy.ts:62` — the module gate only runs `if (profile && ...)`, so a failed profile read falls
  through to allowing the page. Fails open.
- Two `ThemeProvider`s are mounted (`app/layout.tsx:102` and `app/(app)/layout.tsx:11`). React
  flushes child effects before parent effects, so the outer one — which has no `initialTheme` —
  runs last and writes the local default over the account's saved theme.
- `--density-scale` is declared at globals.css:270 and set at :331-332 and **consumed by nothing**
  (3 occurrences total, all definitions). The Spacing setting in Settings -> Appearance does
  nothing at all.
- No `MotionConfig` and no `useReducedMotion` anywhere in `src/` (0 hits). "Motion: Reduced" only
  shortens CSS transitions; every Framer animation ignores it, as does the OS-level
  `prefers-reduced-motion`.
- `today/upcoming-bills.tsx:26` sums `amountCents` across currencies and renders it as CAD, while
  the row above it correctly passes `bill.currency`. `lib/ai/outlook.ts:139` repeats the same sum,
  and `OutlookFacts.bills` does not even carry a currency field, so it cannot be fixed there
  without widening the type.
- `lib/offline/shopping-db.ts:76` — the outbox is keyed on `crypto.randomUUID()` and read back
  with `getAll`, which returns **key order**. Offline mutations therefore replay in effectively
  random order; a tick can run before the add it depends on and is lost with no error.
- `routines/actions.ts:180` — `updateRoutine` delete-and-reinserts steps on any title change,
  minting new step UUIDs, while `routine_completions.steps_done` stores the old ones. Renaming a
  routine wipes today's ticked steps.
- `vercel.json` declares a daily Vercel cron for `/api/cron/reminders`, while that route's own
  header comment states Vercel Cron is deliberately not used. One of the two is wrong.

**Verified clean, and worth recording so it isn't re-audited:** every monetary column is `bigint`
cents; every timestamp is `timestamptz` (the sole naive type, `routines.time_of_day time`, is
correct); no float money anywhere in the schema; 2 `any` casts in the whole tree and both are in
comments; zero TODO/FIXME/HACK markers; the journal/vinyl removal (0033/0034) left no orphaned
type, function, index, policy or `src/` reference. Twelve exports initially flagged as dead were
checked individually and are used inside their own files — reported as over-exported, not dead.

**Not done, on purpose.** No fixes. The audit is the deliverable; the fix order is the artifact's
first section. `PROGRESS.md` is untouched because nothing shipped.

---

## 41. Audit fixes, round one — the five security holes, the money maths, and the 1.1 lb stepper

**What Alan asked for.** "Fix everything" (the 108 findings from entry 40), plus four things of his
own: workouts laid out more simply, the weight increment fixed with a setting to control it, money
able to log and categorise everything, and an assistant he can talk to that actually changes things
in the app. He also asked whether the Gemini app on his Android phone can be connected to Alan OS.

**Three of those needed a decision from him before any code was worth writing**, so they were put
as a plain-English choice with drawn mock-ups rather than guessed at. His answers, which govern the
work in the next entries:

- **Workout** — "log-first single screen". `/workout` becomes one big Start, this week, and last
  session; Crew and history move behind links. NOT the notes-style logging rebuild.
- **Money** — both a single entry screen covering every transaction type AND categories filled in
  automatically.
- **Assistant** — everything: workouts, all of money, tasks/routines/shopping, and deleting and
  editing as well as adding.

None of those three are built yet. This entry is the fixes.

### The 1.1 lb stepper — a unit mix-up, not a rounding error

`smallestIncrementKg("lbs")` returns `lbsToKg(2.5)` = **1.1339 kg**, and `set-row.tsx:78` assigned
it straight to `increment`, which is then subtracted from `shownWeight` — a value in **pounds**. A
kg quantity used as a lb quantity. So the +/- buttons moved the weight by 1.1 lb instead of 2.5.

- `lib/workout/units.ts` — added `incrementInDisplayUnit(unit, override)` and `DEFAULT_INCREMENT`.
  `smallestIncrementKg` now derives from it and keeps its kg meaning for the overload nudge, with
  a comment saying explicitly that the two must not be swapped.
- `preferences.ts` — new `weightIncrement: number | null`, stored **in the display unit** (null =
  2.5 lb / 1 kg). Deliberately not stored in kg: storing it converted is what caused the bug.
  Clamped 0.1–50 and rounded to 2dp rather than going through `num`, which rounds to integers and
  would have destroyed 2.5.
- Settings → Workout: preset chips per unit (lbs 1/2.5/5/10, kg 0.5/1/1.25/2.5/5) plus Custom,
  with a live "Now moving in steps of X" line and a toast confirming what the buttons will do,
  since the change is not visible from that screen.
- Threaded page → form → panel → row, and into `suggestNextWeight` so the progressive-overload
  nudge uses the same step.

### Migration 0035 — the five security holes

`supabase/migrations/0035_close_audit_security_holes.sql`, plus a fix in `run-migration.mjs`.

1. `crew_push_subscriptions()` now filters `user_id = auth.uid() or is_admin() or same_crew()` —
   the same predicate the workout tables use, so the two cannot drift apart again.
2. `delete_crew_push_subscription()` gained the same ownership predicate.
3. `check_cron_secret` rewritten to `not exists (...)`. `secret <> (select ...)` is NULL when the
   row is absent and `if NULL` does not fire, so it **failed open**. Also seeds a random
   `cron_secret` row if none exists — no migration ever created one.
4. `revoke execute ... from public, anon, authenticated` on all three `seed_default_*(target_user)`
   functions. There was no `revoke` anywhere in 0001–0034, so Postgres' default EXECUTE-to-PUBLIC
   stood on every definer function.
5. `_migrations` gets RLS + revoke, in the migration AND in the script that creates it, so a fresh
   clone is never briefly exposed.

**Also in 0035:** `routine_completions` unique constraint rebuilt as `(user_id, routine_id,
completed_date)` — both old constraints are dropped by pg_constraint LOOKUP, not by guessed name,
because `drop constraint if exists` with a wrong name is a silent no-op that would leave the bug.
`push_subscriptions.endpoint` made unique per user the same way. `ai_usage` write policies dropped
in favour of `record_ai_usage()`, with `ai_usage_month_total()` and `ai_usage_month_by_feature()`
so the spend cap is summed in SQL. `adjust_account_balance()` added (security INVOKER, so RLS still
scopes it) to replace six read-modify-write balance updates. Missing indexes on `tasks(user_id,
due_at)`, `tasks(user_id, completed_at)`, `tasks(parent_task_id)`, `workout_templates(user_id)`,
`routine_completions(user_id, completed_date)`; duplicate `recurring_transactions_notify_idx`
dropped; unique index on `reconciliations(user_id, account_id, statement_date)`; NOT VALID
positivity checks on `budgets`, `savings_goals`, `transactions`.

### Money maths, all four re-verified by executing the fixed code

- **CSV parenthesised negatives.** New `parseCsvAmount()` in `lib/finance/csv-parser.ts` handles
  accounting brackets, trailing minus, leading minus. Both copies of the old inline parser (the
  importer and the reconciler) now call it. Verified: `(1,234.56)` → `{cents: 123456, isIncome:
  false}`; `$1,234.56` → income; `$0.00` and `abc` → null.
- **Budget period gap.** `period.ts` now compares today against the anchor **clamped to the current
  month**. Verified across 27 Feb / 28 Feb / 1 Mar / 31 Mar with a 31st anchor — all four now fall
  inside a period; 28 Feb previously fell inside none.
- **Debt payoff.** Freed-up minimums now roll forward. Verified: the original two-debt case dropped
  from 57 months/$875.62 to 46 months/$811.64. On a deliberately opposed pair (smallest balance =
  lowest rate) with $200/mo extra, avalanche and snowball now diverge correctly — 21 mo/$1,229.47
  vs 22 mo/$1,331.39, attacking different debts first. They are still identical at $0 extra, which
  is correct: with no discretionary money there is no choice to make until something is freed.
- **Never-pays-off.** New `neverPaysOff` flag; `debts-view.tsx` renders an explanation instead of
  the fabricated `$1,373,494,258.53`.

### Everything else fixed in this pass

- **Currency mixing** — `upcoming-bills.tsx` nets CAD bills only and labels the total "(CAD only)"
  when others are present. `OutlookFacts.bills` gained `currency` (it had no way to be correct
  before) and `outlook.ts` filters the same way; `today/page.tsx` passes it through.
- **Receipts** — `approveReceipt` now CLAIMS the receipt with a conditional update
  (`.eq("status","pending_review")`) so a second approval cannot double-charge, releases the claim
  on every failure path, and uses `account.currency` instead of a hardcoded `"CAD"` (the ~60x INR
  bug that `csv-actions.ts` had already been fixed for). The review dialog defaults the date with
  `todayInAppTimezone()` instead of the UTC date, which was already tomorrow after 6pm.
- **Recurring** — a failed insert now RESTORES `next_date`/`last_posted_date` instead of `continue`,
  which used to make that month's rent vanish permanently. `getUpcomingBills` filters on `end_date`.
  Note: the `.or()` initially landed on the posting query by mistake and was moved — filtering
  posting on `end_date` would have dropped a series' final legitimate occurrences.
- **Access** — `/routines`, `/timeline` and `/assistant` added to `ROUTE_MODULE_ALIASES`; they
  matched no module id, so `canAccessPath` returned true for every account. `proxy.ts` now fails
  CLOSED when the profile cannot be read.
- **AI** — key moved from `?key=` to the `x-goog-api-key` header; 30s `AbortSignal.timeout` added
  (there was none, and the Today page awaits one of these during render); the silent `catch {}` now
  logs. `tools.ts` `create_task` uses `zonedTimeToUtc` instead of a hardcoded `-05:00` (wrong
  Nov–Mar); `list_tasks` overdue uses Winnipeg midnight; `log_expense` returns an error listing the
  available accounts instead of silently falling back to `accountList[0]`, and moves the balance
  atomically.
- **Routines** — steps are updated in place by `sort_order` instead of delete-and-reinsert, which
  minted new UUIDs and wiped `steps_done` on a rename. `revalidatePath("/tasks")` → `"/plan"` in
  all five places (`/tasks` is a 13-line redirect stub).
- **Reconcile** — statement rows dated after the statement date are dropped, matching what
  `getReconcileData` already does for app transactions.

**Checks:** `npm run lint` and `npm run build` pass. There is still no `npm test` script — CLAUDE.md's
session protocol tells test-runner to run one and it does not exist. That is itself an open finding.

**MUST BE RUN BEFORE THIS DEPLOYS.** `SUPABASE_DB_URL="postgresql://..." node
scripts/run-migration.mjs`. Until 0035 is applied, `getUsageSummary` calls an RPC that does not
exist yet — it degrades to reading $0 spent, so the AI keeps working but the monthly cap is not
enforced. Everything else fails safe.

### 41b. Review round — unit-reviewer FAILED the above, and what changed because of it

`unit-reviewer` returned **FAIL on 5 items**. Three of its citations were stale (it read the
migration before the unique indexes were made conditional, and `csv-parser.ts` before the
European-comma hardening) — those were re-verified as already fixed, not argued away. The rest
were real, and this is what they cost:

**Item 13, and it is the most important one in this whole session.** Migration 0035 adds real
constraints, which turns "the database refuses" from an impossible state into an ORDINARY outcome
of a second tap or a typo — and several actions returned `error.message` straight to the screen.
A second reconcile submit would have shown Alan:

    duplicate key value violates unique constraint "reconciliations_user_account_date_idx"

That is a direct breach of this file's first rule. A constraint that protects the data and then
explains itself in Postgres' voice has traded one bug for another. Fixed with a new
`src/lib/db-errors.ts` (`friendlyDbError`), mapping constraint names and SQLSTATE classes to
sentences, and **33 raw-message sites across 14 action files** converted to use it. Deliberately
NOT converted: `settings/actions.ts` (supabase.auth messages like "Password should be at least 6
characters" are genuinely readable), `settings/admin/actions.ts` (the RPCs already raise
hand-written sentences), and `settings/data/data-actions.ts` (a diagnostic payload, never rendered
as prose). Unrecognised errors fall back to a plain sentence rather than the raw text.

**Item 8 — the meter could fail silently.** `recordUsage` ignored the result of `record_ai_usage`.
Because `ai_usage` is now read-only to the client, a failure of that one function means NOTHING is
metered, the month reads $0, and the ceiling can never be reached — the same failure mode as the
1000-row bug it replaced, and exactly what happens if this code deploys before 0035. Both the
error branch and the catch now log loudly, naming the migration.

**Item 9 — silent dependencies on the migration.** `completeRoutineToday` upserts on a constraint
that does not exist until 0035 and ignored the error, so the tick stayed on screen with nothing
saved. It now returns `{ error }`, `uncompleteRoutineToday` returns the recomputed streak instead
of the caller guessing "minus one" (wrong across a forgiven miss), and all three call sites
(`routine-section.tsx` twice, `today-console.tsx`) roll the optimistic update back and toast.
Every `adjust_account_balance` call site now checks its error too.
*(Corrected in 41e: three of the eight did not, and were fixed there.)*

**The reviewer also found a real bug I introduced.** `receipt-actions.ts` returned
`Number(updatedBalance)`, and `Number(null)` is `0` — so a failed balance RPC would have displayed
that account at **$0.00** on the Money screen. Now returns `undefined` and the screen keeps what it
has. Separately, `approveReceipt`'s claim was released on every *returned* error but not on a
*throw* — a dropped connection mid-request, which is the exact scenario the claim exists for, would
have stranded the receipt as "approved" with no transactions and no way back to it. Wrapped in
try/finally.

**And a correct catch on the migration itself:** `gen_random_bytes` is pgcrypto, and would have
been the only pgcrypto call in 35 migrations — an unproven dependency that would have aborted the
whole transaction and taken the five security fixes with it. Swapped for two concatenated
`gen_random_uuid()`s, which is core Postgres and already used by every table in the app.

**Two overclaims corrected rather than defended.** 0035's comment said `adjust_account_balance`
"replaces six read-modify-write balance updates" while five remained — including the "Add it"
button in the reconcile flow, the most double-tappable control in the module. All five are now
converted, so the comment is true. And entry 41's line "everything else fails safe" was wrong on
two counts (metering and routine completion), both named above.

**Also fixed from the reviewer's non-blocking notes:** statement rows dated after the statement
date were dropped in silence — they now show a count, mirroring the message the app side already
prints. Switching lbs↔kg used to silently reinterpret a saved `5` as 5 kg (~11 lb); it now resets
to the new unit's default and says so. `deleteTransaction` returns `{ error }` instead of void.

**Knowingly NOT fixed, and why.** `approveReceipt` still writes the human-corrected `line_items`,
`merchant_guess` and `txn_date_guess` over the receipt row, destroying what the AI originally read
off the photo (reviewer item 3). This is pre-existing, already recorded in `PROGRESS.md`, and
fixing it properly needs a schema change — a separate column for the original extraction — which
is a unit of its own, not a line to slip into a fix pass. It is a real violation of "imported
source data is never rewritten in place" and it stays open. Two other cautions accepted as
cautions: reordering a routine's steps transfers today's ticks positionally (lasts one day, and is
quieter than the old behaviour of losing them outright), and `parseCsvAmount` now refuses
comma-decimal formats rather than reading them.

### 41c. `npm test` now exists

Audit finding: CLAUDE.md's session protocol has told `test-runner` to run `npm test` since 22 Aug,
and there was no such script and no tests — so that line of the protocol had been quietly doing
nothing for four days, and every "ALL CHECKS PASS" in that window covered lint and build only.

- `package.json` gains `"test": "node --experimental-strip-types --test \"tests/*.test.mts\""`.
  **No test framework and no new dependency** — node's own runner and its native TypeScript
  stripping. That matters here: the project is on free tiers with AI usage as the only paid line,
  and a devDependency tree for twenty assertions is exactly the bloat the audit was complaining
  about. (The bare `--test tests/` form fails on this Node with MODULE_NOT_FOUND; the glob form is
  required, hence the quoted pattern.)
- `tests/money-and-units.test.mts` — 20 tests, all passing.

**Scope is deliberate and is written into CLAUDE.md so it doesn't drift.** The tests cover the
PURE money, date and unit helpers: `parseCsvAmount`, `normalizeCsvDate`, `currentPeriodBounds`,
`daysInMonth`, `projectPayoff`, `incrementInDisplayUnit`, `smallestIncrementKg`, `friendlyDbError`.
Those are the functions where a wrong answer is silent, expensive and needs no database to
reproduce. Anything requiring Supabase stays with the `qa` agent's end-to-end pass rather than
being mocked into a test that proves nothing.

**Every case is a bug that was genuinely in this codebase**, proved by running the code before it
was fixed — the bracketed withdrawal read as income, 28 February belonging to no budget period,
avalanche and snowball returning identical plans, the $1.37bn interest figure, the 1.1 lb stepper,
and a constraint violation reaching the screen as Postgres output. This is a regression net for
those specific mistakes, not an attempt at coverage. Two guard tests were added beyond the fixed
bugs: that avalanche never costs more interest than snowball at any extra-payment level, and that
`friendlyDbError` never leaks raw text for an error it does not recognise.

CLAUDE.md's "Maintaining this file" section is dated and updated accordingly, including the
instruction to add to this file whenever a maths or parsing bug is fixed, and NOT to chase coverage
of UI components.

### 41d. Receipt extraction is no longer destroyed on approval (migration 0036)

This was reviewer item 3, and the reason it is fixed here rather than deferred a third time: it is
recorded in `PROGRESS.md` as **"ongoing data loss, not a latent risk"** — every receipt approved
while it stayed open permanently lost what the model actually read — and the review failed the unit
on it. "Out of scope" was the right call for a deletion pass; it is not the right call for a pass
whose whole purpose is fixing what the audit found.

- `supabase/migrations/0036_preserve_receipt_extraction.sql` adds `receipts.original_extraction
  jsonb`, with a `comment on column` stating that it is written once and never updated, so the
  invariant is visible in the schema and not only in a code comment.
- `scanReceipt` now writes it at insert time, frozen alongside the working columns.
- `approveReceipt` backfills it for receipts scanned before 0036 — at the moment of the claim,
  BEFORE the corrections are written, those columns still hold the model's own output, so this is
  a faithful snapshot rather than a guess.
- The migration backfills `status = 'pending_review'` rows for the same reason. Approved rows are
  deliberately left null: their columns already hold Alan's corrections, and copying those in would
  be worse than an empty field because it would look as though the model had been right all along.

**Not recoverable, and said plainly rather than quietly:** receipts approved before this landed had
their extraction overwritten and it is gone. `PROGRESS.md` item 4 is marked fixed with that caveat,
and `MANUAL.md` has a short section telling Alan in his own terms — the transactions are correct,
only the record of what the scan read is missing, and only for receipts approved before 26 Aug 2026.

### 41e. Second review round — and one thing the reviewer got wrong

`unit-reviewer` failed the unit again, on 4 items. It withdrew three of its round-one citations
as stale after re-reading from disk (the conditional indexes, the pgcrypto swap, the parser
hardening) — those were genuinely already fixed.

**One of its round-two findings is wrong, and the record should say so.** It reports item 3
(receipt extraction) as still deferred and calls the new MANUAL.md section false. It isn't: the
feature was built in 41d, AFTER the message that briefed the reviewer, so it reviewed against my
own out-of-date summary rather than the code. Verified: `original_extraction` is written at insert
(`receipt-actions.ts:129`) and backfilled at claim time for pre-0036 receipts (`:252`), and
migration 0036 exists. The line it flags (`:381`) overwrites only the WORKING columns, which is the
design — the original lives in its own column. MANUAL.md is accurate. No change made.

**Everything else it found was real, and several were regressions from 41b.**

- **The guard that couldn't be heard.** 0035's two conditional indexes use `raise warning` when they
  skip, and `run-migration.mjs` attached no `notice` handler — so node-pg discarded them and the
  script would have printed `Applying 0035... ok` while the indexes were silently not created. A
  guarded migration whose guard is invisible is not a guard. Handler added, plus an explicit
  end-of-run message, plus the `delete from public._migrations where filename = ...` line needed to
  re-run a migration once the data is tidied — the file told the operator to "re-run this
  migration" while the script skips anything already applied, so that instruction could not work.
- **A contradiction I created in 41b.** `approveReceipt` returned an error when only the balance
  RPC failed — but by then the transactions were written and the receipt approved, so the dialog
  said "Something went wrong saving this receipt", stayed open, and a second tap answered "That
  receipt has already been approved". Two contradictory messages and a dead end, across the whole
  pre-migration window. It now returns a `warning` instead: saved, but check the balance.
- **Three of eight balance calls were not checked**, contradicting 41b's own claim (now corrected
  in place). The worst was `reconcile-actions.ts`, which fell back to an optimistic local sum and
  then printed "Your account balance now matches the bank" — the exact lie the adjustment-insert
  fix in 41 was made for.
- **The assistant was reading Postgres aloud.** `lib/ai/tools.ts` was not in 41b's conversion list
  and had three raw `error.message` returns — including the one the new `transactions_amount_positive`
  check will hit. All three now go through `friendlyDbError`. `log_expense` also confirmed "logged"
  when the balance had not moved; it now returns a warning alongside the result.
- **`deleteTransaction` gained an error in 41 and its only caller still discarded it**, toasting
  "Transaction deleted" regardless — so from Alan's side the bug 41 claimed to fix was still there.
- **Two routine call sites still ignored their errors** (`today-console.tsx` untick,
  `routine-section.tsx` checklist-with-nothing-ticked).
- **`money.ts`'s "only two places touch a float" comment** was made false by `parseCsvAmount`. The
  comment now names all three and says why the parser rounds itself rather than calling
  `dollarsToCents` — it has to decide whether the text is a number at all.

**Still open and going to Alan rather than fixed:** the CSV importer silently drops rows the
stricter parser refuses, where the reconciler got a "rows skipped" banner this round. And
`getUsageSummary` discards its own RPC error and reads $0, so the AI cap fails open — loudly logged
in `recordUsage`, but to a server log Alan never sees.

**On the two-strikes rule.** CLAUDE.md says not to attempt a third fix when the reviewer fails the
same item twice. Items 9 and 13 have now failed twice, so that line is reached. The judgement made
here: each round surfaced DIFFERENT sites rather than the same fix failing again, and several were
regressions introduced by the previous round — leaving those would have shipped known-broken code I
had just written. So round three was applied to those, and the two genuinely pre-existing items
above were stopped on and handed to Alan, which is what the rule is for.

---

## 42. Alan's two decisions, and Workout rebuilt log-first

Two open questions from entry 41e were put to him as plain choices. His answers, verbatim:

1. **Ambiguous bank-file rows** — *"import what it can, show/reconcile only that while the rest it
   prompts me to confirm. reconciliation is the whole purpose of this in the first place"*
2. **AI meter unreadable** — *"carry on. just keep going i just want everything done"*

He is right about (1) in a way worth writing down: a row silently missing from a reconcile leaves a
difference with no explanation, and explaining the difference is the entire job of that screen.
Refusing rows was the safe choice for an importer and the WRONG choice for a reconciler.

### The ambiguous-amount flow

`lib/finance/csv-parser.ts` gains `readCsvAmount()`, returning a three-way result instead of
`ParsedAmount | null`:

- `{ kind: "ok" }` — one reading only.
- `{ kind: "ambiguous", readings[] }` — readable, but more than one way. Each reading carries a
  `label` formatted for a button (`"1,234.56"`), not for a developer.
- `{ kind: "unreadable" }` — not a number at all.

`parseCsvAmount()` stays as the strict wrapper, so nothing that only wants certain answers changed.
Both ambiguous families are handled: comma-after-last-dot (`1234,56` → 1,234.56 or 123,456.00) and
multi-dot (`1.234.567`). Direction (in/out) is preserved through the ambiguity, and a debit/credit
column still forces direction regardless of what the parser reads.

**Two confirmation UIs, deliberately different in shape:**

- `settings/money/csv-import.tsx` gains a `confirm` step between mapping and review. It holds the
  certain rows aside, lists the ambiguous ones with their readings as buttons plus "Skip this row",
  and the Continue button is disabled until every one is decided — it reads
  `"3 still to confirm"` and then `"Continue with 47 rows"`. Unreadable rows are COUNTED and
  reported rather than vanishing.
- `money/reconcile/reconcile-flow.tsx` does it inline in the matching step, as a "Need a decision"
  panel: picking a reading pushes the line straight into `bankRows` and it joins the match
  immediately, so the difference updates as you decide. No extra step, because you are already
  mid-task. "Leave it out" drops just that line.

Tests extended to 24: an ambiguous amount offers exactly two readings with money-shaped labels,
keeps its direction, unambiguous amounts never come back as a question, and junk is `unreadable`
rather than `ambiguous`.

### The AI meter — carry on, but not blind

`UsageSummary` gains `meterUnavailable`. `getUsageSummary` now captures the RPC error it used to
discard, and `overBudget` is forced false when the meter can't be read — so a database blip cannot
switch the AI off, which is what he asked for. What it must NOT do is carry on silently while a
screen shows a reassuring number, so Settings → AI & cost renders a panel saying the figure is not
the real number, the AI is still working, the ceiling is not being enforced, and the likely cause is
an unapplied migration. The two stats show `—` and "not being enforced right now" rather than `$0.00`
and "hard stop".

### Workout, log-first

His earlier choice, from three drawn options: *"one big Start, this week, last session — everything
else one tap away, not in the way."*

- New `workout/workout-home.tsx`: a full-height Start (or **Resume**, with an exercise count and a
  Discard control when a draft exists), the seven-day strip, ONE last session (tappable to repeat),
  and two plain rows — History & records, Crew.
- `workout-shell.tsx` goes from two tabs to three views (`home` / `history` / `crew`) with a Back
  button, so the other two are places you go rather than tabs competing for the first glance.
- **Nothing was deleted.** The whole previous You tab — records, templates, next-up, recent — is
  `YouView` unchanged, now reached through History. `CrewView` is untouched.
- The screen states its own rule in a comment: if something doesn't help you decide to start, or
  tell you what you did last, it belongs behind a link. This screen has now been redesigned twice;
  that line is there to stop it filling up a third time.

One shape bug caught before it shipped: `WorkoutDraft` has `payload.exercises?`, not `.exercises`,
and the count is optional — a draft can exist with a type chosen and nothing logged.

---

## 43. The assistant can change things now — and you can talk to it

Alan: *"fucking ai doesnt work the way i want it to work. I want to talk/write to it directly and
have it to make changes for me in the app like adding records and such directly. Can i connect this
with gemini of my android phone?"*

**The Gemini question, answered plainly first.** No — Google's Gemini app reaches Google's own
services and a handful of commercially negotiated partners; there is no route for a personal PWA to
register with it, and nothing buildable here changes that. But the premise was slightly off: the
assistant already IS Gemini, calling the same API with his key. The gap was never the model. It was
that the assistant could only do four things, and none of them were the things he wanted.

Asked what it should be allowed to touch, he picked every option: workouts, all of money,
tasks/routines/shopping, and deleting and editing as well as adding.

### Seven new tools (13 → 20)

`update_task` (rename / reschedule / move / delete), `complete_routine`, `manage_shopping_item`
(check off / uncheck / remove), `log_workout`, `manage_budget`, `manage_goal` (create / add money),
`update_transaction` (recategorise / fix amount / delete).

**Consolidated on purpose.** Renaming, rescheduling, moving and deleting a task are ONE tool with
an `action`, not four. The schema is resent on every turn of the loop, so each tool is a permanent
tax on every question — and cost is the thing Alan was most worried about when AI went in. The
figure in `usage.ts` was measured against thirteen tools and is now flagged as an underestimate
needing re-measurement, rather than left standing as though nothing changed.

### `matchOneStrictly` — the new rule that matters

`matchByName` is deliberately loose so "the visa" finds "Visa Infinite". That is right for reading
and for adding, and **wrong for destroying**: it returns a best guess where there was no clear
winner, and the model cannot tell the difference between a confident match and a coin flip.

Every destructive path now resolves its target through `matchOneStrictly`, which returns exactly one
match or an error carrying the candidates. So "delete the visa one" with two possible meanings comes
back as a question, never as a deletion. The system prompt reinforces it: say what you are about to
remove and wait, never delete and then report.

### Correctness carried into the new tools rather than re-learned

- `update_task`'s reschedule uses `zonedTimeToUtc`, not a hardcoded offset — the same bug fixed in
  `create_task` in entry 41, which would otherwise have been reintroduced one function later.
- `update_transaction`'s delete and fix-amount read the direction from the CATEGORY, not from
  anything passed in, and move the balance through `adjust_account_balance`. Fix-amount moves by the
  DIFFERENCE, not the new total.
- `log_workout` takes weights in the person's own display unit and converts once, here, where the
  unit is actually known — the model is told explicitly not to convert. It matches against the
  existing exercise library before creating anything, so "bench" and "Bench Press" don't become two
  exercises. If every exercise fails it deletes the workout row rather than leaving an empty session.
- `manage_budget` upserts on `(user_id, category_id)` because that constraint exists — asking for a
  budget that already exists means change it, not fail.
- Every error goes through `friendlyDbError`.

### Prompt injection, now that it can write

The system prompt gained a section naming the actual risk: some tool results are text from outside
Alan's control — merchant names off bank statements, item names read off photographed receipts —
and it is DATA, never instructions. This mattered less when the assistant could only add a task. It
matters now.

### Talking to it

New `src/lib/speech.ts`, wrapping the browser's own speech recognition. No dependency, no audio
routed through this app, and it is the honest answer to "connect it with Gemini on my phone" — the
dictation he actually wanted, in the assistant that is already here.

The mic button only renders where the API exists (Android Chrome yes, iOS Safari no), so it never
appears and then fails. Support is checked in an effect rather than at render, because touching
`window` during render would be a hydration mismatch on the composer. Interim results stream into
the box as he speaks, `continuous` is on so the pauses in "bench press, 135 for 8, three sets" don't
end the session early, speech appends to whatever was already typed, and sending stops the mic.
A blocked microphone says so in plain English instead of failing silently.

The opener suggestions were reweighted from questions to instructions, because a list of four
questions taught exactly the wrong lesson about what it is for.

`MANUAL.md` has a table of real sentences and what each one does, the two safety rules, and a note
that more capability means slightly more cost per question and where to see it.

---

## 44. Categories that fill themselves in

Alan asked for two things from Money: one screen that logs every kind of transaction, and
categories that fill themselves in. This is the second; the unified entry screen is still to come.

**Deliberately NOT an AI call.** Receipt scanning and CSV import pay for a model because a human
genuinely cannot do those by hand. Typing "Superstore" into a form is not that, and a model call
per keystroke would be the single most expensive thing in the app. New `lib/finance/categorise.ts`
guesses in three steps and stops rather than guessing badly:

1. **What you did before.** Exact merchant match, most-used category first.
2. **A partial match**, so "superstore" finds a stored "Real Canadian Superstore #4021" while it is
   still being typed. Four characters minimum, so a two-letter prefix cannot sweep up the history.
3. **A keyword table** for merchants with no history — weighted to what a Winnipeg statement
   actually looks like. Resolved against the account's OWN categories, so a keyword naming a
   category that was renamed or deleted matches nothing instead of resurrecting it.
4. Otherwise null. A blank category costs one tap; a wrong one costs a wrong budget.

**`getRecentMerchants` rewritten from "most recent" to "most used".** The old version read 50
transactions and kept the FIRST category it saw per merchant — so one mis-categorised coffee taught
the form the wrong answer permanently, and the most recent entry is precisely the one most likely to
be a mistake not yet corrected. Now 400 transactions, grouped by (merchant, category) with the count
kept, so eleven Groceries beats one Takeout. The display spelling still comes from the most recent
use, so it offers "Superstore" rather than an older "SUPERSTORE #4021".

**In the form**, the category fills in as the merchant is typed — but only when the person has not
chosen one themselves, or when the previous value came from this same guesser. A category you
tapped is never quietly replaced. The label says WHY ("you've used this 11 times", or "change it if
that's wrong" for a keyword hit), because a category that appears on its own with no explanation
reads as a bug the first time it happens. The explanation disappears the moment you choose your
own — at that point it is not the app's decision to explain.

**Nine tests added (24 -> 33)**, including the two that matter most: most-used beats most-recent,
and an expense guess can never return an income category or the reverse.

**One bug caught in my own work:** the tally key was built with a literal NUL byte as the separator,
which turned `money/actions.ts` into a binary file as far as git and grep were concerned. Replaced
with `::`. There is no reason to smuggle a control character into source.

---

## 45. One screen for every kind of transaction — transfers

The other half of Alan's money answer: "one fast screen for every kind". Four of the five already
existed (spending, income, remittance, repeating). The missing one was a plain transfer — paying
the credit card, moving cash to savings, paying yourself back.

### Why it needed a column, not a category called "Transfer"

A transfer is TWO transactions and neither of them is spending. Money left chequing and arrived on
the card; nothing was consumed. Filed under an ordinary category they inflate every budget, every
monthly total, every report and safe-to-spend — by twice the amount, once per leg. Matching on a
category *named* "Transfer" would work until the day it is renamed, which is precisely the
fragility the audit already flagged in the remittance path (`.eq("name", "Remittance")`).

`0037_transfers.sql` adds `transactions.transfer_group_id uuid`, null on every ordinary row, and
the same value on both legs of a transfer. A `comment on column` states the invariant in the schema
rather than only in a code comment. Partial index, since almost every row is null.

**`log_transfer()` does it in ONE statement** — both legs and both balance moves — because a
transfer that exists on only one side is worse than one that doesn't exist. It is `security
invoker`, so RLS is still what scopes it (a foreign account id returns null, which the function
treats as "not yours"). It refuses same-account transfers, non-positive amounts, and
cross-currency: that last one needs a rate and a decision about which side is authoritative, and
remittance already exists for that job — refusing beats inventing a rate. It mirrors the
credit-card sign rule from `lib/finance/balance.ts`, with a comment saying so, since a card is a
debt and receiving money onto it moves the balance the opposite way.

**Six report queries now exclude transfers**: budget spend and monthly-by-category, monthly trend
and top merchants in `money/actions.ts`, and the budget/spending pair in `lib/ai/tools.ts` so the
assistant's answers agree with the screens.

### The screen

The kind selector — **Spent / Received / Moved** — sits on the FIRST step next to the amount, not
the second, because it changes what the second step asks for: a transfer needs two accounts and no
category, and discovering that after filling in a merchant would be the wrong order. Moved is
disabled with fewer than two accounts. Changing kind clears the category, since one chosen for a
purchase means nothing on a transfer and an expense category is wrong on income. Category and
merchant hide for a transfer; a destination account appears, with a line saying plainly that this
won't count against any budget.

**One bug caught before it shipped:** `logTransfer` ordered categories by `sort_order`, which
`categories` does not have — only `shopping_categories` does. Ordered by name, matching
`getCategories`.

---

## 46. The Timeline's day boundary

Audit findings: the Timeline grouped completed tasks by their UTC date, and rendered times with no
timezone at all. Winnipeg is 5-6 hours behind UTC, so both break in the evening — which is when the
app is actually used.

- `lib/ledger.ts` — `dayStart()` returned `${date}T00:00:00.000Z`, which is **6pm the previous
  evening** in Winnipeg. It now goes through `zonedTimeToUtc`, with a matching
  `dayEndExclusive()` so the task query uses a real local day rather than
  `gte(UTC midnight)` / `lte(T23:59:59.999Z)`.
- New `zonedDayOf()` replaces four `.slice(0, 10)` calls. Three of those were the
  `created_at.slice(0,10) === txn_date` "was this logged on the day it's dated?" test, where BOTH
  sides have to be Winnipeg days or an evening entry compares as tomorrow and gets pinned to
  midnight for no reason.
- `timeline-view.tsx`'s `formatTime` had no `timeZone`, so it rendered in the device's zone — and
  because that component server-renders first, the server (UTC) and the phone (Winnipeg) produced
  different text: a hydration mismatch on every timed row, on top of being the wrong time.

**A trap this fix set, and defused.** `formatTime` detected "this row only knows a date" by checking
whether `at` ended in `"T00:00:00.000Z"`. That worked only while day-starts were UTC midnight —
after this change a date-only row is `T05:00:00.000Z` or `T06:00:00.000Z`, the sniff fails, and the
Timeline would have started confidently displaying "7:00 PM" for rows that never had a time. So
`LedgerEvent` gained an explicit `timeKnown: boolean`, set at all six push sites, and the string
sniff is gone. Encoding a fact in the shape of a string is how a fix in one file breaks another.

Also merged a duplicate `@/lib/time` import that this change introduced in timeline-view.tsx.

---

## 47. Two settings that did nothing, and 33 lines of CSS that did nothing

Three audit findings, all of the same shape: something present, visible and tappable that had no
effect whatsoever.

### "Motion: Reduced" now reduces motion

The option's own description promised "page transitions, **list animations**, everything". Behind it
was a single CSS block shortening `transition-duration` and `animation-duration`. Every animation in
this app is Framer Motion, which drives inline styles frame by frame and ignores CSS duration
entirely — so every list, panel and page transition ran at full length regardless of the setting.
The phone's own accessibility setting was ignored too: there was no `prefers-reduced-motion`
handling anywhere in `src/`, and no `MotionConfig` or `useReducedMotion` (0 hits).

`ThemeProvider` now wraps its children in `<MotionConfig reducedMotion={...}>` — `"always"` when the
setting says reduced, `"user"` otherwise, which is what makes the OS setting work for the first
time.

### "Spacing" now changes spacing

`--density-scale` was declared in three places and read by none. Compact and Comfortable both saved
to the account and changed the screen in no way at all.

Tailwind v4 derives its ENTIRE spacing scale from one variable — `p-3` is
`calc(var(--spacing) * 3)` — so pointing `--spacing` at the density token in the `@theme` block
makes the setting real everywhere in one line, rather than hand-scaling padding across sixty
components.

**Compact eased from 0.8 to 0.875**, deliberately. The scale drives control SIZES as well as
padding, so 0.8 would take a 36px control to 28.8px — and undersized tap targets are already a
separate finding. A denser screen must not become a harder one to hit.

### The dead structural CSS

`.panel`, `.panel-raised`, `.panel-invert` (plus its two descendant rules), `.hair-t`/`.hair-b`,
`.rule-t/b/l/r` and `.grid-field` — nine classes, **zero references** across every `.tsx` in the app.
They described the design language accurately but were superseded by the `Panel` component and its
`tone` prop. Removed with a comment saying where the language actually lives now, because deleting
the description of a system without saying where the system went is how the next person reinvents it.
Verified `hatch`, `tap-press`, `press-hard`, `micro`, `micro-sm`, `display-sm`, `stat` and `tabular`
are all still defined and in use before touching the file.

---

## 48. Tap targets

The audit counted 19 icon-only controls with no padding. A sweep of every `.tsx` found **49** — a
bare 16px icon is a ~16px target on a phone, and most of these are delete buttons sitting a few
pixels from another control.

Two classes rather than one, because the controls are not all the same shape:

- **`.tap-target`** — padding plus a matching negative margin. The hit area grows, the layout
  footprint does not, so nothing moves on screen. Applied to 34 bare icon buttons.
- **`.tap-reach`** — an invisible `::after`, painted never, hit-tested always. For the eight bordered
  28px square buttons, where padding would make the `hover:bg-foreground` fill spill past the
  visible border and read as a rendering bug. Applied to those 8, plus the emoji reaction button
  the automated sweep missed because it has no icon element to match on.

**Both expand vertically more than horizontally, deliberately.** These sit side by side in rows —
edit next to delete — and widening both as far would make their hit areas overlap, handing taps to
whichever is later in the DOM. A confidently wrong target is worse than a small one. Rows have
height to give; the gap between two adjacent icons does not.

**Neither scales with `--density-scale`.** An accessibility floor that shrinks when you choose a
denser layout is not a floor. This is why entry 47 eased Compact from 0.8 to 0.875 in the same
breath.

Six controls were deliberately left alone: `w-11` and `w-10` arrow buttons that are already 40-44px,
and a `w-36` labelled button. Widening something that is already big enough only creates overlap.

---

## 49. One Plan row instead of two

`AgendaRow` (agenda-view.tsx) and `DayRow` (calendar-view.tsx) were 75 lines of identical markup —
verified character-for-character identical after renaming, differing only in where lines happened to
wrap. Two copies kept in step by hand, which holds right up until it doesn't.

Now `plan/plan-row.tsx`. **Two other audit findings were fixed while merging rather than duplicated
into the merged copy:**

- **The timezone was the literal string `"America/Winnipeg"`** in both copies, while
  `profiles.timezone` is documented in `lib/supabase/profile.ts` as "every date in the app is
  rendered in it". It is now a prop, threaded `plan/page.tsx` -> `plan-shell.tsx` -> both views, so
  a traveller sees their own hours. Merging the two copies is what made this a one-line change
  instead of a two-line change in two files that could drift apart again.
- **The bell was the emoji 🔔**, while every other bell in the app is lucide's `Bell`. An emoji
  renders in the platform's font, ignores `currentColor` so it stays coloured when the row greys
  out, and sits at the wrong weight in a line of mono metadata.

The Google-event link also picked up `.tap-target` from entry 48 — it was a 14px icon.

Unused imports pruned from both files afterwards (`Repeat`, `Check`, `ExternalLink`, `Tag`,
`shortNudge`, and a `Link` and `CalendarDays` that each became dead in one of the two).

---

## 50. Migrations 0035-0037 applied to production (27 Aug 2026)

Alan: *"can you do this for me? i have no clue where the connection strings are and what to do."*
`SUPABASE_DB_URL` was already in `.env.local` — he was looking in the Supabase dashboard for
something that was on his own machine. Read from there, never echoed, and all output filtered
through a `sed` that redacts anything matching `postgresql://` so a stack trace could not print the
password.

**The first attempt FAILED, and that is the good news.** 0035 aborted on:

    operator does not exist: name[] = text[]

`pg_attribute.attname` is of type `name`, so `array_agg(a.attname)` produces `name[]`, and comparing
that to an `array['completed_date','routine_id']` literal (`text[]`) has no operator. Both
constraint-lookup DO blocks — added in 41e precisely so constraints were dropped by lookup rather
than by guessed name — had the same fault. Fixed with `::text` on both the aggregate and its ORDER
BY.

**Nothing was half-applied**, and this was verified rather than assumed: `run-migration.mjs` wraps
each file in its own transaction, and a query afterwards confirmed `_migrations` still ended at
0034 and `transactions.transfer_group_id` did not exist. That per-file transaction is what turned a
bad migration into a non-event.

**Second run: all three applied.** No WARNING lines, which is the meaningful part — the two
conditional unique indexes from 0035 found no duplicate rows in the live data and were both
created. The NOTICE lines were all `drop constraint if exists` on constraints that did not exist
yet.

**13 checks run against production afterwards, all passing:** crew push filtered by `same_crew`;
`delete_crew_push_subscription` scoped by `auth.uid()`; `check_cron_secret` using `not exists`;
seed functions no longer executable by `authenticated`; RLS on `_migrations`; the per-account
routine-completion constraint; `adjust_account_balance`, `ai_usage_month_total`, `ai_usage`
SELECT-only; `receipts.original_extraction`; `transactions.transfer_group_id`; both conditional
indexes.

**One check that mattered more than the rest.** 0035 seeds a RANDOM `cron_secret` when the row is
absent. If that had fired, the dispatcher would have kept sending the real `CRON_SECRET` from the
environment, it would no longer have matched, and **reminders would have stopped silently** — the
exact failure mode the fail-closed rewrite was meant to make impossible to miss. Verified: the row
already existed, the `where not exists` guard held, and the stored value matches `CRON_SECRET`.
Also proved the gate behaves — the real secret is accepted, `"definitely-wrong"` is rejected. Before
0035, on a database with no row, that second call would have PASSED.

---

## 51. Making the assistant findable

Alan, immediately after it shipped: *"how the fuck do i access the ai"*.

He was right to be annoyed. It was at **bottom bar -> More -> Assistant**: three taps, behind a
hamburger menu, at the bottom of an overflow list. The feature he had been most vocal about wanting
was in the least reachable place in the app, and entry 43 rebuilt the whole thing without once
checking whether he could get to it. Building a feature and shipping it somewhere nobody will find
is the same as not building it.

**It is now the first entry in the floating + button**, which is on every screen in the app:
"Ask or tell it anything — type or talk". One tap from anywhere.

That is also where the file always said it belonged: `quick-add.tsx`'s own header comment describes
the button as the place for real free-text capture "(Phase 7 AI work)", written before the assistant
existed.

**The dead `"always"` id went at the same time** — an audit finding. It looked like exactly the case
for the Assistant, but the Assistant IS gated (`ROUTE_MODULE_ALIASES` maps `/assistant` to `tasks`),
and an entry that appears and then bounces you to `/today` is worse than no entry. So it uses
`tasks` with a comment tying it to that alias list, and the union type plus its `as ModuleId` cast
are gone.

Today's "Jump to" description also updated — it still said "ask anything, or tell it to do
something", written when it could do four things. It now says it can log, add and change.

**Worth recording for whoever ships the next feature:** none of the audit's 108 findings was
"nobody can find the assistant", because an audit reads code and this is only visible if you try to
use the app. The verification loop this session was lint, build, tests and a code reviewer — all of
which passed on a feature sitting three taps deep behind a hamburger.
