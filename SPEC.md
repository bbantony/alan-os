ALAN OS — MASTER HANDOFF DOCUMENT

Version 2.0 (Final) — Complete, self-contained build bible.
This document contains EVERYTHING needed to build Alan OS. It is written for an AI coding agent (Claude Code, Gemini CLI, Cursor, etc.) working with a non-technical owner. Place this file in the project root as SPEC.md and instruct the agent to read it fully before every phase.



PART A — CONTEXT (who this is for and why)

A1. The Owner





Name for the app: "Alan OS" — a personal, lifelong "second brain" life-management app.



The owner does not read or write code. Every instruction, error message, and step must be explained in plain English. The agent must run, test, and fix its own code and never assume the owner can debug.



Owner lives in Winnipeg, Canada (timezone: America/Winnipeg). Just started work as an Inside Sales Rep. Devices: Windows PC, Mac, Android phone. His 3 friends who will use the workout module are all on iPhone.



Finances: banks with Scotiabank (debit + Scene+ Visa credit card), opening a Wealthsimple investment account, applying for an Amex Cobalt soon. Paid weekly (possibly biweekly — must be configurable). Occasionally sends money home to India, so INR is a second currency.



Fitness: follows Push/Pull/Legs lifting split, runs every 2–3 days (treadmill + Polar OH1 heart rate sensor; Fitbit purchase planned later). Currently shares workouts with 3 friends via WhatsApp screenshots — the workout module replaces this ritual.



Hobbies to support: photo-a-day picture diary and a vinyl record listening log (new album every 1–2 weeks).



Hard budget: total running cost must stay under $10–15 CAD/month.

A2. Product Vision

One installable web app (PWA) that runs on all his devices and is his single home for: money, tasks, calendar, reminders, daily planning, journaling, shopping, and workouts — with AI reducing friction everywhere (especially receipt scanning and natural-language quick capture). It must be beautiful enough that he wants to open it every morning.

A3. Non-Negotiable Principles





Modular monolith: one app, one database, one login. Modules ship in phases. Never scaffold a microservice.



Multi-tenant from day 1: every row of data is scoped to a user. Friends get restricted "workout-only" access now, and can be upgraded to full private instances later by changing a role value — with zero refactoring.



Phone-first: every screen designed for mobile first, desktop second.



Low friction beats features: logging an expense must take ≤5 seconds. If a flow takes more taps than a notes app, it has failed.



Free tiers only: Vercel free + Supabase free. The only paid item is AI API usage (~$3–6 CAD/mo).



Never lose data: GitHub commit after every working phase; Supabase is the single source of truth.



PART B — TECH STACK & ARCHITECTURE

B1. Stack (locked — do not substitute)







Layer



Choice



Notes





Framework



Next.js (App Router) + TypeScript



Full-stack, one repo





Hosting



Vercel (free Hobby tier)



Auto-deploys from GitHub





Database/Auth/Storage



Supabase (free tier)



Postgres + Auth + Storage + Realtime





Styling



Tailwind CSS + shadcn/ui









Animation



Framer Motion



Subtle, smooth transitions





Charts



Recharts









PWA



next-pwa or manual service worker



Installable, offline shopping list





Push notifications



Web Push (VAPID keys)



Free; served from a Vercel cron/route





AI



One cheap multimodal model via API (e.g., Claude Haiku-class or Gemini Flash)



Vision for receipts + text parsing





Calendar



Google Calendar API (OAuth 2.0)



GCal = source of truth for events





Album art



iTunes Search API or MusicBrainz/Cover Art Archive



Free, no key needed (iTunes)





FX rates



Free API (e.g., frankfurter.app)



CAD↔INR daily rate

B2. Multi-Tenancy & Roles (architecture cornerstone — read carefully)





profiles table has a role column: owner | workout_member | full_user.



owner (Alan): access to all modules; his private data.



