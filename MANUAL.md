# Alan OS — User Manual

This is the plain-English "how do I actually use this" guide — separate from
`SPEC.md` (what to build) and `PROGRESS.md` (build checklist). A new section
gets added here once every checkbox in a phase is checked off, so this
document grows alongside the app. If you ever forget how something works,
look here first.

**Live app:** https://alan-os-nine.vercel.app

---

## Phase 0 — Foundation

What Phase 0 gives you: an account system, the app's navigation shell, and a
way to make the app look how you want. None of the actual modules (Money,
Tasks, Workout, etc.) exist yet — those come in later phases. Right now
they're just labeled placeholder pages so the navigation has somewhere to go.

### Signing up (first time only)

1. Go to https://alan-os-nine.vercel.app — you'll land on the sign-in page.
2. Tap **"Create an account"**.
3. Enter the invite code: `alanos-winnipeg-2026`
   (This is a shared secret word that keeps random strangers from signing
   up. Only people you give this code to can create an account.)
4. Enter your name, email, and a password (6+ characters).
5. Tap **"Create account"**.
   - If Supabase has email confirmation turned on, you'll be told to check
     your email and click a confirmation link before you can sign in.
     Otherwise you'll be signed in immediately.

### Signing in

1. Go to https://alan-os-nine.vercel.app
2. Enter your email and password, tap **"Sign in"**.
3. You'll land on the **Today** page — currently just a welcome message,
   since the real dashboard doesn't ship until Phase 1 and 7.

### Getting around the app

- **On your phone:** a row of tabs sits at the bottom of the screen —
  Today, Money, Tasks, Workout, More. Tap any tab to jump to that section.
- **On a computer:** the same links appear as a sidebar on the left.
- **More** opens a list of everything that doesn't fit in the bottom bar:
  Calendar, Journal, Vinyl, Shopping, and Settings.
