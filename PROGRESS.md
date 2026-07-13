# Alan OS — Progress Checklist

This file tracks build progress phase by phase. Updated after every completed feature.
See `SPEC.md` for the full specification.

---

## Phase 0 — Foundation
- [x] Repo initialized (Next.js App Router + TypeScript)
- [x] Private GitHub repo created and pushed (github.com/bbantony/alan-os)
- [ ] Supabase project connected
- [ ] Auth: email/password + invite-code signup
- [ ] `profiles` table + roles (owner | workout_member | full_user)
- [ ] RLS baseline enabled
- [ ] PWA: manifest, service worker, installable
- [x] Full design system (Part C): colors, fonts, dark mode, motion, empty states
- [ ] App shell + navigation (mobile bottom tabs, desktop sidebar, role gating)
- [ ] Settings → Appearance editor (palette picker, fonts, density)
- [ ] Deployed to Vercel with live URL
- [ ] Tested on Android phone (installed to home screen)

## Phase 1 — Warm-up
- [ ] Shopping list (complete, incl. staples logic + offline)
- [ ] Tasks (horizons, subtasks, work category)
- [ ] Basic Today dashboard (static widgets, no AI yet)

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
**Current status:** Starting Phase 0.
