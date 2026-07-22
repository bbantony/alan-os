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
- [x] Receipt scanning pipeline + review UI (upload → Storage → review screen
      with editable merchant/date/line items/categories → approve as one
      transaction or split by category)
- [x] Shopping cross-check hook (fuzzy-matches approved receipt line items
      against the shopping list, auto-checks matches, advances staple
      timers — plain string matching, works today with no AI needed)
- [x] CSV import w/ categorization (column-mapping UI for any bank export
      format, duplicate detection by date+amount+merchant, heuristic
      recent-merchant categorization with AI as an optional second pass)
- [ ] **Owner action**: get a free Google AI Studio (Gemini) API key and
      paste it into Vercel + `.env.local` as `GEMINI_API_KEY` — see
      MANUAL.md's Phase 5 section. Until then, receipt scanning and CSV
      categorization both fall back to fully manual entry (by design, not
      a bug) — everything else in this phase already works without it.

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

Phase 5 (Finance AI) is built and deployed. Every non-AI part (receipt
upload/storage/review UI, the shopping cross-check hook, CSV import with
column mapping and duplicate detection) is fully functional right now — the
only piece waiting on the owner is a Gemini API key, which upgrades receipt
scanning and CSV categorization from manual entry to automatic. Verified
against the live database: RLS + the storage bucket's per-user folder policy
were both exercised for real (not just read over) — confirmed a user can
upload into their own folder and is blocked from writing into anyone else's
— plus a full receipt→transaction→shopping-cross-check round trip, and that
the transactions.receipt_id foreign key genuinely rejects a bogus id.

---

## Admin & Permissions Overhaul + App-Wide Design Polish (not a numbered
SPEC.md phase — a cross-cutting initiative requested directly by the owner)

### Part 1 — Admin & Permissions Foundation
- [x] Real crew groups (`crews` table) the owner creates/renames/deletes and
      assigns any user to — replacing the old "every authenticated user sees
      every workout" model with actual group boundaries.
- [x] Per-user `module_access` grid (Tasks/Shopping/Workout/Calendar/Money/
      Journal/Vinyl, each independently toggle-able) replacing the rigid
      3-role gate — the owner decides exactly what each account can open.
- [x] Owner always sees every crew's activity regardless of his own crew
      membership (`is_admin()` override), on top of normal same-crew
      visibility for everyone else.
- [x] `src/lib/permissions.ts` — one shared resolver, replacing 3
      independently-drifting checks that used to live in `proxy.ts`,
      `nav-items.ts`, and `settings/page.tsx`.
- [x] New Settings → Admin (Users &amp; Crews) page, owner-only, replacing
      the old read-only `/workout/invite` page entirely.
- [x] Today dashboard widgets and nav now respect module_access — a
      restricted account never sees a dashboard tile or nav link for a
      module it can't open.

### Part 2 — Design System Foundation
- [x] `src/lib/motion.ts` — shared Framer Motion variants (list stagger,
      fade-in-up, dialog pop-in) extracted from the one place they were
      already done well, so every module gets the same 150-250ms feel.
- [x] `--shadow-sm/md/lg` elevation scale in `globals.css` (light + dark
      tuned separately), wired into Tailwind as real `shadow-*` utilities.
- [x] New primitives: `segmented.tsx` (animated sliding active-pill),
      `switch.tsx`, a lightweight native-`<select>` wrapper (`select.tsx`),
      and `toast.tsx` (sonner, palette-aware, wired into the root layout).
- [x] Deleted the broken/unused `tabs.tsx`; fixed `money/goals-view.tsx`'s
      two hand-rolled sheets to use the real `Dialog` primitive.

### Part 3 — Module-by-Module Polish Pass
- [x] Consolidated the 3 genuinely-duplicated single-row tab bars (Money,
      Calendar, Workout feed) onto the new `Segmented` control.
- [x] Today dashboard: the 5 "coming soon" tiles now show the existing
      `ComingSoonIllustration` instead of a plain dashed border; the whole
      grid + `DayPlannerCard` get a subtle staggered entrance.
- [x] Toast feedback wired into every previously-silent save/delete/approve
      action in Money (accounts, budgets, goals, debts, quick-log,
      remittances, receipt approve/discard, CSV import), Tasks (delete,
      remind-me), and the new Admin page (crew/module-access changes).
- [x] Workout: a small "your crew logged N sessions this week" stat strip,
      a natural fit now that crews are real groups instead of "everyone."
- [ ] Not yet touched: Shopping/Calendar/Settings' own forms still use
      plain `<select>`/ad-hoc markup rather than the new primitives, and
      Settings doesn't yet have a two-column desktop layout. Left for a
      future pass rather than claimed as done — the highest-value items
      (the admin system itself, the design foundation, and the most-used
      module) came first.

### Resolved
The second `role = 'owner'` account (`antonyalbert03@gmail.com`, "Albert")
found during Part 1 has been demoted to `full_user` per the owner's
explicit instruction — he keeps full access to every module (nothing
changed about what he can use day to day), he's just no longer an admin:
no Admin page, no cross-crew oversight override. `antonyalan99@gmail.com`
is now the sole `owner`.

---

Next session: "Read SPEC.md. Phase 5 is complete and deployed. Execute
Phase 6 only" (once the owner actions from Phases 3 and 5 — Google OAuth
credentials, the cron-job.org pinger, and the Gemini API key — are done,
since none of Phase 6's Journal/Vinyl work depends on them, but full
reminders/calendar delivery and AI receipt scanning still do) — though the
Admin/Design overhaul above takes priority per the owner's latest request.