- **The floating "+" button** (bottom-right, on every screen) is where
  quick-capture will live eventually ("spent $12 at Tim Hortons, remind me
  to call mom Saturday" typed in one box). For now it just says the
  feature is coming later — that's expected, not a bug.

### Changing how the app looks (Settings → Appearance)

1. Tap **More → Settings → Appearance**.
2. **Palette:** tap any of the 6 color swatches (British Racing Green is the
   default) — the whole app recolors instantly so you can preview before
   committing.
3. **Mode:** Light, Dark, or System (System follows your phone/computer's
   own light/dark setting).
4. **Heading font:** three choices — Space Grotesk (default), Archivo,
   Fraunces.
5. **Text size:** S / M / L.
6. **Density:** Compact or Comfortable spacing.
7. Tap **Save** — a small "Saved." confirmation appears, and your choice is
   now tied to your account, so it'll follow you to any device you sign
   into.

### Changing your password

1. Tap **More → Settings → Password**.
2. Enter a new password twice, tap **Update password**.

### Signing out

1. Tap **More → Settings**.
2. Tap **Sign out** at the bottom.

### Installing it like a real app

- **Android (Chrome):** open the site → tap the **⋮** menu → **"Add to Home
  screen"**. It gets its own icon and opens full-screen, no browser bar.
- **Windows (Chrome/Edge):** open the site → click the install icon in the
  address bar (a little monitor-with-arrow icon) → Install.
- **Mac (Chrome):** same install icon in the address bar. In Safari:
  File → Add to Dock.
- **iPhone (Safari, for friends later):** Share button → "Add to Home
  Screen".

### Who can see what

Right now there's only one role in use: **owner** (you). Later phases add
**workout_member** (your 3 friends — they'll only ever see the Workout tab
and their own Settings, nothing else of yours) and **full_user** (a friend
upgraded to their own private instance). You don't need to do anything
about this now — it's just good to know the system already has it built in.

### If something looks broken

- Refresh the page first — most odd states are just a stale page.
- If a page shows a server error, tell whoever's driving the coding agent
  exactly what you saw (screenshot helps) and say "fix this."
- Your account and data live in Supabase, completely separate from the
  website code — redeploying the app or rolling back code never touches
  your data.

---

## Phase 1 — Warm-up

What Phase 1 adds: a real Shopping list, a real Tasks module, and the Today
dashboard now shows real widgets for both — plus a preview of every other
module as a "coming soon" card, so you can see the shape of the full app
even though most of it isn't built yet.

### Shopping list

1. Tap **Shopping** (in the bottom tabs/sidebar, or via More).
2. Type an item name — a category dropdown next to it auto-guesses as you
   type (e.g. "milk" → Dairy). Leave it, or pick a different one yourself;
   the moment you touch it manually, your choice sticks instead of the
   guess. **The app remembers your correction** — next time you type that
   same item name, it'll auto-pick the category you chose, not just the
   generic guess.
3. Optionally enter a quantity (count, g, kg, mL, or L) next to the
   category — leave it blank for a plain item.
4. Tap the **star** next to an item to mark it a **staple** — something you
   buy regularly. Staples are the ones that come back automatically:
   once you buy one, it goes quiet for about 2 weeks and then reappears
   as a "Running low?" suggestion chip at the top of the list.
5. Tap an item's checkbox as you put it in your cart. Checked items sink to
   a "Checked" section at the bottom. Shopping across multiple stores in
   one trip works naturally — only check off what you actually bought at
   each store; everything else stays on the list untouched.
6. When you're done at a store, tap **Finish trip** — you'll see a
   confirmation of exactly what happened (how many items were cleared, how
   many staples will resurface later). Staple items go dormant (ready to
   resurface later); one-off items are cleared for good.
7. **Works with no signal.** Add, check off, or delete items with your
   phone in airplane mode or in a dead zone — you'll see a small "Offline —
   changes will sync" badge. The moment you're back online, everything you
   did quietly syncs to your account. Nothing is lost, nothing needs to be
   redone.
8. **Managing categories:** tap "Manage categories" on the Shopping page
   (or **More → Settings → Shopping**) to rename or delete categories, add
   your own (e.g. "Electronics"), and see/edit the list of item names each
   category has learned. Deleting a category moves its items to "Other,"
   which can't itself be deleted.

### Tasks

1. Tap **Tasks**.
2. Type a task and tap **+**. Pick which section it belongs in — **Now,
   Today, This Week, This Month,** or **Someday** — and a category.
3. For sales-call tasks, tap the **"Follow up with ___"** or **"Call ___"**
   chip above the input — it fills in the phrase and sets the category to
   Work for you; just type the name and add it.
4. Tap the small **+** next to any task to add a subtask underneath it
   (one level — subtasks can't have their own subtasks).
5. Tap a task's empty checkbox to complete it. If it still has unfinished
   subtasks, you'll be asked to confirm first.
6. To move a task to a different section later, use the small dropdown next
   to it on the row.
7. **Work tasks** are pulled into their own collapsible "Work" section near
   the bottom, so your personal list isn't cluttered by day-job to-dos.
   It's collapsed automatically before 8am, after 6pm, and on weekends —
   tap the header to expand it any time you want to peek anyway.
8. Tap **Completed** near the bottom to see everything you've finished
   (and undo one if you tapped it by mistake). Your weekly "done" count
   shows at the top of the page and on the Today dashboard.

### Today dashboard

The Today page now shows a full grid of cards:
- **Tasks** and **Shopping** show real numbers pulled from your actual data
  — tap either to jump straight into that module.
- Everything else (**Money, Workout, Calendar & Reminders, Journal,
  Weather, World news, Local news**) shows a dashed "Phase N" card — a
  placeholder for what's coming, not a bug. Each one lights up with real
  data the moment its phase is built.
- The **"Your AI briefing"** card at the top is the eventual home of a
  one-paragraph daily summary pulling from everything below it — that's
  Phase 7's job.

---

## Phase 2 — Workout

What Phase 2 adds: a real Workout module you and your 3 friends can all use
together — logging lifts and runs, seeing each other's sessions in a shared
feed, reacting and commenting, chasing streaks, and getting a little
celebration when you hit a personal record. This replaces the WhatsApp
screenshot routine.

### Logging a lift session

1. Tap **Workout → New workout**.
2. Pick a type: **Push, Pull, Legs,** or **Other**.
3. If you've saved a routine before for this type, a **"Load from template"**
   box appears — pick one and tap **Load** to instantly add all its exercises.
4. Tap **Add exercise** to search the shared exercise list (started you off
   with about 40 common ones) or add a brand-new one. If something close
   already exists, it'll ask "Did you mean X?" before creating a duplicate.
5. Each exercise you add shows **"Last:"** — exactly what you did last time —
   and quietly pre-fills a suggested next set (e.g. one small weight bump if
   you crushed it last time, or the same weight if you didn't).
6. Adjust reps/weight with the +/- buttons or type directly. **Duplicate last
   set** copies your most recent set instead of retyping it.
7. Add a note if you want, then tap **Save workout**.
8. If you hit a personal record (heaviest weight, best estimated 1-rep max,
   or most total volume for that exercise), you'll see confetti and a "New
   PR" badge on the post — and anyone else looking at the feed right then
   sees it too, live.
9. **Save as template:** once you've built a session, tap "Save as template"
   to name it (e.g. "Push Day A") so next time you can load the whole thing
   in one tap instead of re-picking every exercise.

### Logging a run

1. Tap **Workout → New workout → Run**.
2. Enter distance (km), duration, and optionally your average heart rate.
3. Tap **Save workout**.

### The crew feed

- Tap **Workout** to see everyone's recent sessions, newest first — updates
  live, no need to refresh.
- Tap the emoji row (💪🔥👏😮) to react to a workout; tap again to remove
  your reaction.
- Type in the comment box under any workout to add a comment.
- Tap **Leaderboard** at the top to see everyone's current streak, longest
  streak ever, and workouts logged this week.

### Streaks

Your streak flame counts consecutive days with at least one logged workout —
shown at the top of the Workout page and now on the **Today** dashboard too.
One built-in grace: if you miss a single day in a given week, the streak
doesn't reset — it just holds steady until your next session. Miss two days
in the same week, though, and it resets. (This is an automatic rule, not
something you have to plan ahead — worth telling whoever's driving the
coding agent if you'd rather pick your rest day yourself instead.)

### Inviting your friends

1. As the owner, tap the **person-plus icon** at the top of the Workout page
   (or go to `/workout/invite`).
2. Tap **Copy invite message** — it copies a ready-to-paste message with the
   sign-up link and your invite code. Send it via text/WhatsApp/iMessage.
3. Once a friend signs up with that code, they land straight in the Workout
   module and can only ever see Workout + their own basic Settings — nothing
   else of yours.
4. The same page shows everyone who's joined so far, so you can track who's
   still pending.

### Settings → Workout

Tap **More → Settings → Workout** to switch between **lbs** and **kg**, and
to see/delete any routines you've saved as templates.

### Today dashboard

The **Workout** card now shows your real streak flame and whether you've
logged something today — tap it to jump straight into the module.

---

*(Phase 3 section will be added here once its checklist is complete.)*
