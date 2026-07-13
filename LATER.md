# Later — Ideas Parking Lot

Ideas, scope creep, and ambitions that come up mid-build but are out of scope for the
current phase. Review this list after Phase 7 is complete.

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
