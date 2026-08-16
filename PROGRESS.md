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
- [x] **Owner action, done 2026-08-12**: cron-job.org account created,
      pointed at `/api/cron/reminders` with the bearer secret, pinging every
      1-5 minutes. Verified live: a real reminder fired on its own with no
      manual trigger. Reminders (tasks and routines both) now arrive at
      their actual scheduled time instead of waiting for the once-daily
      Vercel Cron backup.

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
data, not just read over), and deployed. Reminders now actually arrive on time — the
cron-job.org pinger owner action is done and confirmed live (see CHANGELOG.md entry 20).
Google Calendar still won't connect until the OAuth-credentials owner action above is
done — see MANUAL.md's Phase 3 section for exact click-by-click steps.

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

### Part 4 — Finishing the sweep (Shopping, Calendar, Settings, and every
remaining plain `<select>` app-wide)
- [x] Shopping: category/unit pickers now use `Select`; new feature — a
      "Groceries budget remaining" banner pulling from Money's real
      period-aware budget calculation (the SPEC.md Part B4 Shopping↔Finance
      hook, never actually wired up until now), hidden for accounts without
      Money access.
- [x] Calendar: consolidated a second duplicated tab bar (Agenda's
      Today/Week toggle) onto `Segmented`; list motion + toast feedback
      added to Agenda/Reminders/reminder-form; the hand-rolled "On/Off"
      sync pill replaced with the real `Switch`. New feature — Agenda items
      are no longer read-only: tapping a reminder jumps to the Reminders
      tab, tapping a task jumps to Tasks.
- [x] Settings: every remaining plain `<select>` app-wide (Money's 5 forms,
      Money settings + CSV import wizard, Tasks' add-row, Workout's
      exercise picker/manager) now uses `Select` — the only two left are
      deliberate ultra-compact inline per-row pickers where the primitive's
      chevron would dominate. New two-column desktop layout
      (`settings-links.ts` + `settings-nav.tsx` shared between the mobile
      index and the persistent desktop sidebar, removing the duplication
      between them) via `settings/layout.tsx` — mobile unchanged. New
      feature — an account card on the Settings index (avatar initial,
      name, email, role badge), useful now that multiple real accounts
      exist in the system.

### Resolved
The second `role = 'owner'` account (`antonyalbert03@gmail.com`, "Albert")
found during Part 1 has been demoted to `full_user` per the owner's
explicit instruction — he keeps full access to every module (nothing
changed about what he can use day to day), he's just no longer an admin:
no Admin page, no cross-crew oversight override. `antonyalan99@gmail.com`
is now the sole `owner`.

### Production incident (found and fixed the same day)
`DashboardWidget` and `SettingsNav` were converted to Client Components in
Parts 2-4 above but are rendered from Server Components that were passing
bare icon component references as props — not serializable across that
boundary, which crashed every single `/today` load (the page every login
lands on) with a black screen. Found via live Vercel runtime logs, fixed
in both places, swept the rest of the codebase for the same pattern (found
nowhere else), and confirmed via fresh logs that the error stopped
appearing after the fix deployed. See `CHANGELOG.md` entry 16 for the full
diagnosis.

### Part 5 — Bug reports + more feature requests (nav, Tasks redesign, Appearance overhaul)
- [x] Bottom nav: Shopping moved from More into the primary tab bar.
- [x] Removed the non-functional floating quick-capture "+" button (real
      quick-capture is Phase 7; a placeholder that does nothing but say
      "coming soon" on every screen was worse than not having it).
