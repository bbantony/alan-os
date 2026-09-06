# NEXT SESSION — Wave 2B, half landed

**Written 6 Sep 2026.** The session that wrote this ran out of room to think. Everything below is
what the next session needs to pick the work up cold. Delete this file when Wave 2B is finished and
recorded in `PROGRESS.md` — it is a note between sessions, not documentation.

**For deeper background** — the project as a whole, the device, the design language, the 108-finding
audit — see `HANDOFF.md`. It is the durable cold-start guide, but it was written 2 Sep and four waves
have shipped since; its own header now says which parts have gone stale. This file is the current
state; that file is the standing context.

---

## For Alan, in one paragraph

The assistant learned two new things this round: it can now **make a routine** from plain speech
("water the plants every 3 days at 7pm"), and it can now **do a spending report over any stretch of
time you name** ("how have I done since June"), instead of only whole months. On top of that two
holes got closed: an AI suggestion chip could have offered to change your budget with one tap
(it can't now — chips may only ever add a task or add to the shopping list), and someone with a
workout-only account could have made the app ask AI questions on your card (they can't now, through
the ask box — but the review found two other doors onto your card that are still open, and they are
the first job below).

**None of it is on your phone yet.** It is saved and safe, but it has not had the second pair of
eyes the project rules require, so nothing has been marked finished. The next session picks up at
exactly that point.

---

## State of the tree

Wave 2A was `c609460`; this work landed as `fa73b93` plus the review-fix commit this file is part
of. Nothing is at risk of being lost — but it is **landed, not blessed.**

| Check | Result | When |
|---|---|---|
| `npm run lint` | passes | 6 Sep, this tree |
| `npm test` | **174 tests, 174 pass, 0 fail** (149 earlier in the session, 108 in PROGRESS.md) | 6 Sep, this tree |
| `npm run build` | passes | 6 Sep, this tree |
| `unit-reviewer` | **10 of 13 PASS, 3 FAIL** — all three addressed, see below | 6 Sep, this tree |

**What the reviewer failed, and what was done about it.** (1) It was told not to run the checks
because a `test-runner` was running concurrently, and correctly refused to take "they pass" on the
author's word — the `ALL CHECKS PASS` line exists and is recorded in the row above. (2) The
CHANGELOG did not mention `.gitignore` or the `PROGRESS.md` edit, and entry 70 wrongly said the
Today outlook changed with "no behaviour change" when it gained a new runtime check — both corrected
in entry 73. (3) The `toolPeriodContext` doc block claimed "money tools that resolve a date range
read the same row the screen does", which is untrue of `list_transactions` and `get_money_overview`
— the comment now says which two tools actually use it and points at the open job below. The
reviewer also strengthened the case for that job by noticing two of the ten bare calls are defaults
on *writes*.

Its ten passes are worth knowing, because they are the expensive things to re-derive: no secrets
reach the browser, money stays integer cents, the new recurrence anchors on the row's own
`created_at` rather than the device clock, migration 0022's "no orphan reminder" invariant holds,
all 22 tools are genuinely in `ALL_TOOLS` (checked mechanically), the `tools.ts` header's list of
twelve write tools is exactly right, and every new user-facing string is plain English.

> **The build lock — read the whole of this before deleting anything.** `npm run build` refusing
> with *"Another next build process is already running"* has **two** causes and they want opposite
> responses:
>
> 1. **A build really is running.** Usually because two `test-runner` agents were launched with
>    overlapping lifetimes. `tasklist | grep node` shows the workers — a live build shows one or two
>    node processes north of 1 GB. **Wait.** Deleting the lock here starts a second build writing
>    into the same `.next` and is how you get genuinely corrupt output.
> 2. **Nothing is running, and a killed build left the flag set.** `.next/diagnostics/build-diagnostics.json`
>    still reads `"buildStage": "static-generation"` and every later build believes it. Deleting that
>    one file is the whole fix.
>
> So: check for node processes FIRST, and only delete the file if there are none. This session hit
> both, diagnosed the second correctly, then wrote down "delete the file" as though it were the only
> answer and immediately hit the first. **Do not run two `test-runner` agents at once.**

---

## What is DONE in this commit

1. **`create_routine`** — the assistant can create a routine, with `src/lib/routines/parse.ts` and
   `icon-names.ts` behind it turning loose language into an exact shape or an error sentence, never
   a plausible guess. CHANGELOG 68.
2. **Custom report ranges** — `customRangeFor`, `customRangeProblem`, `ReportRequest`,
   `rangeLongLabel` in `src/lib/finance/period.ts`; `src/lib/finance/report-queries.ts` extracted so
   the Reports screen and the assistant run the *same* queries; the `get_money_report` tool.
   CHANGELOG 69.
3. **The suggestion-chip allowlist** — `src/lib/ai/suggestable.ts`. CHANGELOG 70.
4. **The assistant billing hole** — `canAccessPath(profile, "/assistant")` at the top of `ask()`.
   CHANGELOG 71. **Written and reviewed, NOT adversarially tested — see job 1 below.**
5. **Three comments that were lying** were rewritten against the actual code (the `ledger.ts`
   inclusive-date claim in `period.ts`, the "ONLY copy" claim in `report-queries.ts`, and the
   `tools.ts` header that still said the assistant couldn't touch budgets or goals — it has been
   able to since the money audit).

---

## The jobs left, in order

### Job 1 — finish closing the billing hole, and prove it *(was task #47)*

`ask()` is gated and `unit-reviewer` confirmed that gate is correct and sufficient **for `ask()`**.
Two other paths onto the owner's card are still open, both pre-existing, both found in the review
rather than by this session's own reading — so treat "the crew billing hole is closed" as false
until these are done:

1. **`ensureDailyOutlook`, called from `src/app/(app)/today/page.tsx:161`** for any account with the
   outlook panel on. `/today` is deliberately not module-gated, so this is a real second door and it
   spends model credit on a schedule rather than on a tap. **This is the one that matters** — it
   costs money without anyone doing anything.
2. **`startConversation`, `listConversations`, `deleteConversation`**
   (`src/app/(app)/assistant/actions.ts:163`, `211`, `272`) are ungated. No credit is spent and RLS
   keeps every row to its own account, so nothing leaks — but a workout-only account can still
   create empty conversation rows by calling the action directly. Lower stakes; same one-line fix.

**Then the test that actually proves it.** Against the live database in a `BEGIN` / `ROLLBACK`: set
a second account to workout-only, call the path `ask()` takes, and assert **two** things — that it
returns the `unavailable` shape, *and that no row lands in `ai_usage`*. The absent usage row is the
whole point; a polite refusal that still bills is not a fix. Do the same for the outlook path once
it is gated. This is the only claim in the commit that asserts a security property without
evidence.

### Job 2 — the evening ritual and the day-plan verbs *(was task #48)*

Confirmed missing by grep — `get_day_plan` and `plan_tomorrow` have zero hits anywhere, and nothing
in the codebase touches the `day_plans` table from the AI side.

| Tool | Module | Backed by |
|---|---|---|
| `get_day_plan` | tasks | `getTodayFocus` + `getYesterdayReflection` in `calendar/actions.ts` |
| `plan_tomorrow` | tasks | `planTomorrow` — writes `day_plans.top_goals`, `evening_reflection` |

`get_report` from the original plan is **already built** (`get_money_report`); don't build it twice.

### Job 3 — propose-then-confirm *(was task #49)*

`runOutlookSuggestion` in `src/app/(app)/today/outlook-actions.ts` is the reference implementation,
and its comments spell out four invariants that are load-bearing rather than stylistic:

1. the client sends **only an index**, never `{tool, args}` — otherwise the action is a
   general-purpose write endpoint;
2. the proposal is **re-read from the database**, so only what the model wrote for this person runs;
3. the tool is **re-looked-up in `ALL_TOOLS` and its module re-checked**;
4. a taken proposal is **marked (`actedAt`), never removed** — filtering renumbers the array while
   the browser still holds the old numbering, and the button then does something other than its
   label.

Shape: migration `0043` adding `proposals jsonb` to `assistant_messages`, beside the existing
`actions`. A new `runAssistantProposal({ messageId, index })`. **Migration 0043 must revoke EXECUTE
the way 0042 does** — 0041 assumed nothing was public and was wrong, because revoking from PUBLIC
does not remove Supabase's default grants. That lesson is one migration old.

Which writes become proposals, driven by the existing `aiBoldness` preference (Settings → AI & cost)
that currently only affects insights:

- **act** — writes run immediately, as today.
- **suggest** *(Alan's setting)* — the **money-writing tools** become proposals
  (`log_expense`, `update_transaction`, `manage_budget`, `manage_goal`); everything else still runs,
  because he explicitly asked and every screen already has one-tap undo.
- **notice** — every write becomes a proposal.

Money is the line on purpose. A wrong money write survives, compounds into safe-to-spend, and has to
be found again at month-end. Putting two taps on "add milk to the list" is how a confirm step
becomes something people learn to tap through without reading.

### Job 4 — verify and document *(was task #50)*

`test-runner` **and** `unit-reviewer`, both shown to Alan, before anything is marked complete in
`PROGRESS.md`. Then `CHANGELOG.md`, `PROGRESS.md`, `MANUAL.md`. New tests to write: the boldness
matrix deciding propose-vs-execute; index stability when a proposal is marked taken; and
`get_report`'s bad ranges going through `customRangeProblem` rather than a second set of rules.

---

## Open review findings, triaged

Findings from `unit-reviewer` against an earlier snapshot. **Already fixed:** the CHANGELOG gaps
(entries 68–71 now cover everything including the security fix), the Timeline allowlist
(`suggestable.ts`), the untested date maths (`money-and-units.test.mts` gained 179 lines), and the
three untrue comments. **Still open, none blocking:**

1. **Ten call sites still use bare `todayInAppTimezone()`** — `tools.ts` lines 183, 330, 365, 446,
   795, 854, 944, 1220, 1353, 1614. The file's own comment at line 129 says not to: with no argument
   it falls back to a hardcoded zone rather than the profile's. `toolPeriodContext(ctx)` (line 135)
   is the correct call and only three sites use it. This is a real wrong-day bug for a travelling
   account, and Alan asked for travel to "be real" in Settings. Worth its own small pass — mechanical
   edits plus a test, not a redesign. Note two of the ten (`log_expense`'s default `txn_date`,
   `manage_goal`'s `anchor_date`) are defaults on *writes*, so a wrong day there is stored, not just
   displayed. Do those first.
2. **`list_transactions` shows a Reports-specific message.** It reuses `customRangeProblem`, which
   can answer "Reports cover about five years at a time" — from a tool that is not Reports.
3. **`create_routine` defaults the phone nudge ON** when a time is given; the routine dialog on the
   screen defaults it off. *This one is Alan's call, not a bug to fix silently:* ask him whether
   "remind me at 7pm" should mean a phone notification or just a time on the card.
4. **`report-queries.ts` types its client as plain `SupabaseClient`**, looser than the typed client
   used elsewhere.
5. **The two money tools can still disagree, just not by a day.** `get_spending_by_category`
   (`tools.ts:530`) has no paging, while `report-queries.ts` pages to 60,000 rows. Over a range
   containing more than 1000 CAD transactions the older tool silently under-reports and
   `get_money_report` does not. Not urgent at Alan's transaction volume, but it is the same class of
   bug as the off-by-one this wave existed to fix, and it will not announce itself.

---

## Things that cost this session time — don't rediscover them

- **A tool that isn't in `ALL_TOOLS` typechecks, lints, and silently does not exist.** Adding the
  export is not adding the tool. Check the array every time.
- **Do not build a regex inside a JavaScript template literal.** `` new RegExp(`...[\s\S]*?...`) ``
  looks right and is not: `\s` is not a valid string escape, so it collapses to a bare `s` and the
  pattern silently matches nothing — and the failure blames the code being searched, not the search.
  Use a regex literal, or plain `indexOf`.
- **Bash heredocs truncate on long content** and fail with *"unexpected EOF while looking for
  matching `''"*. Use the Write tool for whole files, or a short Python script for patching.
- **`node` cannot resolve extensionless imports** in `.ts` run via type-stripping. To exercise pure
  logic ad hoc, compile to CJS first: `npx tsc <file> --module commonjs --outDir <tmp>` and run that.
- **The pg driver returns `bigint` as a string**, so `=== 649` fails against a perfectly good column.
- **`jsonb` does not preserve key order**, so comparing with `JSON.stringify` fails. Deep-equal.
- **An intentional duplicate insert aborts the whole transaction** (25P02). Wrap it in a `SAVEPOINT`
  and `ROLLBACK TO SAVEPOINT`.
- **Icon components cannot cross the Server/Client boundary as props.** Doing it once black-screened
  `/today`.
- **`react-hooks/set-state-in-effect`** bit twice. Seed state during render instead of in an effect.
- **Server Actions have a 1 MB default body limit** (`defaultBodySizeLimit` in `action-handler.js`) —
  the reason images are downscaled client-side in `src/lib/images.ts` before upload.

## Rules that are not optional

From `CLAUDE.md`, and both were nearly skipped this session:

- **Every request gets a `CHANGELOG.md` entry**, newest at the bottom, even small ones. A security
  fix with no record of why it was made is the exact thing that rule exists to prevent.
- **Nothing is complete until `test-runner` and `unit-reviewer` both report and Alan has seen
  both.** A FAIL on either means not complete, no matter how finished it looks.
- **Scout before building**, and keep bulk output (test logs, wide dumps) inside subagents.
- **Two strikes then stop.** If `unit-reviewer` fails the same item twice, do not try a third time —
  explain it to Alan in plain English and let him decide.

The approved plan this all came from is at
`C:\Users\Alan\.claude\plans\effervescent-yawning-waffle.md`.

---

## Second review pass — added 6 Sep by a parallel session

**Read this before trusting the "landed, not blessed" table above.** A second session was working
in this same tree at the same time as the one that wrote this file. It ran `unit-reviewer` and `qa`
against the **current** tree (the review recorded above saw an earlier snapshot) and then fixed
what they found. `npm run lint`, `npm run build` and `npm test` all pass on the tree as it now
stands. See CHANGELOG entries 74 and 75 for the detail.

**Fixed since this handoff was written:**
- `get_spending_by_category` had never actually moved onto the shared query — it kept its own,
  unpaged (silently capped at 1000 rows) and with a looser definition of "spending" (not-income
  rather than expense-only). So the assistant and Reports could still give two different answers,
  which is the fault the wave existed to end. It now calls the shared query.
- **Ten** bare `todayInAppTimezone()` calls in `tools.ts`, not the two the earlier review found —
  and two of them were **writes**, not displays: `log_expense`'s transaction date and
  `manage_budget`'s anchor date. Near midnight those could land on the wrong day.
- `getCurrentProfile()` defaulted a failed or empty read to **owner**, so entry 71's new assistant
  gate failed open. Now fails closed; the reasoning for why that can't lock Alan out is in entry 75.
- An unrecognised or contradictory repeat word silently produced a **daily** routine.
- Both one-tap suggestion buttons were check-then-act and could double-run; they now claim before
  running. Fixing that put an index into a query filter, which is now shape-validated.
- The Timeline chip's ignored-but-executable-looking payload is gone.

**Still open, and both need a schema change — deliberately not done here:**
1. Two *different* suggestion chips claimed within milliseconds can still lose one "done" mark
   (the suggestions share one JSON column, so a claim can't touch a single element). The same chip
   cannot double-run.
2. Budget "spent so far" is duplicated in two files and neither pages — a category with >1000
   transactions in one budget period under-reports on both screens. They agree with each other, so
   it is a shared blind spot rather than a disagreement.

**Also still open** (from the list above, unchanged): `list_transactions` can emit a
Reports-specific "about five years" message.

**A warning for whoever picks this up.** Two sessions were editing this working tree at once.
Comments were observed changing between one agent's read and its write. Nothing appears to have
been lost — the checks pass and the entries reconcile — but **verify the tree against
`git diff` before trusting any single file**, and don't run two sessions on one checkout again.
Nothing has been committed by the second session; the staged work is exactly as the first left it,
plus the fixes above.
