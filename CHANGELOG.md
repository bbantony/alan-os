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
