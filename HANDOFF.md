# Alan OS — cold-start handoff

**Written 2 Sep 2026, for a fresh session picking this repo up with no prior context.**
Everything below was verified against the tree on 30 Aug – 2 Sep 2026, not recalled from a
conversation. Where something is unverified, it says so.

---

## 0. Read these first, in this order

| File | What it is |
|---|---|
| `CLAUDE.md` | The rules. Non-negotiable. Read it fully before touching anything. |
| `SPEC.md` | The build bible. Read the relevant Part before any module work. |
| `PROGRESS.md` | What has shipped, phase by phase. |
| `CHANGELOG.md` | Prompt-by-prompt history — *why* the code looks like this. Entries 40–52 are the audit and its fixes. |
| `MANUAL.md` | The plain-English user guide Alan actually reads. |

**The single most important rule, repeated here because it governs everything:
Alan is not a programmer.** He cannot read code, a stack trace, or an error message. Every
status update, question and summary goes to him in plain English. When a decision is his,
offer it as a short plain-language choice with the trade-off in real terms, never as a
technical option list.

**Also non-negotiable:** every request from Alan — however small — gets an entry appended to
`CHANGELOG.md` before the work is considered done.

---

## 1. Where the project actually stands

Alan OS is a personal life-management PWA (money, tasks, shopping, workouts, reminders,
calendar/plan, an AI assistant). Next.js App Router + TypeScript, Supabase, Tailwind v4,
Framer Motion. Deployed on Vercel at `alan-os-nine.vercel.app`. Installed to the home screen
on a **Samsung Galaxy Z Fold 7** running the **Kvaesitso** launcher — that device is the only
target that matters.

**A 108-finding full-codebase audit was completed 26 Aug 2026** (CHANGELOG entry 40): 228 TS/TSX
files, 34 migrations, the service worker, the build config. **40 findings are closed** (entries
41–51), including:

- All five security criticals (migration 0035) — a cross-account push-notification leak, an
  unowned delete, a fail-open cron gate, three EXECUTE-to-PUBLIC seed functions, and the one
  table in the app with no RLS.
- Every bug that produced a wrong monetary number — parenthesised CSV negatives importing as
  income, 28 Feb belonging to no budget period, avalanche and snowball returning identical
  plans, a $1.37bn interest figure, receipts hardcoding CAD on INR accounts, mixed-currency
  addition on the dashboard.
- Migrations 0035, 0036, 0037 are **applied to production** and verified with 13 live checks.

**76 findings remain open.** (`PROGRESS.md` said 68 until 30 Aug; that was arithmetic —
108 − 40 — not a count. The published audit board is the live record. See CHANGELOG entry 52.)

The board, filterable by severity, with a plain-English title and a `file:line` on every row:
**https://claude.ai/code/artifact/7d063e36-7f28-4c05-87bd-0bc9ec47dcd2**
(Alan owns it; read it with the Artifact tool's `read` action. It has not been republished
since 27 Aug, so treat its "fixed" flags as a floor, not a certainty.)

### Verify before you fix

A finding list days old is a claim, not a fact. Five were re-checked against the tree on
30 Aug and **all five were still real**:

- `money/actions.ts` — `logTransaction` derives its balance delta from `input.isIncome`
  (browser-supplied, line 272); `deleteTransaction` derives it from `categories(kind)`
  (database, line 317).
- `components/ui/calendar-grid.tsx` — owns its month in internal state (`setView`, lines 74
  and 97), exposes no change callback, so the Plan page cannot know to fetch.
- `lib/offline/shopping-db.ts` — still `db.put("outbox", …)` keyed on a random UUID, read back
  with `db.getAll`.
- `lib/offline/shopping-sync.ts` — still `catch { return { flushed, failed: true } }`, no
  attempt counter.

Do the same spot-check on anything you pick up.

---

## 2. The four findings that lose work Alan has already typed

`PROGRESS.md` claimed for several days that nothing remaining was data-losing. **That was
wrong** and is now corrected. These four destroy input:

1. **`today/focus-panel.tsx:140` + `calendar/actions.ts:136`** — the evening ritual renders
   "Plan set — Tomorrow is decided" without checking the save. The action returns nothing and
   swallows both of its own database errors. Tomorrow's three goals and the day's reflection
   can be gone behind a screen saying they're safe.