workout_member (the 3 friends, for now): can ONLY access the workout module. They see the shared crew feed, log their own workouts, react/comment. They must never see finance/journal/tasks/etc.



full_user (future): a friend upgraded to their own complete, private Alan OS instance. All their module data is scoped to their own user_id. Upgrading = changing role from workout_member to full_user. Nothing else should need to change — design all tables and queries for this from the start.



Workout data is special: it lives in a shared "crew" space — all members see each other's workouts, streaks, PRs. Everything else is strictly private per user.



Enforce with Supabase Row Level Security (RLS) on every table. Policies: users can only read/write rows where user_id = auth.uid(), EXCEPT workout tables (workouts, workout_sets, runs, prs, reactions, comments, exercises) which are readable by all authenticated crew members, writable only by the row's author. RLS must be enabled before any feature code is written. The agent must never disable RLS "temporarily."



Auth: Supabase email/password. Owner creates friend accounts manually via invite (no public signup page — a signup route protected by an invite code stored in env vars is fine).

B3. Project Conventions for the Agent





Keep this file as SPEC.md in the repo root; re-read the relevant Part before each phase.



Commit to GitHub after every working feature with a plain-English commit message.



After every phase: run the app, test the feature, then give the owner a 3-line plain-English summary + what to tap to test it on his phone.



One phase per session. Do not build ahead. Do not "improve" completed modules unless asked.



All timestamps stored UTC, displayed in America/Winnipeg.



All money stored as integer cents + currency code. Never floats for money.



Explain any required manual step (getting API keys, clicking things in dashboards) as a numbered click-by-click list.



B4. Cross-Module Interconnectivity (standing principle — added after Phase 0)

This is Alan's lifelong "second brain," not a folder of separate tools. Whenever a
new module is built and it could reasonably surface data from an already-built
module, wire that connection in — even if Part E's per-module spec doesn't spell
it out explicitly. This principle overrides the letter of Part E when the two
conflict; Part E describes each module in isolation for clarity, but modules
should never actually feel isolated from each other once more than one exists.

Concrete example the owner gave: when adding an item to the grocery shopping
list, once the Finance module exists, show how much of the month's grocery
budget remains right there in the Shopping module — don't make him tab over to
Money to find out.

