# Alan OS — working notes for Claude Code

This is Alan's personal "second brain" life-management PWA. The full build bible is
`SPEC.md` (read the relevant Part before starting any module work) — `PROGRESS.md`
tracks what's shipped phase by phase, `MANUAL.md` is the plain-English user guide that
grows after every completed phase, and `CHANGELOG.md` is a prompt-by-prompt record of
every request made and every change made in response (see next section).

## Keep CHANGELOG.md current — every single request

After finishing *any* request from Alan (a new feature, a bug fix, a tweak — anything),
add an entry to `CHANGELOG.md` before considering the work done: what he asked for
(paraphrased plainly) and a detailed, one-by-one list of what actually changed. This is
not optional and not just for big features — the point is that a future session (this
agent, restarted, or a completely different AI) can open the repo cold and reconstruct
the full history of *why* the code looks the way it does. Newest entries go at the
bottom. Do this even for small requests; keep the entry proportional to the change, but
never skip it.

## The most important rule

**Alan is not a programmer and cannot read code or debug an error message.** Never
assume he can. Every explanation, status update, and "here's what to do next" must be
in plain English — no jargon, no stack traces, no "just run this command" without
saying exactly what to type and why. After finishing a feature, follow the ritual
already defined in `SPEC.md` Part B3: a 3-line plain-English summary of what changed,
plus exactly what to tap to try it on his phone. When a decision is his to make, offer
it as a short plain-language choice, not a technical tradeoff.

## Locked conventions (see SPEC.md for the full versions)

- Stack: Next.js (App Router) + TypeScript, Supabase (Postgres/Auth/Storage/Realtime),
  Tailwind + shadcn-style components, Framer Motion. No ORM — raw SQL migrations in
  `supabase/migrations/`, applied via `scripts/run-migration.mjs`.
- Multi-tenant from day 1: every table has RLS enabled *before* any feature code
  touches it. Default policy is `user_id = auth.uid()` for both read and write —
  the workout tables are the one deliberate exception (crew-readable, author-writable).
  Never disable RLS "temporarily."
- Money is always integer cents + currency code, never floats. Timestamps are stored
  UTC and only converted to America/Winnipeg at display time.
- One phase per session. Don't build ahead of the phase being worked on, and don't
  "improve" already-shipped modules unless asked.
- Free tiers only (Vercel + Supabase). The only paid line item is AI API usage.

## Sub-agents for this project

Four project-scoped agents live in `.claude/agents/`:

- **frontend-dev** — Next.js/React/Tailwind/Framer Motion UI work.
- **backend-dev** — Supabase schema, migrations, RLS, server actions.
- **qa** — verifies a finished feature end-to-end (build/lint/typecheck, RLS under
  real auth, walking the actual flow) and reports findings as a structured list.
- **project-manager** — no code; turns finished technical work into the plain-English
  update described above and is who should phrase any question that needs to go to
  Alan. Default to this voice whenever talking to Alan directly, regardless of which
  agent(s) did the underlying work.
