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