- [x] **Tasks module — complete redesign.** One grouping dimension
      (horizon) instead of Work getting a whole separate nested section;
      removed the buggy "Follow up with"/"Call" quick-chips; task rows
      simplified from 6-7 crammed controls down to checkbox/title/bell/
      delete, with horizon/category/due-date/repeat/notes moved into a
      tap-to-open detail dialog. New: recurring tasks (migration `0019`,
      reusing reminders' own rrule + DST-aware next-occurrence math) —
      completing a recurring task spawns its next instance automatically,
      and can carry its own recurring reminder.
- [x] **Appearance overhaul.** 5 new palettes (11 total), 3 new heading
      fonts + a newly-configurable body font (6 heading / 2 body options,
      up from 3 / 1 fixed), and real page-transition animation on every
      route change via a new Motion (Full/Reduced) preference.
- [x] **Push notifications — diagnosed, not a code bug.** Manually
      triggered the live dispatcher; it correctly claimed and pushed both
      overdue reminders, proving the whole pipeline (subscription →
      dispatcher → VAPID → service worker) works. The actual gap is
      unchanged from Phase 3: the free cron-job.org pinger that's supposed
      to hit the dispatcher every 1-5 minutes still hasn't been set up —
      see the Phase 3 owner action below. (Considered self-hosting this via
      a GitHub Actions scheduled workflow to remove the owner-action
      entirely, but the real numbers don't work: 5-minute cadence is
      ~8,640 runs/month, GitHub bills a full minute per run minimum, and
      the private repo's free allowance is 2,000 minutes/month — that
      would trade "never set up" for "silently stops working mid-month.")
- [x] **Banking research (Plaid/Flinks/etc.) — answered, not built.** See
      the plain-English answer in the conversation / `CHANGELOG.md` entry
      17. Genuinely connecting bank accounts would be its own planned
      phase (OAuth-style linking flow, a new table, a sync job), not
      something to bolt on inline — flagged for the owner to decide on,
      not started.

### Part 6 — Routines + One Timeline unification (Tasks/Calendar/Reminders redesign)
- [x] **New Routines module.** Migration `0020` adds `routines`,
      `routine_steps`, `routine_completions` (strict per-user RLS) plus a
      `reminders.linked_routine_id` column. A routine is a repeating habit
      tracked with a streak (single habit or multi-step checklist), living
      inside the Tasks page rather than a new nav tab.
- [x] **Fixed 4 real bugs found during the redesign research**, not just
      "the owner is confused": a recurring task's reminder no longer orphans
      after the task's first completion; the bell-icon reminder path now
      copies a task's recurrence rule (previously only the detail-dialog
      path did); the Agenda no longer shows a task+its reminder as two
      separate entries; the evening-ritual's picked goals now show "X of 3
      done" instead of never being checked again.
- [x] **Shared streak math promoted.** `src/lib/streaks.ts` is now the one
      copy of the streak-with-one-forgiven-miss logic; Workout re-exports
      from it unchanged. New `<StreakBadge>` component replaces two
      copy-pasted Flame+number snippets.
- [x] **Today dashboard consolidated.** The old "Tasks" widget, "Calendar &
      Reminders" widget, and `DayPlannerCard` (three overlapping,
      non-cross-referenced views of overlapping due-today data) are now one
      `<TodayTimeline>` card: routines due today, tasks due/overdue, next
      calendar event, the evening ritual, and a single "what's next" line at
      the top.
- [x] **The "innovative" piece**: a plain-SQL (no AI) nudge — a task title
      added 3+ times in 45 days offers to become a routine with one tap.
- [x] Full plan researched and approved via plan-mode before any code, per
      the owner's explicit "come up with a plan first" ask; verified against
      the live database (schema/RLS/cascade-delete, a full routine lifecycle
      round trip, the recurring-task-reminder fix, `isDueOnDate` against
      daily/weekly/every-N-days patterns) both before and after building.
- [x] **Bug fix, post-launch**: routines had no view/edit screen (only
      create), and a new routine's first reminder could fire immediately
      instead of at its scheduled time whenever that time had already
      passed today. Added a shared create/edit form (pencil icon on every
      routine card, always visible — the old delete icon was hover-only and
      unreachable on a phone) and a `firstReminderInstant()` helper that
      correctly rolls forward to the true next occurrence. See CHANGELOG.md
      entry 19.

### Part 7 — Full Google Calendar sync + inline task creation + Tasks page redesign
- [x] **Automatic, full Google Calendar sync.** Every task with a due date,
      every routine with a time of day, and every standalone reminder now
      mirrors to Google Calendar on its own — no per-item toggle (the old
      "Also add to Google Calendar" checkbox is gone). A routine/reminder
      that repeats mirrors as one real recurring Google Calendar event
      (Google's own `recurrence` field, fed the same RRULE text this app
      already stores) instead of the old one-off mirror that never advanced
      past its first occurrence. A task/routine's own push reminder no
      longer double-mirrors — the due date/time-of-day already covers the
      calendar side. Connecting for the first time backfills existing data
      so nothing already on the books stays invisible. New migration
      `0021_calendar_sync_columns.sql`, new `src/lib/gcal/sync.ts`. Still
      waiting on the same owner action as always for this to go live: Google
      OAuth credentials (Phase 3, above) — the code is fully wired and
      dormant/harmless without it.
- [x] **Inline task creation.** The Tasks quick-add bar stays exactly as
      fast as it was (type + Enter), with a new "More options" toggle that
      expands in place for due date/time, category, repeat, and reminder —
      no trip back into the task afterward needed unless you want one.
- [x] **Tasks page decluttered + given real payoff.** Routines now default
      to a collapsed one-row strip (tap to expand into the full grid) so
      Tasks gets top billing instead of competing with it. Horizon sections
      now show live "N done today" counts and a friendly "All clear" line
      once a section empties out — previously a cleared section just
      silently vanished with zero feedback.