2. **`lib/offline/shopping-db.ts:76`** — the offline outbox is keyed on `crypto.randomUUID()`
   and read back with `getAll`, which returns key order. Add "Milk" offline, tick it off, and
   on reconnect the tick can replay before the add: it matches nothing, raises nothing, and is
   lost. Delete-before-add strands an orphan the same way.
3. **`shopping/shopping-list.tsx:148`** — after a *failed* flush the app refreshes from the
   server anyway, and the refresh clears the local store before writing. Anything added offline
   and not yet landed disappears from both the screen and the cache.
4. **`lib/offline/shopping-sync.ts:46`** — the queue stops at the first failure without
   removing the item or counting attempts. One permanently-failing mutation (an item filed to a
   since-deleted category) blocks everything behind it on every future sync, forever.

These four, plus the finding "Four screens tell you an action worked without checking", form
one coherent work unit — every one of them is the app claiming a success it never verified.
**This is the recommended first unit.** It is the only group on the list where Alan can lose
something he typed; everything else is a visible wrong number or tidying.

---

## 3. What Alan is asking for now

Three streams. He wants the app **tightened, more seamless, and more polished**, and he wants
it to **use his phone properly**. In his own words: *"analyze everything and tighten things up
… make it more seamless and better … make it look a bit more refined and polished … and
utilize functions of Kvaesitso launcher on my Fold 7."*

### Stream A — close the remaining 76 (recommended order)

1. **Work that vanishes** — section 2 above. First, always.
2. **Money that comes out wrong** — the balance drift and the one-day-early transaction dates
   are the two he will actually notice.
3. **Things visibly broken in use** — Plan calendar paging past a month shows an empty grid; a
   never-before-done barbell exercise records 0 kg; weekly routine streaks can never reach 2;
   one workout fires the crew's confetti up to nine times.
4. **Doors that aren't locked** — no data is exposed (the five that did are closed), but
   transactions can be linked to another account's category and cascade-deleted.
5. **Consistency and craft** — this is Stream B, below.
6. **Consolidation last** — the 18 copies of `requireUser()`, the six duplicate date
   formatters. It makes the code nicer and changes nothing Alan can see. Do not lead with it.

### Stream B — "refined and polished"

Polish here is not a vague brief. It is a specific, already-catalogued set of findings, and it
must be executed **inside the existing design language, not over it.**

**Read the design language first:** the "Swiss Instrument" artifact and the design-language
memory — radius zero, a 2px structural rule and a 1px hairline, hard offset shadows with no
blur, semantic colour kept separate from the accent, IBM Plex Sans / Plex Mono / Archivo. Do
not introduce rounded corners, soft shadows or a new accent. The audit board itself is built in
this language and is a good reference rendering.

The catalogued polish findings:

- Deleting behaves **three different ways** across the app — some screens use `ConfirmDialog`,
  some use the browser's grey `confirm()` box, and Tasks / shopping / routines / two settings
  screens ask nothing at all and just delete. `ConfirmDialog`'s own comment claims it replaced
  the browser boxes. It didn't.
- **Not one form field in the app is properly labelled.** This is the accessibility floor and
  it is also why some inputs read as unfinished.
- **Two toast systems**, three hand-rolled text boxes, no shared component for either.
- **Three ways to format a time**, six duplicate short-date formatters.
- **Low-contrast icons made lower.**
- Five components have grown past 400 lines and do several jobs each.

Entries 47–49 already did a pass of this kind — the Motion and Spacing settings were made real,
33 lines of dead CSS removed, 49 undersized tap targets fixed with `.tap-target` / `.tap-reach`,
and two identical 75-line Plan rows merged into `plan/plan-row.tsx`. **Read those entries before
starting** so you extend that work rather than redo or undo it. In particular: the tap-target
classes deliberately do **not** scale with `--density-scale` (an accessibility floor that
shrinks is not a floor), and Compact is 0.875 not 0.8 for the same reason.

### Stream C — the Fold 7 and the Kvaesitso launcher

**This is the stream with the most unclaimed value, and almost none of it has been started.**

**The measured state of the app on a large screen:** the entire codebase contains **one**
`lg:` class, and it is a button height variant, not a layout. There are 58 `md:` and 17 `sm:`.
The dominant page container is `max-w-2xl` (672px). `public/manifest.json` locks
`"orientation": "portrait-primary"` and declares **no `shortcuts` and no `share_target`.**

