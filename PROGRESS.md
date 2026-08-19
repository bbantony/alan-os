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
- [x] **Owner action, done 2026-08-18**: Google OAuth credentials created and
      pasted into Vercel — *and* the Google Calendar API itself enabled for the
      Cloud project, which is a separate switch and was the reason sync kept
      failing with a 403 long after the credentials existed. Google Calendar
      sync is now live and confirmed working.
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
- [x] **Done 2026-08-18**: Sync now surfaced the real error (Calendar API not
      enabled), Alan enabled it, and sync succeeded. The whole point of entry
      22's error-surfacing work — it turned a silent failure into a named one.

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

## Plan — Tasks, Calendar and Reminders unified (owner-requested, not a
numbered SPEC.md phase)

- [x] **Reminder-ownership bug fixed at the schema level.** `reminders`
      linked to tasks with `ON DELETE SET NULL`, so deleting a task orphaned
      its reminder and it kept firing forever with no way to find it. One live
      orphan ("Watches for anushas dad", recurring, next fire 19 Aug) plus five
      dead ones deleted; both FKs switched to `ON DELETE CASCADE`
      (migration 0022). Verified against production with a rolled-back probe.
- [x] **Two sibling bugs** found in the same pass: completing a task didn't
      silence its nudge, and completing a *recurring* task fired the next nudge
      immediately because `remind_at` was left on the finished occurrence.
- [x] **Due and nudge are now separate** (migration 0023). A task has a due
      time and a `notify_offset_minutes` — at the time / 30 min / 1 hour /
      1 day / 1 week before. The old bell could only fire at the exact moment
      something became late.
- [x] **Reminders are no longer a user-facing concept.** "Bin day Tuesday 8pm"
      is a task due Tuesday 8pm with a nudge. The `reminders` table survives
      only as the dispatcher's queue.
- [x] **Calendar date picker and clock-dial time picker**, replacing all 15
      native date/time inputs app-wide.
- [x] **`/plan` replaces `/tasks` and `/calendar`** — List / Calendar / Agenda
      views over one set of data. Reminders tab retired. Old routes redirect.
- [x] **Task nudges mirror to Google Calendar** as popup reminders.
- [x] Route guard hole caught and closed: `/plan` matched no module id, so
      `canAccessPath` waved it through for every account.

See CHANGELOG.md entries 27 and 28.

---

## Money audit + bug-fix round (owner-requested, 2026-08-18)

Alan asked for an honest assessment of Money and of the receipt scanner. The
audit is CHANGELOG.md entry 29; the fixes are entry 30.

**The finding that mattered:** Money had never held a single transaction — 0
accounts, 0 transactions, 0 receipts, 0 goals, 0 debts, 1 budget — because the
"add account" button only existed once you already had an account. Everything
downstream (quick-log, remittances, CSV import, receipts) needs an account, so
the whole module was a locked door.

- [x] Front door opened: **New account** on the empty state; accounts can now
      be edited and deleted (both server actions existed and were called from
      nowhere); quick-log, remittances and CSV import all say why they're
      unavailable instead of silently doing nothing.
- [x] **Fabricated ids fixed.** `createAccount`/`createSavingsGoal`/`createDebt`
      returned nothing, so callers invented a `crypto.randomUUID()` that matched
      no row — the first action against anything just created either failed or
      silently wrote nothing while reporting success. All three return the real
      row now.
- [x] **Reports' month arithmetic fixed.** A negative-modulo bug produced
      `2025-00-01` for any month before January; Postgres rejected it, the error
      was swallowed, and the screen showed $0 rather than a failure.
- [x] **One safe-to-spend number.** Today and Money disagreed whenever a budget
      was over.
- [x] **Currencies no longer summed together** (CAD and INR were added as if
      equal); every aggregate is CAD, non-CAD accounts shown separately.
- [x] **Confirmation before every destructive delete**, via a new shared
      `ConfirmDialog` — including the true count of transactions an account
      delete would cascade.
- [x] **Receipt scanner: three of its four blockers cleared.** Photos are now
      compressed in the browser (they exceeded Next's 1MB Server Action limit
      and failed every time), the failure can no longer hang the button
      forever, and the review screen finally shows the photo. The fourth is
      still the `GEMINI_API_KEY` owner action.
- [x] Verified: build/typecheck/lint clean, dev-server smoke test, and a
      rolled-back live-database round trip covering the real account id, the
      cascade, the CAD filter, the month ranges and RLS.

**Not verified:** nobody has used any of it logged in on a phone. The receipt
compression path in particular runs in the browser and needs a real camera
photo to prove out.

---

## Gallery receipts, recurring money, and the AI layer (owner-requested, 2026-08-18)

Asked for in one message, built in one round. CHANGELOG.md entry 31.

