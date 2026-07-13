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
- [x] Shopping list (complete, incl. staples logic + real offline write-queue/sync)
- [x] Tasks (horizons, subtasks, work-hours collapsible group, quick chips, archive)
- [x] Today dashboard — full widget layout (real Tasks/Shopping widgets now;
      Money/Workout/Calendar/Journal/Weather/News widgets show styled
      "arrives in Phase N" placeholders until those modules ship)

## Phase 2 — Workout
- [ ] Exercise master list (crew-shared, seeded ~40 PPL exercises)
- [ ] Logging a lift session (sets, last-session display)
- [ ] Logging a run
- [ ] Crew feed + realtime
- [ ] Reactions/comments
- [ ] Streaks
- [ ] PR detection + celebration
- [ ] Invite flow + role gating
- [ ] Onboard the 3 friends

## Phase 3 — Reminders & Calendar
- [ ] Web Push infra (VAPID, subscriptions per device, Vercel cron dispatcher)
- [ ] Reminders CRUD w/ RRULE presets
- [ ] Google Calendar OAuth
- [ ] Agenda view + event creation
- [ ] Day-planner ritual (morning pick / evening plan, auto-pull)

## Phase 4 — Finance core
- [ ] Accounts, categories
- [ ] ≤5s manual expense logging
- [ ] Budgets (payday-anchored periods)
- [ ] Savings goals
- [ ] Debts + payoff projections
- [ ] INR remittances
- [ ] Reports

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
**Current status:** Phase 1 complete, built and verified locally (build/lint/typecheck
clean, RLS verified under real auth context). Live at https://alan-os-nine.vercel.app
once pushed and deployed — test on your phone to confirm before starting Phase 2.
Next session: "Read SPEC.md. Phase 1 is complete and deployed. Execute Phase 2 only."