- [x] Shared `RecurrencePicker` component extracted (was duplicated in
      `TaskDetailDialog`, the routine form, and now the new inline panel);
      new `parseRecurrenceFromRRule()` helper fixes a pre-existing bug where
      re-saving an edited task/routine without touching the weekday/interval
      picker would silently reset it to the default.
- [x] Full plan researched and approved via plan-mode before any code, per
      the owner's request to "suggest your best ideas before execution";
      three concrete UX decisions (quick-add style, payoff style, Routines
      layout) put to the owner directly rather than assumed. Verified:
      build/typecheck/lint clean; the new `gcal_event_id` columns and a
      real insert/update round trip confirmed against the live database.

### Part 8 — Google Calendar credentials done; sync errors surfaced
- [x] **Owner action complete, 2026-08-12**: `GOOGLE_CLIENT_ID` and
      `GOOGLE_CLIENT_SECRET` added in Vercel. This was the last remaining
      *blocking* owner action anywhere in the app.
- [x] Backfill-on-connect was silently failing with no visible reason.
      `syncToGcal()`/`backfillGcalSync()` now return a real result (counts +
      the actual Google API error) instead of swallowing exceptions; the
      Settings page shows a failure instead of a bare "Connected", and a new
      **"Sync now"** button retries without disconnecting. See CHANGELOG.md
      entry 22.
- [ ] **Owner action, small**: open Settings → Calendar and tap **Sync now**.
      The fix deployed but nobody has confirmed the sync actually succeeds —
      it either works, or it finally shows the real error.

---

## App-wide redesign — the "Swiss Instrument" design language (not a numbered
SPEC.md phase — requested directly by the owner: "I really don't like the
design of this thing… just get to work and make it awesome")

- [x] **Viability analysed first** (CHANGELOG.md entry 23), then built with
      blanket autonomy. The Bauhaus reference the owner supplied was written
      for a marketing landing page (hero, pricing, blog, testimonials, final
      CTA), so it was translated to Swiss/International Typographic — the
      application-scale descendant — rather than copied.
- [x] **New token foundation** in `globals.css`: radius 0 everywhere, a
      two-weight border system (`--rule-w` frames a panel, `--hairline-w`
      separates rows inside one), hard offset shadows reserved for things
      genuinely above the page, a three-register type scale
      (`.display` / body / `.micro`), and semantic `--ok`/`--warn`/
      `--destructive` kept separate from the theme accent.
- [x] **8 new themes**, light + dark each, replacing the 11 soft-UI palettes:
      Ink (default), Blueprint, Primary, Concrete, Signal, Verdigris,
      Oxblood, Monolith. `normalizeThemeSettings()` maps every existing
      account's saved (now-deleted) palette id onto its nearest new theme, in
      all three read paths including the pre-hydration script.
- [x] **All 9 UI primitives restyled** plus 5 new ones carrying the language:
      `PageHeader`, `Panel`, `Stat`/`StatStrip`, `Tag`, `Wordmark`.
- [x] **Today rebuilt as a console** — one top-to-bottom reading order
      (masthead → NOW → vitals → the day → focus → jump to) replacing the old
      widget grid. The four "coming soon" placeholder tiles are gone.
- [x] **Process flow / connectivity** (the owner's stated top priority): every
      dashboard number links into its module, and a new app-wide `QuickAdd`
      routes into each module's real create form via `?new=1`, landing with
      the cursor already in the field.
- [x] **Every screen redesigned**: Tasks, Routines, Money (all six views),
      Shopping, Workout (feed, leaderboard, logging), Calendar, Settings and
      all seven sub-pages, the theme picker, Login, Signup, More.
- [x] Verified: build + typecheck + lint clean; dev-server smoke test
      confirmed `/login` renders and all protected routes still guard
      correctly; compiled CSS inspected for every new token and utility.
      **Not verified**: nobody has walked the screens logged in on a phone.

---

Next session: the app-wide redesign above is complete but **not yet committed
or deployed** — it lives as uncommitted working-tree changes (95 files). The
first thing to do is either deploy it or act on the owner's feedback after he
has walked the screens.

Owner actions outstanding: tap **Sync now** on Settings → Calendar to confirm
Google Calendar sync works (Part 8 above), and the optional Gemini API key
(Phase 5, upgrades receipt scanning/CSV categorization from manual to
automatic, not blocking).

After that, the natural next step is "Read SPEC.md. Phase 5 is complete and
deployed. Execute Phase 6 only" (Journal & Vinyl) — Phase 6 doesn't depend on
either outstanding owner action — unless the owner has a new, more pressing
request instead, which should take priority the same way every prior
session's detour did.