Consequences on a Z Fold 7:

- On the **inner ~8" display** (roughly square) the app renders as a narrow phone column
  floating in the middle of a large canvas. Nothing above 768px was ever designed.
- The **orientation lock** is wrong on a foldable — it fights the inner display and any
  landscape or Flex-mode use.
- **Fold/unfold is a configuration change.** Any unsaved form state is at risk, which is the
  same failure family as section 2 — worth testing deliberately, especially on the money
  quick-log and the evening ritual.

Ordered by value against effort:

1. **`shortcuts` in `manifest.json` — do this first.** Four entries: Log expense, Add task,
   Start workout, Shopping list. Chrome turns manifest shortcuts into real Android app
   shortcuts, and Kvaesitso's global search surfaces app shortcuts alongside apps, contacts and
   calendar events. Typing "expense" into the launcher would land him directly on the logging
   screen. Roughly half an hour of work for the biggest single seamlessness win available.
2. **`share_target`.** Share a photo from the camera or gallery straight into the receipt
   scanner; share selected text straight into the assistant. Standard PWA, well supported for
   installed Android PWAs, and it removes the most tedious multi-step flow in the app.
3. **Unlock orientation and build genuine large-screen layouts.** Two-pane (list + detail) on
   the inner display for Plan, Money, Tasks and Shopping — they all have the right shape for
   it. This is what "polished on my Fold" actually means, and it is the largest piece of
   Stream C.
4. **Launcher icon treatment** — a monochrome/themed icon variant so it sits correctly in
   Kvaesitso's icon styling rather than as a pasted-on square.
5. **A native Kvaesitso plugin** — the plugin SDK (`plugins/sdk`, Apache-2.0) exists and is how
   external data sources get into launcher search, so tasks, shopping items and reminders could
   be searchable from the home screen. **But be honest with Alan about what this is:** a
   separate Kotlin Android project, distributed as a sideloaded APK, not a change to this repo
   and not something Vercel deploys. It is a different kind of project with its own toolchain.
   **Put it to him as a decision — do not start it on your own initiative.**

**Caveat, stated plainly because the alternative is proceeding on a guess.** Items 1–4 are
standard, well-documented web platform features and are safe to build. The specific claim that
*Kvaesitso surfaces PWA-derived app shortcuts in its global search* comes from its feature
description (search covers "apps, contacts, shortcuts, and useful actions"), not from its own
documentation read end to end — the docs URLs tried on 2 Sep 2026 all returned 404. It is very
likely true and it is trivially testable: ship the shortcuts, then have Alan long-press the
Alan OS icon and type "expense" into the launcher search. **Confirm it on his device before
promising it in `MANUAL.md`.**

---

## 4. Hard constraints — breaking any of these is a failed unit

- **RLS on every table, before any feature code touches it.** Default `user_id = auth.uid()`
  for read and write. The workout tables are the one deliberate exception (crew-readable,
  author-writable). **Never disable RLS "temporarily."**
- **Money is integer cents + a currency code. Never floats.** Never add two currencies
  together — that was a real shipped bug.
- **Timestamps stored UTC, converted to `America/Winnipeg` only at display time** — and read
  the timezone from `profiles.timezone`, never as a literal string, and never as a hardcoded
  UTC offset (a hardcoded `-05:00` made every assistant-created task an hour early for five
  months of the year).
- **No ORM.** Raw numbered SQL migrations in `supabase/migrations/`, applied with
  `scripts/run-migration.mjs`. Each file runs in its own transaction — that is what turned a
  bad migration into a non-event on 27 Aug. Migrations must be **replay-safe**.
- **Every new database constraint needs a line in `lib/db-errors.ts`.** A constraint turns "the
  database refuses" into an ordinary outcome of a second tap, and 33 sites were returning raw
  `error.message` to the screen before that mapper existed.
- **Free tiers only** (Vercel + Supabase). The only paid line item is AI API usage.
- **Do not rebuild Journal or Vinyl.** Both were removed at Alan's explicit request
  (migration 0033). Do not resurrect them without asking him.
- **Credentials are already in `.env.local`**, including `SUPABASE_DB_URL`. Run migrations for
  him — do not send him into the Supabase dashboard hunting for a connection string. Never
  echo the URL; filter output so a stack trace cannot print the password.