- [x] **Receipts can come from the gallery**, not only the camera — `capture` is
      a directive, not a hint, so Android had no route to an old photo at all.
      Several at once, each with its own review screen, each upload isolated so
      one bad photo doesn't abandon the batch.
- [x] **Recurring income and expenses** (migration `0025`): rent, salary,
      subscriptions post themselves, dated to the day they were due, catching
      up on anything missed while the app was closed. Deliberately *not* built
      on RRULE — `BYMONTHDAY=31` skips February, which is right for calendars
      and wrong for rent; `src/lib/finance/recurring.ts` clamps instead.
      Posting is claim-then-insert, so two page loads can't double-post.
- [x] **The AI framework** — the layer every future AI feature plugs into:
      a model registry with cheap/standard/deep tiers and prices in one file
      (`lib/ai/models.ts`), a usage ledger and hard $5 monthly ceiling
      (`lib/ai/usage.ts` + `ai_usage` table), one door to the model with
      metering built in (`lib/ai/gemini.ts`), and twelve tools across Plan,
      Money, Shopping and Workout (`lib/ai/tools.ts`).
- [x] **The assistant** at `/assistant` — asks and answers from real data,
      writes reports, and can add a task, tick one off, log an expense or add
      to the shopping list. It cannot delete anything or change budgets, goals,
      debts or recurring rules.
- [x] **`/settings/ai`** — what the AI has cost this month, by feature, against
      the ceiling. Built because "my fear is the expense" deserves a number,
      not a reassurance.
- [x] Verified: build/typecheck/lint clean; 20 date-maths checks against the
      real shipped `recurring.ts`; a rolled-back live-database round trip
      covering both new tables, RLS, the claim, the `recurring` source, the
      keep-the-money-on-delete rule and the usage ledger.

**Security note worth not undoing:** every AI tool runs against the *user's own*
Supabase client, so RLS is what stops the assistant reaching another account's
data — not a prompt instruction. Tools are also filtered by `module_access`
before the model is shown them. No service-role client appears anywhere in the
AI path, and none should.

**Cost, answered:** ~$1-3 USD/month realistic, $5 hard cap, $0 on Google's free
tier (with the caveat that free-tier prompts may be used by Google for training,
which paid pay-as-you-go isn't). Full arithmetic in MANUAL.md's "What the AI
costs" section.

---

Next session (written 2026-08-18).

**In flight: two finished rounds of work, neither committed.** `git status` shows
the Money bug-fix round (entry 30) and this AI/recurring round (entry 31)
together. Both are build/lint/typecheck clean and verified against the live
database. Nothing is half-done.

**Migrations already applied to production but uncommitted:** `0024_journal_vinyl.sql`
(written before Alan redirected off Phase 6 — inert, nothing references those
tables, and it's the schema Phase 6 will want, so don't write it again) and
`0025_recurring_and_ai_usage.sql` (in active use).

**The one thing blocking everything AI:** `GEMINI_API_KEY` is still empty. No AI
call has ever been made from this codebase — the assistant, the tool loop and
the meter have never run against the real API. That is the only untested part of
this round and it can't be tested without the key.

Earlier work is CHANGELOG.md entries 24-28: the app-wide redesign, the Workout
logging rebuild, the reminder-ownership bug, the due/nudge model, the calendar +
clock pickers, and the Tasks/Calendar merge into `/plan`.

**Owner actions outstanding:**
- **Gemini API key** (Phase 5). Free from Google AI Studio, pasted into Vercel
  and `.env.local` as `GEMINI_API_KEY`. Currently blocks two things: receipt
  scanning / CSV categorisation falling back to manual (Phase 5, by design),
  and *everything* in Phase 7. Alan has said his real goal is typing a
  sentence and having it become a task with a date and a reminder — that is
  Phase 7 quick-capture and it cannot be built without this key.
- **Onboard the 3 friends** to Workout (Phase 2) — send them the invite link
  from Settings → Admin.

**Not verified by any session so far:** nobody has walked the redesigned
screens logged in on a phone. The redesign, the new Workout flow (full-screen
exercise picker, one-at-a-time session), the calendar/clock pickers and the
`/plan` views were all built, compiled, and checked against the live database
where relevant — but never actually used. Ask Alan for feedback rather than
assuming they're right.

**Two cosmetic loose ends Alan has seen and chosen to leave** (do not "fix"
unprompted): the app icon is still British Racing Green, from the palette
retired in the redesign; and `components/nav/wordmark.tsx` shows a
circle/square/triangle while the home-screen icon is the chevron, so the app
carries two marks. He was shown four options and said keep the current logo.

**The natural next build** is Phase 6 (Journal & Vinyl: photo-a-day + gallery,
vinyl log with iTunes art, `/frame` wall display) — it depends on neither
owner action. Phase 7 is the one Alan actually wants, and needs the Gemini key
first. As always, a new request from Alan takes priority over both.
