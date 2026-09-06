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
workout-only account could have made the app ask AI questions on your card (they can't now).

**None of it is on your phone yet.** It is saved and safe, but it has not had the second pair of
eyes the project rules require, so nothing has been marked finished. The next session picks up at
exactly that point.

---

## State of the tree

Last commit at time of writing: `c609460` (Wave 2A). Everything below sits in the commit this
handoff is part of, so nothing is at risk of being lost — but it is **landed, not blessed.**

| Check | Result | When |
|---|---|---|
| `npm run lint` | passes | 6 Sep, this tree |
| `npm test` | **166 tests, 0 failures** (was 149 earlier in the session, 108 in PROGRESS.md) | 6 Sep, this tree |
| `npm run build` | passes — a stale lock had been hiding this, see below | 6 Sep, this tree |
| `unit-reviewer` | ran against an *earlier snapshot*; its findings are triaged below | 6 Sep |

> **The build lock, because it will happen again.** A crashed `next build` leaves
> `.next/diagnostics/build-diagnostics.json` with `"buildStage": "static-generation"`, and every
> later build refuses with *"Another next build process is already running."* Nothing is actually
> running. Delete that one file and the build works. Do not go hunting for a phantom process.

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

### Job 1 — prove the billing hole is actually closed *(was task #47)*

The code is in. The test that matters is not. Against the live database in a `BEGIN` / `ROLLBACK`:
set a second account to workout-only, call the path `ask()` takes, and assert **two** things —
that it returns the `unavailable` shape, *and that no row lands in `ai_usage`*. The absent usage
row is the whole point; a polite refusal that still bills is not a fix. Do this first: it is the
only thing in this commit that claims a security property without evidence.

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

---

## Things that cost this session time — don't rediscover them

- **A tool that isn't in `ALL_TOOLS` typechecks, lints, and silently does not exist.** Adding the
  export is not adding the tool. Check the array every time.
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