## 5. Session protocol

- **Scout before building** — map the work unit and the patterns already in those files, then
  give Alan a short plain-English plan before writing code.
- **All `npm run lint` / `npm run build` / `npm test` go through the test-runner agent**, never
  the main conversation. `npm test` is real now — 33 tests over the pure money, date and unit
  helpers, run with node's own runner over `tests/*.test.mts`. Every case in it is a bug that
  was genuinely in this codebase. **Add to it whenever you fix a maths or parsing bug.** Do not
  chase UI coverage.
- **Nothing is complete until test-runner AND unit-reviewer both pass**, and Alan sees both.
- **Two strikes then stop.** If unit-reviewer fails the same item twice, stop and explain it to
  Alan in plain English rather than attempting a third fix.
- **One phase per session.** Don't build ahead; don't "improve" shipped modules unasked.

## 6. Traps this codebase has already sprung — do not re-learn these

- **A grep for `name(` silently misses every generic call in TypeScript.** A dead-code pass
  grepped `useState(`, missed `useState<Metric>("e1rm")`, and broke the build.
- **`pg_attribute.attname` is `name`, not `text`.** `array_agg(a.attname) = array['a','b']`
  has no operator and aborts the migration. Cast with `::text` on both sides.
- **Next's `no-unused-vars` is a warning, not an error.** `ALL CHECKS PASS` can be true and
  wrong at the same time — green checks do not prove there is no dead code.
- **A "verified empty" comment in a migration is a promise, not a mechanism.** Guard with
  `to_regclass` / `information_schema` so the guard is as idempotent as the drops beneath it.
- **An audit reads code, so it cannot find "nobody can find the feature."** The assistant
  shipped three taps deep behind a hamburger menu and passed lint, build, tests and a code
  review. Alan's response was *"how the fuck do i access the ai"*. **Walk the actual flow on
  the actual device.** This applies double to Stream C, which is entirely about how the app
  behaves on hardware you cannot see.
- **Encoding a fact in the shape of a string** (sniffing whether a time was known by inspecting
  its formatting) is how a fix in one file breaks another. Carry it as a real field.

---

## 7. The remaining 76, grouped

Severity and location are from the audit board. `Fix:` is the audit's suggested approach, not
a mandate — verify the finding first, then decide.

### Money that comes out wrong — 16 open

- **[HIGH] Logging a transaction and deleting it can leave your balance permanently wrong**
  - Where: `money/actions.ts:251 vs :280`
  - Fix: Read the direction from the category on both paths.
- **[HIGH] Every recent transaction shows one day early**
  - Where: `money/overview-view.tsx:390`
  - Fix: Use the same midday-timestamp trick the file already uses at line 77.
- **[HIGH] The gap you're asked to correct is calculated from a number the browser sent**
  - Where: `money/reconcile-actions.ts:237`
  - Fix: Recalculate the balance on the server when finishing.
- **[HIGH] Deposits disappear from a statement with separate debit and credit columns**
  - Where: `money/reconcile/reconcile-flow.tsx:361`
  - Fix: Add the fourth column picker.
- **[HIGH] The Import button counts rows it isn't going to import**
  - Where: `settings/money/csv-import.tsx:120, 331`
  - Fix: Count the same set that gets imported, and warn about the uncategorised ones.
- **[HIGH] Three money settings save but are never read**
  - Where: `settings/money/money-preferences.tsx:30`
  - Fix: Wire them up or remove the controls.
- **[MED] Remittance amounts are stored as a ratio and rebuilt with decimals**
  - Where: `money/actions.ts:550, 599 · money/remittance-form.tsx:40`
  - Fix: Store the rupee amount on the transaction instead of recalculating it.
- **[MED] Imported rows go into the database with no checks at all**
  - Where: `money/csv-actions.ts:157`
  - Fix: Clamp the amount, verify the categories, cap the rows.
- **[MED] The budget screen runs one database query per budget, twice over**
  - Where: `money/actions.ts:317`
  - Fix: Group the budgets by period and fetch them together.
- **[MED] A goal due in two weeks offers a monthly transfer bigger than the goal**
  - Where: `lib/finance/goal-pace.ts:52`
  - Fix: Cap the monthly figure at the amount remaining.