Other standing hooks to keep in mind as later phases land (add to this list as
new ones surface, don't remove — this is a living checklist for "did we wire
this up yet"):
- Shopping list ↔ Finance: remaining budget for the relevant category visible
  while adding/checking off items (from Phase 4 onward).
- Shopping list ↔ Finance ↔ Fridge (receipts): approved receipt line items
  fuzzy-match and auto-check shopping list items, updating staple timers
  (Phase 5, per Part E2); unmatched line items become their own extra
  purchases, not errors; every line item then feeds the Fridge/Pantry
  inventory (Phase 8.5) and the receipt total posts to Finance split per
  line item's category, not as one lump sum. This is the canonical
  three-module example of this principle.
- Today dashboard ↔ every module: the dashboard is the one place all modules'
  signal surfaces at once — build its widgets so each one lights up with real
  data the moment its module ships, rather than treating the dashboard as its
  own isolated Phase 1/7 feature. See the expanded Phase 7 scope in Part G.
- Tasks ↔ Calendar/Reminders: a task with a due date/time should be visible
  from the Calendar agenda view once Phase 3 exists, not force a second lookup.
- Workout ↔ Today: streak flame and "logged today?" status feed the dashboard
  once Phase 2 exists.
- Journal ↔ Today: "posted your photo today?" nudge feeds the dashboard once
  Phase 6 exists.

When in doubt about whether a cross-module hook is worth building now vs.
later: if the dependency module doesn't exist yet, don't fake it — note the
hook here (or in LATER.md) and wire it for real once that module ships.



PART C — DESIGN SYSTEM (extremely important to the owner)

C1. Style: Swiss / International Typographic





Strong grid, generous whitespace, clear typographic hierarchy, restrained color, functional illustration. Think Massimo Vignelli meets a modern dashboard. No skeuomorphism, no gradients-everywhere, no clutter.



Primary color: British Racing Green #004225. Background: warm off-white paper (#FAF7F2-ish). Text: near-black ink. Accents used sparingly (one warm accent like burnt orange or mustard for highlights/PRs/alerts).



Typography: Space Grotesk (or similar grotesque) for headings — big, confident, tight. Inter for body/UI. Tabular numerals for all money and stats.



Motion: Framer Motion page transitions and micro-interactions — smooth, fast (150–250ms), never bouncy or gimmicky. List items animate in with subtle stagger. Checking items off feels satisfying.



Dark mode: deep green-black ink background, off-white text, BRG becomes a lighter racing green. Both modes required.



Empty states: every module gets a beautiful empty state with a simple line illustration and one clear call-to-action.

C2. In-App Appearance Editor (Settings → Appearance)

User-configurable, persisted to profile:





Palette picker: 5–6 curated palettes. Default = British Racing Green. Others e.g.: Navy/Cream, Burgundy/Sand, Charcoal/Ice, Forest/Moss. Each palette defines primary, accent, background, surface, text tokens (CSS variables).



Typography: 2–3 heading font options; body font size (S/M/L); density (compact/comfortable spacing).



Live preview. Applies instantly app-wide via CSS variables.

C3. Navigation Shell





Mobile: bottom tab bar — Today · Money · Tasks · Workout · More (More = Calendar, Journal, Vinyl, Shopping, Settings).



Desktop: left sidebar with all modules.



A persistent "+" quick-capture button (floating, bottom-right) available on every screen (see Part E).



workout_member role sees ONLY: Workout + Settings(appearance/password).



PART D — DATA MODEL (Postgres tables; agent may refine types but not semantics)

profiles: id (=auth uid), display_name, avatar_url, role (owner|workout_member|full_user),
          timezone (default America/Winnipeg), theme_settings jsonb, created_at

-- FINANCE
accounts: id, user_id, name, institution (Scotiabank|Wealthsimple|Amex|other),
          type (chequing|credit_card|investment|cash), currency (default CAD),
          current_balance_cents, is_debt bool, credit_limit_cents null, sort_order
categories: id, user_id, name, icon, color, kind (expense|income), is_archived
            -- seed defaults: Groceries, Takeout, Entertainment, Rent, Utilities, Transport,
            -- Subscriptions, Health/Gym, Remittance, Work, Vinyl/Music, Misc, Income:Salary
transactions: id, user_id, account_id, category_id, amount_cents, currency (CAD|INR),
              fx_rate_to_cad numeric null, merchant, note, txn_date,
              source (manual|receipt|csv|quick_capture), receipt_id null, created_at
receipts: id, user_id, storage_path, merchant_guess, total_cents_guess, txn_date_guess,
          line_items jsonb  -- [{raw_name, clean_name, price_cents, category_id, approved}]
          status (pending_review|approved|discarded), created_at
budgets: id, user_id, category_id, amount_cents,
         period (weekly|biweekly|monthly), anchor_date (payday), is_active
savings_goals: id, user_id, name, target_cents, saved_cents, deadline null, icon, is_done
debts: id, user_id, account_id null, name, balance_cents, interest_rate_pct,
       min_payment_cents, target_payoff_date null

-- TASKS & PLANNING
tasks: id, user_id, parent_task_id null (subtasks), title, notes,
       horizon (now|today|this_week|this_month|someday), due_at null,
       category (personal|work|errand|pr_application|french|other), completed_at null, sort_order
day_plans: id, user_id, plan_date unique(user,date), top_goals jsonb (max 3, manual or auto-pulled),
           ai_briefing text null, evening_reflection text null

-- REMINDERS
reminders: id, user_id, title, notes null, remind_at, rrule text null (RFC5545 for repeats),
           status (active|paused|done), last_fired_at, mirror_to_gcal bool default false
push_subscriptions: id, user_id, endpoint, keys jsonb, device_label, created_at

-- CALENDAR
gcal_connections: id, user_id, refresh_token (encrypted), calendar_id, sync_enabled

-- WORKOUT (crew-shared visibility)
exercises: id, created_by, name, muscle_group (chest|back|shoulders|arms|legs|core|other)
           -- shared master list; any member can add; dedupe by name
workouts: id, user_id, workout_date, type (push|pull|legs|run|other), notes, created_at
workout_sets: id, workout_id, exercise_id, set_number, reps, weight_kg numeric
              -- display unit lbs/kg per user preference; store kg
runs: id, workout_id, distance_km numeric, duration_seconds, avg_hr null, source (manual)
prs: id, user_id, exercise_id, kind (weight|est_1rm|volume), value numeric, workout_id, achieved_at
reactions: id, workout_id, user_id, emoji  (unique per user+workout+emoji)
comments: id, workout_id, user_id, body, created_at
-- streaks computed on read: consecutive calendar days with ≥1 workout, per user

-- JOURNAL & VINYL
journal_entries: id, user_id, entry_date unique(user,date), photo_path, caption null,
                 mood (1–5 or emoji set) null, story text null
albums: id, user_id, artist, title, cover_url, listen_date,
        rating numeric(3,1) CHECK 0.0–10.0 (one decimal, e.g. 8.7),
        favorite_tracks jsonb, purchased_at (store/city) null, thoughts text
monthly_reviews: id, user_id, month, ai_summary text, stats jsonb, created_at

-- SHOPPING
shopping_items: id, user_id, name, category (produce|dairy|meat|frozen|pantry|household|pharmacy|other),
                is_staple bool, checked bool, last_purchased_at null, created_at




PART E — MODULE SPECIFICATIONS (granular)

E1. Today (Dashboard — home screen)





Morning state (before ~6pm): greeting + date; AI morning briefing (2–4 sentences: today's calendar events, due reminders, top-3 goals, budget pulse like "You have $62 left in this week's food budget", workout streak status, photo-of-day nudge if not posted).



Evening state (after ~8pm): "Plan tomorrow" ritual — pick up to 3 top goals for tomorrow (searchable from open tasks, or type new); optional 1-line reflection on today.



If user skips picking goals, auto-pull: overdue tasks first, then now/today horizon by sort order, max 3.



Widgets (tappable → module): next calendar event, reminders due today, weekly budget bar, streak flame with day count, mini photo thumbnail if posted today.



Quick-capture "+" (global): one text input, optional voice via browser speech-to-text. Sends text to AI parser which returns typed intents: expense, reminder, task, shopping_add, workout_note. Multiple intents per message supported ("spent 34 at superstore, remind me call mom sat 6pm, add eggs"). Each intent renders as a confirm chip (editable) → user taps ✓ to commit. NEVER auto-commit without confirmation.

E2. Money (Finance)

Accounts





Cards for each account: name, institution, balance, and for credit cards: balance owed vs limit (utilization bar). Balances updated manually (v1) or adjusted by logged transactions. Wealthsimple = manual balance entry (v1).

Logging expenses (≤5 seconds)





Big amount keypad → category grid (icons) → optional merchant/note → save. Remembers recent merchants and their usual category. Default account = Scene+ Visa (configurable).

Receipt scanning (FLAGSHIP FEATURE — build with care)





Tap scan → camera/photo picker → upload to Supabase Storage.



Server route sends image to AI vision model with a strict JSON-output prompt: extract merchant, date, line items (raw name, price), tax, total.



Review screen: merchant + date editable at top; each line item as a row with: cleaned-up name (AI de-abbreviates e.g. "GV 2% MLK" → "Milk 2%"), price, category chip (AI-suggested, tappable to change), toggle to merge/split/delete lines.



On approve: creates ONE transaction for the total (with line_items retained on the receipt record) OR optionally split into multiple transactions per category if items span categories (user chooses "save as one" or "split by category").



Cross-module hook: any approved line item whose name matches a shopping-list item (fuzzy match) → auto-check it and set last_purchased_at; matches against staples update staple timers.

CSV import





Upload Scotiabank CSV export → parse → AI categorizes each row → review table (same approve pattern) → dedupe against existing transactions by date+amount+merchant.

Budgets





Create budget per category with period weekly/biweekly/monthly, anchored to anchor_date (payday — ask owner to set once first paycheck confirms cadence). Progress bars: green → amber (>80%) → red (over). Weekly reset on anchor weekday.



"Safe to spend" number = sum of remaining budget across discretionary categories.

Savings goals





Goal cards with progress rings. Manual "add to goal" entries. On payday (detected by anchor date), show a "pay yourself first" prompt suggesting a transfer amount.

Debts





List of debts with balance, APR, min payment. Payoff projection chart with avalanche vs snowball toggle (simple amortization math).

Remittances (INR)





When currency INR selected (or category = Remittance): input CAD sent + INR received (or fetch daily rate and compute); store fx_rate. Remittance summary card: YTD total in both currencies.

Reports





Monthly: spend by category (donut), trend vs previous month (bars), top merchants. AI weekly money review (3–4 sentences, generated Sunday evening).

E3. Tasks





Sections by horizon: Now / Today / This Week / This Month / Someday. Drag between sections (or long-press menu on mobile).



Subtasks (one level deep). Checking parent with open subtasks asks to confirm.



Category tag incl. Work — Work tasks live in a collapsible group that stays out of the way outside work hours (collapsed by default before 8am/after 6pm and weekends).



Quick patterns for sales work: templates like "Follow up with ___", "Call ___" as one-tap chips in the add flow.



Completed tasks archive with weekly "done" count on dashboard.

E4. Calendar & Reminders

Google Calendar





OAuth connect in Settings. Agenda view (Today/Week) inside Alan OS reading GCal events. Create/edit simple events from the app (title, date/time, duration) → written to GCal. GCal is the source of truth; do not build a local event store beyond cache.

Reminders (native to Alan OS)





One-off and repeating (RRULE): presets — daily, weekdays, weekly on X, every N days, monthly on date. Custom RRULE builder kept simple.



Delivery: Web Push to ALL subscribed devices (phone, both computers). A Vercel Cron job runs every minute, finds due reminders, sends pushes, advances last_fired_at/next occurrence.



Notification actions where supported: Done / Snooze 1h.



Optional per-reminder mirror to GCal as an event (backup for when push is unreliable).



iPhone note (for future friend upgrades): iOS requires PWA installed to home screen for push; Android/desktop work in-browser or installed.

E5. Workout (crew module — friends' only module)

Exercise master list





Crew-shared. Add exercise: name + muscle group. Dedupe on similar names. Seed with ~40 common PPL exercises (bench press, incline DB press, OHP, lateral raise, pull-up, barbell row, lat pulldown, face pull, curl variations, squat, RDL, leg press, leg curl, calf raise, etc.).

Logging a lift session





New workout → pick type (Push/Pull/Legs/Other) → add exercises from master list (searchable, recents first) → per exercise, log sets: reps × weight with steppers. Show last session's sets for that exercise inline ("Last: 3×8 @ 135") for progressive overload. Duplicate-last-set button. Rest is optional/no timers in v1.

Logging a run





Distance (km), duration (hh:mm:ss), optional avg HR (owner uses Polar OH1; manual entry v1; Polar AccessLink/Fitbit API integration is Phase 7 — leave source field ready).

Crew feed





Reverse-chron cards: member avatar/name, workout type badge, summary (exercises + top sets, or run distance/pace), time, notes. Emoji reactions (💪🔥👏😮) + comments. Realtime updates via Supabase Realtime.

Streaks & PRs





Streak = consecutive calendar days (America/Winnipeg) with ≥1 logged workout, per member. Flame + count on feed header; leaderboard tab (current streak, longest streak, workouts this week).



PR detection on save: for each exercise, compare against member's history for (a) heaviest weight, (b) estimated 1RM (Epley: w×(1+reps/30)). New PR → special celebratory feed card (confetti animation, accent color) + push notification to the crew.

Members





Owner invites via invite-code signup link. Friends land ONLY in workout module. Unit preference lbs/kg per user (store kg).

E6. Journal (photo-a-day) & Vinyl

Photo-a-day





One entry per day: photo (required), optional caption, mood, short story text. Grid gallery by month; tap → full-screen story view (photo + text, elegant typography).



Daily reminder push at user-set time (e.g. 9pm) if today has no entry.



Photos stored in Supabase Storage, compressed client-side (~1600px max) to protect the 1GB free tier.

/frame — Wall display route





Fullscreen, no-chrome ambient page for cheap Android tablets in kiosk mode: rotating carousel of recent journal photos (Ken Burns slow zoom), overlaid clock + today's agenda + reminders due. Auto-refresh. Long-session token so it never logs out. Dark, gorgeous.

Vinyl log





Add album: search iTunes API by artist/title → auto-fill cover art (editable manually). Fields: listen date, rating 1.0–10.0 with exactly one decimal (slider + numeric input), favorite tracks (chips), where purchased, thoughts (long text).



Shelf view: cover grid sortable by rating/date/artist. Rating displayed prominently (e.g., "8.7").

AI Month in Review





Generated on the 1st for previous month: collage of 6–9 journal photos, albums listened with ratings, money summary (top categories, savings added), workout totals (sessions, volume, km run, streak), 1 paragraph AI narrative. Saved to monthly_reviews, viewable as a beautiful shareable page.

E7. Shopping List





Single personal list grouped by category; check-off with satisfying animation; checked items drop to bottom, cleared on "finish trip" (sets last_purchased_at).



Staples: flagged items auto-resurface as suggestions when not purchased in ~14 days (uses receipt-scan matching + manual check-offs). Suggestion row at top: "Running low? Eggs · Milk · Protein powder" → tap to add.



Add via quick-capture ("add eggs and dish soap") or in-module. Offline-capable (PWA cache + sync on reconnect).



PART F — AI LAYER (implementation notes)





All AI calls go through ONE server-side route/utility with per-feature system prompts. API key in env vars, never client-side.



Use a cheap multimodal model. Force JSON output (tool/function calling or JSON mode). Validate JSON server-side; on parse failure, retry once then fail gracefully to manual entry.



Features: (1) quick-capture intent parser, (2) receipt vision extraction, (3) CSV categorizer, (4) morning briefing, (5) weekly money + training reviews, (6) month in review.



Briefings/reviews are generated by scheduled Vercel Cron jobs and CACHED in the DB (day_plans.ai_briefing, monthly_reviews) — never regenerate on page load.



Cost guardrails: cap max tokens per call; briefing = 1 call/day; receipt = 1 call/scan. Expected total: $3–6 CAD/month.



PART G — BUILD PHASES (execute strictly in order, one per session)





Phase 0 — Foundation: Repo + Next.js + Supabase connect + Auth (email/password, invite-code signup) + profiles/roles + RLS baseline + PWA (manifest, service worker, installable) + full design system (Part C) + app shell/nav + Settings→Appearance editor + deploy to Vercel. NO modules.



Phase 1 — Warm-up: Shopping list (complete, incl. staples logic + offline) + Tasks (horizons, subtasks, work category) + basic Today dashboard (static widgets, no AI yet).



Phase 2 — Workout: everything in E5 (exercise list, logging w/ last-session display, runs, crew feed + realtime, reactions/comments, streaks, PR detection + celebration, invite flow, role gating). Onboard the 3 friends at end of phase.



Phase 3 — Reminders & Calendar: Web Push infra (VAPID, subscriptions per device, Vercel cron dispatcher) + reminders CRUD w/ RRULE presets + Google Calendar OAuth + agenda view + event creation + day-planner ritual (morning pick/evening plan, auto-pull).



Phase 4 — Finance core: accounts, categories, ≤5s manual logging, budgets (payday-anchored periods), savings goals, debts + payoff projections, INR remittances, reports.



Phase 5 — Finance AI: receipt scanning pipeline + review UI + shopping cross-check hook + CSV import w/ AI categorization.
  Full multi-store trip flow (owner spec, added after Phase 1 — see Part B4):
  the owner builds one big shopping list over the course of a week, then
  shops across multiple stores in one outing (e.g. 40% of the list at store
  A, the rest at store B). Checking off items and hitting Finish Trip is
  already per-store-safe as of Phase 1 (it only processes checked items,
  leaving the rest on the list untouched for the next store) — no rework
  needed there. What Phase 5 adds on top: after each store, scanning that
  store's receipt should (a) fuzzy-match line items against the shopping
  list and reconcile them (already spec'd), (b) treat any receipt line item
  that does NOT match a list item as a legitimate extra purchase — not an
  error state, just create it as its own record, (c) once a receipt is
  approved, every line item (matched or extra) should be pushed into the
  Phase 8+ fridge/pantry inventory (see note below), and (d) the receipt
  total should be split across Finance categories by each line item's own
  category and posted as transactions there — not as one lump sum. This is
  the canonical example of Part B4's interconnectivity principle: one
  receipt scan should ripple through Shopping, Fridge, and Finance at once.

Phase 8.5 — Fridge/Pantry inventory (owner request, added after Phase 1): a
  simple inventory of what's actually in the fridge/freezer/pantry right
  now (name, quantity, category, added date) — fed automatically by
  Phase 5's receipt approval flow once that exists. Deliberately built
  without AI first (just CRUD tracking), THEN in Phase 7's AI layer add
  "what can I cook with what's in my fridge" as a quick-capture-style
  prompt that reads current inventory. Do not build this before Phase 5,
  since it depends on the receipt approval hook for real data to be useful
  — building it earlier means either fake data or manual-only entry that
  gets thrown away once receipts exist.



Phase 6 — Journal & Vinyl: photo-a-day + reminder + gallery, vinyl log + iTunes art + shelf, /frame wall display route.



Phase 7 — AI everywhere: quick-capture parser + confirm chips, morning briefing cron, weekly reviews, Month in Review.
  Also the Today dashboard's full "everything relevant, AI-summarized" form (added after Phase 0
  per owner request — see Part B4): weather widget (free API, e.g. Open-Meteo, no key needed),
  world news headlines widget, local news widget with a user-selectable region, and a single AI
  narrative summary that pulls signal from every module that exists by then (tasks due, budget
  pulse, workout streak, reminders, calendar, journal nudge) into one morning briefing. Each
  dashboard widget should already be wired to real data from its own module the moment that
  module ships in an earlier phase — Phase 7's job is the AI narrative layer + weather/news on
  top, not building the widgets from scratch. Cap news/weather calls same as other AI features
  (Part F cost guardrails apply — cache, don't refetch on every page load).



Phase 8 (later/optional): Polar AccessLink + Fitbit API auto-sync for runs; upgrade friends to full_user; Wealthsimple tracking improvements; work-phone/sales workflow refinements.

Per-phase ritual: agent re-reads relevant SPEC sections → builds → tests locally → owner tests on phone → git commit → deploy → 3-line summary.



PART H — DEPLOYMENT & OPERATIONS GUIDE (plain English, for the owner)

H1. Where the app actually lives





Your code lives on GitHub (free) — think of it as cloud backup + version history for the project.



The app itself runs on Vercel — a company that runs your app on their servers worldwide for free. When code is pushed to GitHub, Vercel automatically rebuilds and updates your live app in ~1 minute. You never manage a server.



Your data (transactions, workouts, photos) lives in Supabase — a hosted database service. Separate from Vercel, so redeploying the app never touches your data.



Nothing runs on your home computer. Everything is in the cloud, on free tiers, accessible from anywhere with internet.

H2. One-time setup (do these in order, ~30 minutes)





Create a GitHub account (github.com) — free.



Create a Supabase account (supabase.com) → "New project" → name it alan-os, choose a strong database password (save it in a password manager), pick region closest to Winnipeg (US East/Central). Copy the Project URL and anon key from Project Settings → API — the coding agent will ask for these.



Create a Vercel account (vercel.com) → sign in WITH your GitHub account.



Get an AI API key (Anthropic console or Google AI Studio) → add a payment method → set a spending limit of $10/month in their billing settings so it can never surprise you.



Install your coding agent (e.g., Claude Code or Gemini CLI) on your computer — it will handle everything else, including creating the GitHub repo and connecting Vercel. When it needs a key or a dashboard click, it will tell you exactly what to do.

H3. How you access Alan OS





Vercel gives you a free URL like alan-os.vercel.app (optionally buy a custom domain ~$15/yr, e.g. alanos.app, and connect it in Vercel settings in 5 minutes).



Android phone: open the URL in Chrome → menu → "Add to Home screen" → it installs like a real app with an icon, full screen, push notifications.



Windows: open in Chrome/Edge → install icon in the address bar → installs as a desktop app.



Mac: same via Chrome, or Safari → File → Add to Dock.



Friends (iPhone): send them the invite link → they sign up → Safari → Share → "Add to Home Screen" (required for their app-like experience).



Wall tablets: any cheap used Android tablet → open your-url/frame in a kiosk-mode browser app (e.g., Fully Kiosk) → mount on wall.

H4. Keys the agent will need (put in Vercel env vars, never in code)

SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (server only), AI_API_KEY, VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY (agent generates), GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (from Google Cloud Console — agent will give click-by-click instructions; the Google OAuth consent screen can stay in "testing" mode since only you use it), INVITE_CODE (any secret word for friend signups).

H5. Ongoing costs & limits





Vercel Hobby: free (fine for personal use; cron jobs limited on free tier — if minute-level reminder crons hit limits, run the dispatcher every 5 minutes or use a free external cron pinger like cron-job.org hitting a secured route).



Supabase free: 500MB database + 1GB file storage + 50K monthly active users worth of auth — years of headroom if photos are compressed. If storage ever fills (~3+ years of photos), Supabase Pro is $25USD/mo OR offload old photos — decide then.



AI API: ~$3–6 CAD/mo with the caps in Part F.



Total: roughly $5–8 CAD/month. Free-tier caveat: Supabase pauses free projects after ~1 week of zero activity — daily use prevents this, and a weekly cron ping guarantees it.

H6. If something breaks





Vercel dashboard → Deployments → "Redeploy" previous working version (instant rollback).



Code broken? Tell the agent: "roll back to the last git commit."



Data is safe in Supabase regardless. Enable Supabase's scheduled backups view; occasionally download a backup (Database → Backups) for peace of mind.



PART I — FIRST PROMPT TO GIVE THE CODING AGENT



Read SPEC.md in this folder completely before doing anything. I am non-technical — explain every step in plain English and never assume I can read code. Execute Phase 0 only as defined in Part G, following the stack rules (Part B), design system (Part C), and multi-tenancy/RLS rules (Part B2) exactly. Do not build any Phase 1+ features. When you need keys or dashboard actions from me, pause and give me numbered click-by-click instructions. Test everything yourself, deploy to Vercel, then tell me exactly how to install it on my Android phone.

Then for each next session: "Read SPEC.md. Phase N is complete and deployed. Execute Phase N+1 only."