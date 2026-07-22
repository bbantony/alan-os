# Alan OS — Progress Checklist

This file tracks build progress phase by phase. Updated after every completed feature.
See `SPEC.md` for the full specification.

---

## Phase 0 — Foundation
- [x] Repo initialized (Next.js App Router + TypeScript)
- [x] Private GitHub repo created and pushed (github.com/bbantony/alan-os)
- [x] Supabase project connected (profiles table, RLS, migration via scripts/run-migration.mjs)
- [x] Auth: email/password + invite-code signup
- [x] `profiles` table + roles (owner | workout_member | full_user)
- [x] RLS baseline enabled
- [x] PWA: manifest, service worker, installable
- [x] Full design system (Part C): colors, fonts, dark mode, motion, empty states
- [x] App shell + navigation (mobile bottom tabs, desktop sidebar, role gating)
- [x] Settings → Appearance editor (palette picker, fonts, density)
- [x] Deployed to Vercel with live URL (https://alan-os-nine.vercel.app)
- [x] Tested on Android phone (installed to home screen) — confirmed working by owner

## Phase 1 — Warm-up
- [x] Shopping list (complete, incl. staples logic + real offline write-queue/sync;
      user-owned/editable categories with learned corrections, optional
      quantity+unit, Settings → Shopping category management, Finish Trip
      confirmation, custom vector illustrations)
- [x] Tasks (horizons, subtasks, work-hours collapsible group, quick chips, archive)
- [x] Today dashboard — full widget layout (real Tasks/Shopping widgets now;
      Money/Workout/Calendar/Journal/Weather/News widgets show styled
      "arrives in Phase N" placeholders until those modules ship)

## Phase 2 — Workout
- [x] Exercise master list (crew-shared, seeded 43 PPL exercises, soft-dedupe
      "did you mean X?" + hard unique-name backstop)
- [x] Logging a lift session (sets, last-session display, progressive-overload
      nudge, duplicate-last-set, saved routine templates)
- [x] Logging a run
- [x] Crew feed + realtime (Supabase Realtime across workouts/sets/runs/prs/
      reactions/comments)
- [x] Reactions/comments
- [x] Streaks (with a bonus one-forgiven-miss-per-week grace, owner request)
- [x] PR detection + celebration (confetti, live for crew watching the feed)
- [x] Invite flow + role gating (server-side route guard in proxy.ts, not just
      hidden nav — closes a gap found during Phase 2: a workout_member could
      previously reach any URL by typing it directly)
- [ ] Onboard the 3 friends — owner action: send the invite link from
      Workout → invite icon to each friend once this phase is deployed

## Phase 3 — Reminders & Calendar
- [x] Web Push infra (VAPID keys generated + set; DST-aware RRULE recurrence;
      dispatcher route with an atomic claim so it can never double-send;
      signed per-reminder action tokens for Done/Snooze so a dormant PWA's
      expired session can't silently break them; service worker push +
      notificationclick handlers)
- [x] Reminders CRUD w/ RRULE presets (daily/weekdays/weekly/every-N-days/
      monthly/custom), pause/resume/snooze (15m/1h/3h/tomorrow 9am in-app,
      fixed 1h from the push notification itself), delete
- [x] Google Calendar OAuth (code written and verified against Google's
      libraries — **owner action needed**: create the OAuth credentials in
      Google Cloud Console, see MANUAL.md)
- [x] Agenda view + event creation (Today/Week, merges Google Calendar events
      + reminders + tasks-with-due-dates into one timeline — the Tasks↔Calendar
      hook from SPEC.md Part B4)
- [x] Day-planner ritual (today's-focus display with auto-pull fallback,
      evening plan-tomorrow ritual with task search + free-text goals +
      1-line reflection, quiet "yesterday's reflection" callback)
- [x] Bonus: one-tap "Remind me" on any task with a due date (added minimal
      due-date support to Tasks, which didn't have any UI for it before)
- [x] Bonus: wired the real crew push notification for workout PRs that
      Phase 2 deferred (LATER.md) — now sends to the rest of the crew's
      devices, not just an in-app celebration
- [ ] **Owner action**: create Google OAuth credentials (Google Cloud
      Console) and paste into Vercel env vars — see MANUAL.md for exact steps
- [ ] **Owner action**: sign up for a free cron-job.org account and point it
      at `/api/cron/reminders` with the bearer secret — see MANUAL.md
      (Vercel's own free-tier cron can only run once/day, too infrequent for
      timely reminders, so this external pinger is the real delivery clock;
      a once-daily native Vercel Cron entry was added too, as a backup +
      to keep the Supabase project from pausing on inactivity)

## Phase 4 — Finance core
- [x] Accounts (chequing/credit card/investment/cash, CAD or INR, credit
      utilization bars), user-owned categories (13 seeded defaults, create/
      archive in Settings → Money)
- [x] ≤5s manual expense logging (2-step quick-log: amount keypad +
      category/account/merchant, merchant-memory autocomplete, optimistic UI)
- [x] Budgets (payday-anchored weekly/biweekly/monthly periods with
      short-month clamping, safe-to-spend banner, per-category progress bars)
- [x] Savings goals (progress rings, add-to-goal, deadlines)
- [x] Debts + avalanche/snowball payoff projections (extra-payment slider,
      months-to-payoff + total interest + payoff order, 600-month safety cap)
- [x] INR remittances (CAD-sent/INR-received log, live FX rate via
      frankfurter.app, running totals)
- [x] Reports (spend-by-category donut w/ validated categorical palette,
      6-month trend bar chart, top merchants, month navigator)
- [x] Today dashboard "Money" widget wired to real safe-to-spend data
- [x] Settings → Money category management page

## Phase 5 — Finance AI
- [ ] Receipt scanning pipeline + review UI
- [ ] Shopping cross-check hook
- [ ] CSV import w/ AI categorization

## Phase 6 — Journal & Vinyl
- [ ] Photo-a-day + reminder + gallery
- [ ] Vinyl log + iTunes art + shelf
- [ ] `/frame` wall display route

## Phase 7 — AI everywhere
- [ ] Quick-capture parser + confirm chips
- [ ] Morning briefing cron
- [ ] Weekly reviews
- [ ] Month in Review

## Phase 8 — Later/optional
- [ ] Polar AccessLink + Fitbit API auto-sync for runs
- [ ] Upgrade friends to full_user
- [ ] Wealthsimple tracking improvements
- [ ] Work-phone/sales workflow refinements

---
**Current status:** Phase 2 is live and has been iterated on across several rounds of
owner feedback (UI redesigns, per-user exercise lists, barbell entry mode, workout
deletion) — see CHANGELOG.md for the full history. Onboarding the 3 friends is still
the owner's own pending action.

Phase 3 (Reminders & Calendar) is built, verified against the live database (migration
+ RLS + the full dispatcher pipeline were actually exercised end-to-end with real test
data, not just read over), and deployed — but reminders won't actually be delivered
and Google Calendar won't connect until the two owner actions above are done. See
MANUAL.md's Phase 3 section for exact click-by-click steps.

Phase 4 (Finance core) is built, verified against the live database (RLS +
seeded categories + a full budget-spend round trip were actually exercised
with real inserts/rollback, not just read over), build/lint clean, and
deployed. No owner action is required for Phase 4 — everything works out of
the box (money never touches a service-role client; every table uses the
same `auth.uid() = user_id` RLS pattern already proven in every prior phase).

Next session: "Read SPEC.md. Phase 4 is complete and deployed. Execute
Phase 5 only" (once the two Phase 3 owner actions — Google OAuth credentials
and the cron-job.org pinger — are done, since Phase 5's receipt pipeline is
independent of those but full Calendar/reminders delivery still needs them).