- **[MED] Setting up a goal habit twice creates two transfers**
  - Where: `money/goal-actions.ts:134`
  - Fix: Check for the existing transfer inside the action.
- **[MED] One shopping item can be ticked off by several receipt lines**
  - Where: `money/receipt-actions.ts:173`
  - Fix: Remove each item from the pool once it's matched.
- **[MED] The big total on the receipt review isn't what gets saved**
  - Where: `money/receipt-review-dialog.tsx:92`
  - Fix: Total the same list that gets submitted.
- **[MED] Remittances break permanently if you rename the Remittance category**
  - Where: `money/actions.ts:534`
  - Fix: Store the category's ID, or create it if it's missing.
- **[MED] Only the most recent 500 transactions are considered, silently**
  - Where: `money/reconcile-actions.ts:60`
  - Fix: Filter by date range instead of a row cap, or say when the cap is hit.
- **[MED] The month heading can name a different month than the figures below it**
  - Where: `money/reports-view.tsx:49, 68`
  - Fix: Use the label the server already returns, and add an error state.

### Work that quietly disappears — 9 open

- **[CRIT] Offline shopping changes replay in random order, and some are lost**
  - Where: `lib/offline/shopping-db.ts:76`
  - Fix: Give each change a timestamp-based key so they come back in the order you made them.
- **[CRIT] Your saved theme is overwritten by the device's local default**
  - Where: `app/layout.tsx:102 + app/(app)/layout.tsx:11`
  - Fix: Remove the outer provider. The login and signup pages don't use it.
- **[CRIT] “Plan set — Tomorrow is decided” appears even when nothing saved**
  - Where: `today/focus-panel.tsx:140 · calendar/actions.ts:136`
  - Fix: Return the error from the save, and only show the panel on success.
- **[HIGH] A repeating task completed late never catches up**
  - Where: `tasks/actions.ts:366`
  - Fix: Roll forward past today rather than advancing one period.
- **[MED] A failed sync deletes the items waiting to be synced**
  - Where: `shopping/shopping-list.tsx:148`
  - Fix: Skip the refresh when the flush failed, and merge rather than clear.
- **[MED] One stuck change blocks every change behind it, forever**
  - Where: `lib/offline/shopping-sync.ts:46`
  - Fix: Count attempts and set aside anything that keeps failing.
- **[MED] Finishing a trip offline clears whatever is ticked when it syncs, not when you tapped**
  - Where: `lib/offline/shopping-sync.ts:26`
  - Fix: Carry the item IDs in the queued action.
- **[MED] Four screens tell you an action worked without checking**
  - Where: `tasks/task-list.tsx:128, 195, 227, 250`
  - Fix: Check the result and roll the screen back on failure.
- **[MED] Shopping changes never refresh the Today screen**
  - Where: `shopping/actions.ts:130–197`
  - Fix: Refresh /today and /shopping after each change.

### The day boundary problem — 1 open

- **[MED] Due times are typed in device time but displayed in Winnipeg time**
  - Where: `tasks/task-detail-dialog.tsx:27 · components/ui/date-field.tsx:31`
  - Fix: Convert through the profile timezone, which the time helpers already support.

### The AI, and what it costs you — 5 open

- **[HIGH] The first Today load each day waits for the AI before showing anything**
  - Where: `today/page.tsx:153 · lib/ai/gemini.ts:121`
  - Fix: Stream the panel in separately, or generate it in the nightly job.
- **[MED] Opening Today on two devices at once pays for the briefing twice**
  - Where: `lib/ai/outlook.ts:189`
  - Fix: Claim the day's slot in the database before calling the model.
- **[MED] Imported bank text is fed to an AI that can write to your data**
  - Where: `lib/ai/assistant.ts:189`
  - Fix: Mark tool results as data, not instructions, and require confirmation before writes.
- **[MED] Every AI call costs three extra database round trips to meter it**
  - Where: `lib/ai/usage.ts:114, 124`
  - Fix: Look the user up once and pass it down.
- **[MED] A failed AI call leaves no trace at all**
  - Where: `lib/ai/gemini.ts:198`
  - Fix: Log the caught error the same way the HTTP branch does.

### Doors that aren't locked — 12 open

- **[HIGH] Your transactions can be attached to someone else's category or account**
  - Where: `0016:52 · 0025:32 · 0004:29 · 0011:25`
  - Fix: Enforce it in the database with composite keys or a check trigger.
