# Later — Ideas Parking Lot

Ideas, scope creep, and ambitions that come up mid-build but are out of scope for the
current phase. Review this list after Phase 7 is complete.

## Systems-thinking feature brainstorm (logged after Phase 1)

Not built yet — ideas for later phases, roughly grouped by which module they'd extend:

- **Subscription sniffer** (Finance): scan CSV/receipt imports for recurring
  merchant charges, auto-flag as subscriptions with renewal reminders.
- **Errand batching** (Tasks ↔ Shopping): cross-reference "errand" category
  tasks with an active shopping trip — "you're already out for groceries,
  also on your list: dry cleaning."
- **Price memory** (Finance ↔ receipts): remember the usual price paid per
  item from receipt history, flag when something's unusually expensive.
- **Weekly recap** (cross-module): a lighter, weekly version of Month in
  Review — money/workouts/tasks-done/photos from the past 7 days on one
  screen.
- **Adaptive streak urgency** (Workout ↔ Today): dashboard gets louder about
  a workout streak specifically when it's actually at risk (evening,
  nothing logged yet), not a static icon regardless of time of day.
- **"Own your data" export**: one-tap full JSON/CSV export in Settings.
- **Smart staple timing** (Shopping): learn each staple's real average
  days-between-purchases from history instead of a fixed 14-day window.
- **Recently-bought quick re-add** (Shopping): a "recently purchased" shelf
  for fast one-tap re-adds of common one-off items.

## Today dashboard — full vision (owner request, logged after Phase 0)

Also now reflected in `SPEC.md` Part G's Phase 7 description and the new Part B4
(interconnectivity principle). Building notes for whoever implements this:

- **Weather widget.** Free option: Open-Meteo (no API key required). Show
  today's conditions + maybe a 3-day glance. Needs the owner's location (ask
  once, store on profile — could reuse `profiles.timezone`'s general idea, or
  add a lat/lon or city field).
- **World news widget.** Headline feed, small curated list (3-5 items), not a
  full reader. Needs a free-tier news API — research options when we get here
  (many require a key + have rate limits; check cost against the $10-15/mo
  budget ceiling before picking one).
- **Local news widget with region selector.** Same API as above if it supports
  regional/local filtering, otherwise a second source. User picks their region
  in Settings; store the choice on the profile.
- **Full AI daily narrative.** One paragraph, generated like the existing
  morning-briefing plan (Part F), but pulling from *every* module that exists
  by Phase 7: tasks due, budget pulse, workout streak, reminders/calendar,
  journal nudge, plus weather/news color. Cached once/day like the rest of
  Part F's AI features — never regenerated on page load.
- **General principle:** every dashboard widget should light up with real data
  the moment its own module ships (Phase 1 Tasks/Shopping widgets are real
  from Phase 1; Money/Workout/Calendar/Journal widgets go live in their
  respective phases). Phase 7 adds the AI narrative + weather/news on top of
  widgets that already work — it isn't building the widgets from scratch.

## Cross-module interconnectivity — ongoing list

Also captured in `SPEC.md` Part B4. Add to this list whenever a new "these two
modules should talk to each other" idea comes up, so it survives until the
right phase to build it.

- Shopping list shows remaining grocery-category budget once Finance (Phase 4)
  exists.
- Receipt scan auto-checks matching shopping list items (Phase 5 — already in
  Part E2, just cross-referenced here).
- **Workout PR push notifications** (Phase 2 ↔ Phase 3): SPEC.md Part E5 calls
  for a push notification to the crew when someone hits a PR. Phase 2 built the
  in-app half (confetti + special feed card, live via Realtime for anyone
  already viewing the feed) but the actual push send needs Phase 3's Web Push
  infra (VAPID, subscriptions), which didn't exist yet. Wire the real push send
  from the PR-insert code path in `src/app/(app)/workout/actions.ts`
  (`logWorkout`) once Phase 3 ships.

## Phase 2 bonus features (owner request, folded in ahead of spec)

Three extras were added to Phase 2 beyond SPEC.md Part E5's literal scope, at
the owner's choice when Phase 2 was scoped:
- **Progressive overload nudge** — implemented (`src/lib/workout/progression.ts`).
- **Workout templates** (save/load a routine) — implemented (`workout_templates`
  table, `new/template-picker.tsx`).
- **Streak freeze** — implemented as an automatic rolling grace (one forgiven
  missed day per trailing 7-day window), not a manually-planned rest day, to
  keep streaks a pure computed-on-read function with no new schema. See
  `src/lib/workout/streaks.ts`. Worth a plain-English check-in with the owner
  once he's used it for a couple of weeks: does "one miss a week is forgiven
  automatically" feel right, or does he actually want to pick which day?