- **[MED] Anyone can put text of their choosing in a red banner on your settings page**
  - Where: `settings/calendar/page.tsx:30`
  - Fix: Look up a fixed message from a code, rather than displaying the text.
- **[MED] The Done and Snooze buttons carry a two-week pass in the web address**
  - Where: `public/sw.js:99`
  - Fix: Send it in the request body or a header, and shorten the lifetime.
- **[MED] The avatar bucket can be listed by anyone, which exposes every account ID**
  - Where: `supabase/migrations/0029_avatars_bucket.sql:18`
  - Fix: Keep the read, restrict the listing to signed-in users.
- **[MED] The Google redirect address is built from a header the caller controls**
  - Where: `lib/gcal/client.ts:20`
  - Fix: Use a configured base URL.
- **[MED] Deleting a calendar event reports success even when it fails**
  - Where: `lib/gcal/client.ts:176`
  - Fix: Only swallow 404 and 410.
- **[MED] Repeating calendar events are sent to Google with no timezone**
  - Where: `lib/gcal/client.ts:120, 152`
  - Fix: Send the timeZone field alongside the dateTime.
- **[MED] The offline cache stores every page you visit, signed out or not**
  - Where: `public/sw.js:31`
  - Fix: Cache only the shell and static assets, and only successful responses.
- **[MED] A missed day of reminders fires as a burst of catch-up notifications**
  - Where: `api/cron/reminders/route.ts:127`
  - Fix: Roll forward past now before scheduling the next one.
- **[MED] The reminder job claims reminders before it can guarantee it will send them**
  - Where: `api/cron/reminders/route.ts:61`
  - Fix: Process in bounded batches and re-release anything unhandled.
- **[MED] The scheduled-job config contradicts the code's own comment**
  - Where: `vercel.json:4 vs api/cron/reminders/route.ts:17`
  - Fix: Decide which one runs it and delete the other.
- **[MED] No security headers are set anywhere**
  - Where: `next.config.ts:3`
  - Fix: Add a headers block to next.config.ts.

### Things that don't work like they look — 21 open

- **[HIGH] Paging the calendar past one month shows an empty grid**
  - Where: `plan/calendar-view.tsx:67 · components/ui/calendar-grid.tsx:74`
  - Fix: Add a month-changed callback and load on it.
- **[HIGH] A barbell set left at the suggested weight records zero, not the bar**
  - Where: `workout/new/set-row.tsx:86`
  - Fix: Start the set at the bar's weight for barbell exercises.
- **[HIGH] One logged session sets off the crew's confetti up to nine times**
  - Where: `workout/crew-view.tsx:52`
  - Fix: Debounce the refresh, and fire the confetti once per session.
- **[HIGH] A weekly routine's streak can never go above one**
  - Where: `routines/actions.ts:62`
  - Fix: Count consecutive days the routine was actually due.
- **[MED] The Vitals strip can be hidden but not moved, despite the arrows**
  - Where: `today/page.tsx:182, 209`
  - Fix: Render it from inside the ordered list.
- **[MED] “A repeating task needs a due date” is shown but not enforced**
  - Where: `tasks/task-detail-dialog.tsx:168`
  - Fix: Disable Save while the warning is showing.
- **[MED] “Monthly on the 31st” skips five months a year**
  - Where: `lib/reminders/rrule.ts:31`
  - Fix: Limit the picker to the 28th, or express it as “last day of the month”.
- **[MED] A Google event vanishes if any task anywhere shares its name**
  - Where: `plan/actions.ts:191`
  - Fix: Match on the stored Google event ID, which tasks already keep.
- **[MED] The Agenda shows last month's unfinished tasks under “the next two weeks”**
  - Where: `plan/agenda-view.tsx:31, 45`
  - Fix: Filter to today onwards, and fix the wording.
- **[MED] “Toilet paper” is filed under Pantry**
  - Where: `lib/shopping/category-guess.ts:106`
  - Fix: Match longest keyword first, and require whole words.
- **[MED] Today and Shopping suggest different staples on the same day**
  - Where: `shopping/actions.ts:113 vs price-actions.ts:97`
  - Fix: Delete the simple one and point Today at the smart one.
- **[MED] An item called “oil” matches the receipt line “boiled ham”**
  - Where: `lib/finance/fuzzy-match.ts:26`
  - Fix: Require a whole-word match, or a minimum length for the containment shortcut.
- **[MED] “Tim Hortons” and “tim hortons” are counted as two merchants**
  - Where: `money/actions.ts:706`
  - Fix: Normalise the key, keep the nicest spelling for display.
- **[MED] The record toast can announce the wrong record, formatted as the wrong unit**
  - Where: `workout/new/new-workout-form.tsx:315`
  - Fix: Run the list through headlinePr and use formatPrValue.
- **[MED] The leaderboard reads the crew's entire history on every load**
  - Where: `workout/actions.ts:579`
  - Fix: Limit it to the last few months — older data can't affect a current streak.
- **[MED] The Plan page rebuilds every routine's schedule from scratch, per day**
  - Where: `lib/reminders/rrule.ts:122 · plan/actions.ts:141`
  - Fix: Build each rule once and ask it for the whole range in one go.
- **[MED] A slow workout submit can log the session twice**
  - Where: `workout/actions.ts:240`
  - Fix: Accept a client-supplied ID and let the database reject the duplicate.
- **[MED] The week-start setting is ignored by the two screens that show weeks**
  - Where: `workout/actions.ts:585 · workout/personal-actions.ts:112`
  - Fix: Pass the preference through, or remove the setting.
- **[MED] Tapping the arrows quickly leaves the header and rows out of step**
  - Where: `timeline/timeline-view.tsx:101`
  - Fix: Track a request ID, or use startTransition as the calendar already does.
- **[MED] Number settings accept values outside their own limits**
  - Where: `components/settings/setting-controls.tsx:190`
  - Fix: Clamp the value when saving.
- **[MED] Deleting a shopping category can silently do nothing**
  - Where: `shopping/actions.ts:284`
  - Fix: Handle the no-row case explicitly and move the sequence into one database function.

### Consistency and craft — 12 open

- **[HIGH] Deleting things behaves three different ways across the app**
  - Where: `components/ui/confirm-dialog.tsx:20`
  - Fix: Route every destructive action through ConfirmDialog.
- **[MED] Not one form field in the app is properly labelled**
  - Where: `60 occurrences across src/`
  - Fix: Connect each label to its input, and use the Label component.
- **[MED] Nineteen places assert what the database returned without checking**
  - Where: `money/actions.ts:280, 656, 683, 708 · workout/personal-actions.ts:63, 171, 217, 302 · +11`
  - Fix: Generate the types from the schema, or narrow with a runtime check.
- **[MED] Server actions disagree about how to report failure**
  - Where: `Across all 25 action files`
  - Fix: Settle on one shape and apply it across every action file.
- **[MED] Two identical 75-line components, and three ways to format a time**
  - Where: `plan/agenda-view.tsx:79 · plan/calendar-view.tsx:130 · +7 sites`
  - Fix: One row component, one date formatter, one time formatter.
- **[MED] Two toast systems, three hand-rolled text boxes, no shared component for either**
  - Where: `shopping/shopping-list.tsx:459 · tasks/task-detail-dialog.tsx:120`
  - Fix: Use the shared toast, and add a Textarea primitive.
- **[MED] Low-contrast icons made lower**
  - Where: `19 sites across src/`
  - Fix: Use the muted colour at full opacity.
- **[MED] The credit-card sign rule is written out again inside a screen**
  - Where: `money/reconcile/reconcile-flow.tsx:199`
  - Fix: Import balanceDeltaCents.
- **[LOW] Five components have grown past 400 lines and do several jobs each**
  - Where: `shopping-list.tsx · task-list.tsx · new-workout-form.tsx · reconcile-flow.tsx · overview-view.tsx`
  - Fix: Split the data and formatting work out of the rendering.
- **[LOW] Two file readers with no error handler**
  - Where: `settings/money/csv-import.tsx:44 · reconcile-flow.tsx:114`
  - Fix: Add an onerror that shows a message.
- **[LOW] A failed receipt record leaves the photo orphaned in storage**
  - Where: `money/receipt-actions.ts:87`
  - Fix: Delete the upload when the insert fails.
- **[LOW] Only American date order is understood**
  - Where: `lib/finance/csv-parser.ts:112`
  - Fix: Ask which convention the file uses during column mapping.
