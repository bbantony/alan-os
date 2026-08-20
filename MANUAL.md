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
  Today, Money, Tasks, Shop, Workout, More. Tap any tab to jump to that
  section. (Shopping moved into this row later — it used to be buried
  under More, which didn't make sense for something you check while
  actually standing in a store.)
- **On a computer:** the same links appear as a sidebar on the left.
- **More** opens a list of everything that doesn't fit in the bottom bar:
  Calendar, Journal, Vinyl, and Settings.
- Only the modules a given account actually has access to show up in the
  tabs/More at all — see the **Admin — Users & Crews** section further down
  for how that's controlled.
- There used to be a floating "+" button on every screen for quick-capture.
  It was removed — it only ever said "coming soon" (real quick-capture is
  later AI work), and a button that does nothing on every single screen was
  more confusing than useful. It'll come back once it actually works.

### Changing how the app looks (Settings → Appearance)

1. Tap **More → Settings → Appearance**.
2. **Palette:** tap any of the 11 color swatches (British Racing Green is
   the default) — the whole app recolors instantly so you can preview
   before committing. Added later: Teal/Mist, Plum/Blush, Amber/Ink,
   Rose/Linen, and Mono/Graphite, alongside the original 6.
3. **Mode:** Light, Dark, or System (System follows your phone/computer's
   own light/dark setting).
4. **Heading font:** six choices now — Space Grotesk (default), Archivo,
   Fraunces, plus three added later: Sora, Libre Franklin, and DM Serif
   Display.
5. **Body font:** Inter (default) or Manrope — this one's new; before, the
   body text font wasn't changeable at all.
6. **Text size:** S / M / L.
7. **Density:** Compact or Comfortable spacing.
8. **Motion:** Full (every animation, including a fade when you move
   between pages) or Reduced (minimal motion — good for a calmer feel or if
   animation makes you queasy). This is also new — before, there was no way
   to turn animation up or down.
9. Tap **Save** — a small "Saved." confirmation appears, and your choice is
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
9. **Groceries budget banner** (added later, once Money existed): if you've
   set up a Groceries budget in Money, a small banner near the top of the
   Shopping list shows how much of it is left — tap it to jump straight to
   Money. It only shows up once both a Groceries budget exists and you have
   access to Money.

### Tasks

Redesigned later in response to feedback that the original version was cluttered and
confusing — this is the current version.

1. Tap **Tasks**. Type a task, pick which section it belongs in (**Now, Today, This
   Week, This Month,** or **Someday**), and tap **+**. That's it for the fast path.
2. Want to set a due date, category, repeat, or reminder right when you create it
   instead of going back afterward? Tap **More options** just under the add row before
   tapping **+** — it expands in place (no extra screen) with all of that, then
   collapses itself back down once you've added the task.
4. **Tap any task's title** (not its checkbox) to open its details later: category, a
   due date, notes, **Repeat**, and **Remind me** — all in one place instead of
   scattered across the row.
5. **Recurring tasks**: in a task's details (or in **More options** at creation), set
   **Repeat** to Daily, Weekdays, Weekly, Every N days, or Monthly — you'll need a due
   date set first, since that's what tells it when to come back. When you complete a
   repeating task, it checks off like normal and a fresh copy appears automatically at
   its next due date — you never have to re-type a chore you do every week.
6. Turn on **Remind me** (once a due date is set) to get a push notification when it's
   due — works for one-time and repeating tasks alike; a repeating task's reminder
   repeats right along with it. If Google Calendar is connected, a due date also shows
   up there automatically — see "Google Calendar sync" below.
7. Tap the small **+** next to any task to add a subtask underneath it (one level —
   subtasks can't have their own subtasks).
8. Tap a task's empty checkbox to complete it. If it still has unfinished subtasks,
   you'll be asked to confirm first.
9. Every task shows a small category tag under its title now (unless it's Personal,
   the default) — Work tasks live in the same list as everything else instead of a
   separate collapsible section, sorted purely by Now/Today/This Week/etc. Each section
   also shows how many you've finished there today, once you've finished at least one.
10. Tap **Completed** near the bottom to see everything you've finished (and undo one
    if you tapped it by mistake). Your weekly "done" count shows at the top of the page
    and on the Today dashboard.

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

## Phase 3 — Reminders & Calendar

What Phase 3 adds: reminders that actually push a notification to every one of
your devices (phone, both computers) even when the app isn't open, a
connection to your real Google Calendar with one combined view of your day,
and the "plan tomorrow" evening ritual on the Today page. Two one-time setup
steps are needed before reminders and calendar actually work — do those
first, they only take about 10 minutes total.

### One-time setup #1 — turn on push notifications

1. Tap **More → Settings → Calendar & Reminders**.
2. Under "Push notifications," tap **Enable push on this device**.
3. Your browser will ask permission to send notifications — tap **Allow**.
4. Do this on every device you want reminders to reach (your phone, your
   computer, etc.) — each one shows up in a list on that same page, and you
   can remove a device from there later if you stop using it.
5. Tap **Send test notification** to confirm one actually arrives.

### One-time setup #2 — connect Google Calendar

This part needs a few clicks in Google's own site first.

1. Go to **console.cloud.google.com** and sign in with the same Google
   account your calendar is on.
2. Click the project dropdown at the very top of the page → **New Project**
   → name it anything (e.g. "Alan OS") → **Create**.
3. With that new project selected, go to **APIs & Services → Library**,
   search for **Google Calendar API**, click it, then click **Enable**.
4. Go to **APIs & Services → OAuth consent screen**. Choose **External** →
   **Create**. Fill in an app name (e.g. "Alan OS"), and use your own email
   for both "support email" and "developer contact." Click through **Save
   and Continue** on the next couple of screens without changing anything,
   until you reach **Test users** — add your own Google email address there,
   then save.
5. Go to **APIs & Services → Credentials → Create Credentials → OAuth
   client ID**. Application type: **Web application**.
6. Under **Authorized redirect URIs**, click **Add URI** twice and enter
   exactly these two addresses (both, not just one):
   - `https://alan-os-nine.vercel.app/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback`
7. Click **Create**. A box pops up showing a **Client ID** and **Client
   secret** — keep this box open, you need both values next.
8. Go to **vercel.com**, open the **alan-os** project → **Settings →
   Environment Variables**. Add a new variable named `GOOGLE_CLIENT_ID`,
   paste the Client ID from step 7, and tick all three environment boxes
   (Production/Preview/Development). Do the same for a variable named
   `GOOGLE_CLIENT_SECRET` with the Client secret.
9. Back in Alan OS, go to **More → Settings → Calendar & Reminders** and tap
   **Connect Google Calendar**.

### Google Calendar sync

Once connected, this is fully automatic — nothing to turn on per item:

- Any **task with a due date** shows up as its own block on your calendar. Complete or
  delete the task and the block disappears; edit the due date and the block moves.
- Any **routine with a time of day** shows up as a real repeating event on your
  calendar (e.g. daily at 9am), whether or not you also turned on its push reminder.
- Any **standalone reminder** (made from Calendar → Reminders, not tied to a task or
  routine) shows up the same way, repeating if it repeats.
- A task or routine's own push reminder does **not** also add a second, separate
  calendar entry — the task/routine's due date already covers that, so nothing doubles
  up.
- The one on/off switch for all of this lives in **Settings → Calendar & Reminders** —
  turning it off pauses new syncing without disconnecting your account.
- Connecting for the first time also fills in your calendar with anything you already
  had due — you don't lose history from before you connected.

### One-time setup #3 — turn on reminder delivery ✅ done (2026-08-12)

**This is done.** cron-job.org is set up and pinging `/api/cron/reminders`
every 1-5 minutes, confirmed live with a real reminder that fired on its
own with no manual trigger. Left below for reference/in case it ever needs
to be re-created (e.g. a new cron-job.org account).

Reminders won't actually fire on time until this last step is done. The free
hosting plan this app runs on only allows checking for due reminders once a
day on its own — this hooks up a free outside service that checks every
minute instead, which is what makes reminders feel instant.

**This is genuinely the one thing standing between you and working
notifications** — confirmed directly: everything else (your phone's push
subscription, the actual sending code, Google's push service) was tested
by hand and works correctly. There's just nothing automatically checking
for due reminders every minute yet, only once a day, so most reminders sit
unfired until this step is done. It takes about 2 minutes and there's no
way around doing it yourself — it needs your own free account on an
outside site, which isn't something that can be set up on your behalf.

1. Open the project folder on your computer and find the file named
   `.env.local`. Open it in any text editor (Notepad is fine).
2. Find the line that starts with `CRON_SECRET=` and copy everything after
   the `=` sign — that's a password-like string, keep it handy.
3. Go to **cron-job.org** and sign up for a free account (no credit card
   needed).
4. Once logged in, click **Create cronjob**.
5. Title: anything, e.g. "Alan OS reminders".
6. Address/URL: `https://alan-os-nine.vercel.app/api/cron/reminders`
7. Schedule: every 1 minute (or every 5 minutes — either is fine).
8. Find the section for adding a custom request header (may be under
   "Advanced" or "Notification settings" depending on the site's current
   layout). Add one header: name it `Authorization`, and for the value type
   `Bearer ` (with a space) followed by the secret you copied in step 2.
9. Save. Reminders will now actually arrive on time from here on.

### Reminders

1. Tap **More → Calendar → Reminders** tab.
2. Tap **New reminder**, type a title, pick a date/time.
3. Under "Repeat," tap a preset — **Daily, Weekdays, Weekly, Every N days,
   Monthly**, or **Custom** for anything else. Leave it on **One-time** for a
   reminder that only fires once.
4. If you've connected Google Calendar, you can also tick **Also add to
   Google Calendar** — this puts a matching event on your real calendar too,
   as a backup in case a push notification doesn't arrive.
5. When a reminder fires, you'll get a notification with **Done** and
   **Snooze 1h** buttons right on it. Tapping the notification itself
   (instead of a button) opens the app to your reminders list, where the same
   actions exist as ordinary buttons — useful since not every phone supports
   notification action buttons the same way.
6. From the reminders list you can also pause a reminder (the ⏸ icon) without
   deleting it, snooze it for a custom amount (15m/1h/3h/tomorrow 9am), or
   delete it outright.
7. On any task with a due date, tap the **bell icon** next to it to
   automatically create a matching reminder — no need to re-type anything.

### Agenda

1. Tap **More → Calendar → Agenda** tab.
2. Toggle between **Today** and **Week**. Everything shows in one list,
   sorted by time: your real Google Calendar events, your reminders, and any
   task with a due date — each tagged so you can tell them apart at a glance.
3. If Google Calendar is connected, tap **Event** to add something directly
   to your real calendar (title, date/time, how long it runs) without leaving
   the app.
4. **Tap any row to act on it** (added later): tapping a reminder jumps
   straight to the Reminders tab; tapping a task jumps to Tasks. The Agenda
   used to be look-only — now it's a real shortcut to wherever that thing
   actually lives.

### The evening planning ritual

Starting at 8pm, the Today page's focus card switches into planning mode
automatically:

1. Pick up to 3 goals for **tomorrow** — search your open tasks or just type
   something new.
2. Optionally add a one-line reflection on how today went.
3. Tap **Save plan**.

The next day, that card shows your picked goals as today's focus. If you
skip the ritual some evening, it automatically shows your overdue tasks
first, then whatever's in your Now/Today lists — so there's always something
useful there even if you forget to plan ahead. Whatever you wrote as
yesterday's reflection quietly shows up at the bottom of today's card too.

### Today dashboard

The **Calendar & Reminders** card now shows either your next real calendar
event or how many reminders are due today, and tapping it jumps straight to
the Agenda.

---

## Phase 4 — Finance core

What Phase 4 adds: a full Money module for tracking accounts, logging
expenses in under 5 seconds, budgets that tell you what's safe to spend,
savings goals, a debt payoff planner, sending money home to India with the
real exchange rate, and spending reports. Nothing here needs any one-time
setup — it all works the moment you open it.

### Accounts

1. Tap **More → Money → Overview** tab.
2. Tap **New account** — give it a name (e.g. "Scene+ Visa"), pick which
   bank it's at, its type (Chequing/Credit Card/Investment/Cash), its
   currency (CAD or INR), and its current balance.
3. For a credit card, also enter the credit limit — the card's tile then
   shows a color-coded bar (green → amber → red) for how much of the limit
   is used.
4. Every account you add shows up as a tile on the Overview tab with its
   live balance.
5. Got the opening balance wrong, or want to rename it? Tap the **pencil**
   on the account. You can change the name, the bank and the balance. The
   type and the currency stay locked once set — changing those would change
   how everything you've already logged against the account is counted.
6. The **bin** deletes an account. It asks first, and it tells you exactly
   how many transactions will be deleted along with it — deleting an account
   really does take its whole history with it.

> If you have both a Canadian and an Indian account, the app keeps them
> apart rather than adding dollars to rupees. Budgets, reports and the
> **Net** figure are all Canadian dollars; anything in another currency is
> shown next to Net in its own currency.

### Logging an expense in under 5 seconds

1. Tap **Log** at the top of the Money page (works from any tab).
2. Type the amount using the keypad — digits go right to left like a
   calculator (typing "1234" makes $12.34). Toggle between **Expense** and
   **Income** above it.
3. Tap **Next**, pick a category (the icon grid), pick which account it came
   out of, and optionally type a merchant name and a note.
4. If you've bought from that merchant before, its usual category fills in
   automatically — you can still change it.
5. Tap **Save**. The transaction appears instantly and the account balance
   updates right away, before the save even finishes on the server.

### Budgets

1. Tap the **Budgets** tab.
2. Tap **New budget**, pick a category, an amount, and how often it resets —
   **Weekly, Biweekly,** or **Monthly** — plus the date it should reset on
   (e.g. your payday). Short months are handled automatically (a budget
   anchored to the 31st resets on the 28th in February).
3. The big number at the top, **Safe to spend**, is the total of every
   budget's remaining room added together — the one number to glance at
   before making a purchase. If you've gone over on something it goes
   negative and turns red, rather than pretending you're still in the
   clear. It's the same number you see on Today.
4. Each budget shows a progress bar that turns amber past 80% and red once
   you've gone over.

### Savings goals

1. Tap the **Goals** tab → **New goal** — name it, set a target amount, and
   optionally a deadline.
2. Tap **Add** on any goal to log money toward it — the ring around its icon
   fills in as you get closer, and it celebrates once you hit the target.

### Debts

1. Tap the **Debts** tab → **New debt** — name it, its current balance, its
   interest rate, and its minimum monthly payment.
2. Below your debts, a **payoff plan** shows how long you'll take to be
   debt-free and how much interest you'll pay, under two strategies:
   **Avalanche** (attacks the highest interest rate first — saves the most
   money) and **Snowball** (attacks the smallest balance first — clears
   individual debts faster, which some people find more motivating).
3. Type an extra monthly amount you could put toward debt to see how much
   time and interest that would save, under either strategy.

### Deleting things

Every bin icon in Money now asks before it does anything, and tells you what
it's about to cost — the amount of the transaction, the progress you'd lose on
a savings goal, or the number of transactions that would go with an account.
Nothing in Money deletes on a single tap any more.

### Sending money home (remittances)

1. From the Overview tab, tap **+ Send** on the remittance card. (It's greyed
   out until you have a Canadian account to send from.)
2. Pick which account the money left from, type the CAD amount you sent,
   then tap **Use today's rate** to auto-fill the INR amount received (or
   type it yourself if you already know the exact number from your transfer
   receipt).
3. Save — it logs as an expense and the remittance card keeps a running
   total of everything sent and received.

### Reports

1. Tap the **Reports** tab. Use the arrows to move between months (you can't
   go past the current month).
2. The donut chart shows what you spent on this month, biggest category
   first; anything past the top 6 categories folds into "Other" so the chart
   stays readable.
3. Below it, a 6-month bar chart shows your total spending trend, and (for
   the current month) a list of the merchants you've spent the most at.

### Categories

Categories are yours to edit — tap **More → Settings → Money** to add new
ones or remove old ones (13 are already set up for you: Groceries, Takeout,
Entertainment, Rent, Utilities, Transport, Subscriptions, Health/Gym,
Remittance, Work, Vinyl/Music, Misc, and Income: Salary). Removing a
category doesn't touch past transactions — it just stops showing up for
new ones.

### Today dashboard

The **Money** card now shows your real "safe to spend" number and how many
budgets (if any) are over their limit, and tapping it jumps straight to
Money.

---

## Phase 5 — Finance AI

What Phase 5 adds: scanning a photo of a receipt to log it in one shot,
bulk-importing transactions from a bank statement export, and a hook that
automatically checks items off your shopping list when a receipt shows you
actually bought them. One optional one-time setup step unlocks the "AI"
part of this — without it, everything still works, you just type receipt
items in by hand instead of them being read automatically.

### One-time setup — turn on AI reading of receipts (optional)

Skip this for now if you like — receipt scanning and CSV import both work
today with fully manual entry. This step is what upgrades them to
automatic.

1. Go to **aistudio.google.com** and sign in with any Google account.
2. Click **Get API key** (usually top-left) → **Create API key**.
3. You'll be asked to attach a Google Cloud billing account — this needs a
   credit card on file, but Google's free tier covers ordinary use for an
   app like this; to be safe, go to **console.cloud.google.com/billing**,
   open your billing account, and set a budget alert (e.g. $10/month) so
   you'd get an email long before anything ever costs real money.
4. Copy the API key it shows you.
5. Go to **vercel.com**, open the **alan-os** project → **Settings →
   Environment Variables**. Add a new variable named `GEMINI_API_KEY`,
   paste the key in, and tick all three environment boxes
   (Production/Preview/Development).
6. Also open the `.env.local` file in the project folder on your computer
   (Notepad is fine) and paste the same key after `GEMINI_API_KEY=` there,
   so it works when testing locally too.
7. Redeploy isn't needed for this one — the next receipt you scan or CSV
   you import will automatically start using it.

### Scanning a receipt

1. Tap **More → Money → Overview** tab. Under "Receipts," tap **Scan
   receipt**.
2. Pick a photo or take one with your camera. Your phone takes very large
   photos, so the app shrinks it first — that happens by itself and takes
   about a second. If something goes wrong it now tells you instead of
   spinning forever.
3. If the AI key is set up, it reads the merchant, date, and each item off
   the receipt for you within a few seconds — a review screen opens
   automatically. If it's not set up (or couldn't read something), the same
   review screen opens with blank fields ready for you to type in by hand.
4. On the review screen: **your photo is right there at the top** — tap it
   to make it bigger so you can read the prices off it. Fix the
   merchant/date if needed, edit or add line items (name, price, category
   for each), and pick which account it came out of.
5. Choose **Save as one transaction** (the whole receipt logs as a single
   expense) or **Split by category** (creates one transaction per category
   the items span — e.g. groceries and a magazine on the same receipt each
   post to their own budget).
6. Tap **Approve**. Any item that matches something still on your shopping
   list gets automatically checked off there too — no need to do it twice.
7. Not a real receipt, or want to throw it out? Tap **Discard** instead.

### Importing transactions from a CSV file

1. Tap **More → Money → Overview** and tap **Import from your bank** (or go
   the long way: **More → Settings → Money**). Scroll to **Import from CSV**
   → **Choose file** → pick your bank's exported .csv file.
2. Confirm which columns are which — the app guesses based on the column
   headers, but double-check them. If your bank uses separate "Debit" and
   "Credit" columns instead of one signed amount column, tick that box and
   pick both.
3. Pick which account these transactions belong to, then tap **Continue**.
4. You'll see every row with a suggested category already filled in
   (learned from your past spending, and from AI if the key above is set
   up) — change any that are wrong. Rows that look like something you
   already logged are unchecked automatically (labeled "possible
   duplicate") so you don't end up with it twice — recheck one yourself if
   it's actually new.
5. Tap **Import N transactions**. Done — they show up in Money right away.

### Today dashboard / Shopping

No new dashboard card for this phase — receipts show up as regular
transactions, and the shopping cross-check quietly keeps your list in sync
in the background whenever you approve a receipt.

---

## Admin — Users & Crews

This isn't one of the numbered phases above — you asked for it directly: a way to
control exactly what each person you invite can see and use, and to manage real
"crews" for the Workout module instead of everyone being lumped into one shared feed
forever.

### Managing users and crews

1. Tap **More → Settings**. Since you're the owner, you'll see a new **Admin** section
   at the bottom with a **Users & Crews** link — this section only ever appears for you,
   never for anyone else, no matter what you toggle for them.
2. At the top, your **invite code** is there to copy and send to someone new (same as
   before) — anyone who signs up with it lands as a "Friend" who can only open Workout,
   in your default crew, until you change that.
3. Under **Crews**, create as many separate friend-groups as you want (e.g. "Gym
   Buddies", "Family"). Members of different crews don't see each other's workouts at
   all — only you can see everyone's, regardless of which crew you're managing.
4. Under **Users**, tap anyone's name to expand their card. From there you can:
   - Move them into a different crew (or take them out of one entirely).
   - Tick or untick exactly which parts of the app they're allowed to open — Tasks,
     Shopping, Workout, Calendar, Money, Journal, Vinyl — one by one. Unticking
     something takes effect immediately; if they're using the app right now and you
     turn off, say, Money, they'll be sent back to the Today page the next time they
     try to open it or tap anything inside it.
   - See their workout activity — current streak, how many workouts logged in total,
     and their most recent personal records — without needing to be in their crew
     yourself.

### What this changed for existing accounts

Nothing changed for anyone by itself. Your account and your 3 existing friends were all
placed into one crew ("The Crew") automatically, so their shared workout feed looks
exactly the same as before — the new controls just exist now for you to use whenever
you want to split people up or restrict what they can open.

**Resolved**: the second account that had full owner-level access
(`antonyalbert03@gmail.com`, "Albert") has been demoted per your instruction — he keeps
full access to every module exactly as before, he's just no longer an admin. You
(`antonyalan99@gmail.com`) are the only account with admin rights now.

### Settings on a bigger screen

On a phone, Settings looks exactly as described above. On a wider screen (a laptop or
desktop browser), Settings now shows a permanent list of sections down the left side,
with whichever section you're looking at on the right — no need to keep going back to
the Settings home screen between changes. The Settings home screen itself now also
shows a small card up top with your name, email, and a badge confirming whether you're
the admin — a quick way to confirm which account you're using, now that more than one
real account exists.

---

## Routines, and how Tasks/Calendar/Reminders fit together now

If Tasks and Calendar used to feel like two separate, confusing things, here's the
simple way to think about it now — there are really only **three kinds of things**:

1. **A Task** — something to do once. Check it off, it's gone (or, if it repeats,
   the next one appears automatically).
2. **A Routine** (new) — something you do on a schedule and want to build a habit
   around, like watering plants every few days or a morning checklist. Routines don't
   get "completed" forever — they show up again next time they're due, and you build a
   streak by keeping up with them.
3. **A Calendar Event** — something on your actual Google Calendar, at a specific time.

**"Reminder" isn't a separate thing to create anymore.** It's just a bell you can turn
on for any Task or Routine, right where you're already creating or editing it. You'll
never see a bare "add a reminder" button anywhere — you always start from the Task or
Routine itself.

### Using Routines

1. Open **Tasks**. At the top, above your regular task list, you'll see a **Your
   Routines** section — collapsed into a small row of icons by default so it doesn't
   crowd out your actual tasks. Tap the **Your Routines** heading to expand it into the
   full set of cards, and tap again to collapse it back down. Tapping an icon in the
   collapsed row still marks it done (or opens its checklist) without expanding.
2. Tap **+ Add routine** to create one: give it a name, pick an icon, choose how often
   it repeats (daily, weekdays, weekly on certain days, every N days, or monthly), and
   optionally a rough time of day. If you want a reminder, set a time and flip the
   switch.
3. If it's a multi-step routine (like "Morning Routine: make bed, stretch, review
   today"), turn on **Checklist** and add each step — tapping it opens a small
   checklist instead of marking it done in one tap.
4. Each routine shows a little flame with a number next to it — that's your current
   streak (same idea as the Workout streak). Missing a single day here and there won't
   reset it, but missing two days in the same week will.
5. To change anything about a routine later — its name, icon, category, time, repeat
   schedule, checklist steps, or reminder — expand the section and tap the small pencil
   icon on its card. That opens the same screen you used to create it, already filled
   in.
6. Done with a routine for good? Open it with the pencil icon and tap **Archive** — its
   streak history goes with it.

### The "you keep adding this" nudge

If you've typed the same task in 3 or more times over the last month and a half, Tasks
will show a small banner offering to turn it into a Routine for you, one tap. This is
just counting how often you've added something — not AI, just it noticing a pattern
you've already shown it.

### Today's dashboard, simplified

The Today page used to have a separate Tasks card, a separate Calendar card, and a
separate "plan tomorrow" card — all showing overlapping information in different ways.
Now there's **one card** that shows, top to bottom: the single most important thing to
do right now, your routines due today (tap to check off), your tasks due or overdue
today, your next calendar event, and (after 8pm) the evening planning ritual for
tomorrow exactly as before. If you picked 3 goals for today last night, you'll now see
how many of them actually got done, instead of that just disappearing.
---

## The redesign — everything looks different now

The whole app was redesigned in one go. Nothing moved, nothing was removed, and
none of your information changed — but almost every screen looks different, so
this section walks you through what's new. If you're looking for how a feature
*works*, all the sections above are still correct.

### What changed, in one paragraph

The old app was made of soft rounded cards floating on a background. The new one
is built like an instrument panel: everything is square, framed with a thick
black line, and the important number on any screen is now the biggest thing on
it. Nothing floats. Nothing is decorative. If something looks loud, it's because
it needs your attention.

### The four things you'll notice first

1. **Corners are square.** Every card, button, box and input. This is the single
   biggest visual change and it's deliberate.
2. **Big headings.** Every screen opens with its name in large heavy capitals —
   TODAY, TASKS, MONEY — so you always know where you are at a glance.
3. **Small capital labels everywhere.** Little grey uppercase text marks every
   count, date, unit and category. That's the app labelling itself, the way a
   dashboard in a car does.
4. **Black blocks mean "this one matters".** Wherever you see white text on a
   solid black block, that's the app pointing at the single most important thing
   on that screen — the next thing to do, the amount you're logging, your running
   total. There's only ever one per screen.

### The Today page is completely rebuilt

It now reads straight down, and each section answers one question:

- **NOW** — a black block at the top with the one single next thing you should
  do. If something's overdue, that's what it shows. There's a button right on it,
  so you can tick a routine off or jump to the thing without scrolling.
- **The four numbers** — due today, safe to spend, workout streak, shopping
  items. **Tap any number to go straight to that part of the app.** That's true
  everywhere now: if the app shows you a figure, tapping it takes you to where
  that figure came from.
- **The day** — all your routines, tasks and your next calendar appointment
  merged into one list in time order, with the time down the left. A bar under
  the heading fills up as you get through it. Anything whose time has passed and
  isn't done yet turns amber.
- **Today's focus** — the three goals you picked last night, or after 8pm, the
  form to pick tomorrow's.
- **Jump to** — a plain list of everywhere else in the app.

**The four "coming soon" boxes are gone** (AI briefing, weather, world news,
local news). They took up half the screen advertising things that don't exist
yet. They're now one small grey line at the bottom, and they'll come back as real
features when they're built.

### The new "+" button

There's a square **+** button floating at the bottom-right of every screen. Tap
it and you get a short list: Task, Expense, Shopping item, Reminder, Workout.
Pick one and it takes you straight into that form **with the cursor already in
the box**, ready to type.

This is not the old "+" button that was removed for doing nothing. This one
genuinely works — it's a shortcut into forms that already existed, so it needed
no new machinery.

### Eight themes instead of eleven

Settings → Appearance now offers eight colour themes, all rebuilt to suit the new
look. Each one shows you a **tiny picture of the actual app** in that theme, so
you can see how it'll feel rather than guessing from two colour bars:

| Theme | What it's like |
|---|---|
| **Ink** | Paper, black, one signal red. The default and the most serious. |
| **Blueprint** | Deep navy and drafting blue, like a technical drawing. |
| **Primary** | The true Bauhaus red, blue and yellow. The bold one. |
| **Concrete** | Warm greys and ochre. Same rigour, softer voice. |
| **Signal** | High-visibility orange on stark white. Industrial. |
| **Verdigris** | Deep green and copper on cool paper. |
| **Oxblood** | Bone paper, deep red, brass. Quietly formal. |
| **Monolith** | Pure black and white. Nothing to hide behind. |

Every one has a proper dark version — switch with **Light / Dark / Auto** at the
top of the same page.

**Your old theme wasn't lost, it was translated.** Whatever you had before is
automatically matched to the closest new one (British Racing Green becomes
Verdigris, Navy/Cream becomes Blueprint, and so on). You don't have to do
anything, but it's worth going in and trying the others — they look genuinely
different now.

There's also a new heading font, **Outfit**, and the default is now **Archivo**.
Each font option is shown in its own typeface so you can pick by looking.

### Small things that got better

- **Buttons are bigger** — the standard button went from 32 to 40 pixels tall,
  which matters a lot on a phone.
- **Buttons press down.** Tap one and it physically shifts into its own shadow.
- **Every settings page has a back arrow** now. Installed as an app on your home
  screen, there was no browser back button to use.
- **The Money page keeps your key numbers on screen** — safe to spend, spent, and
  net — whichever tab you're on.
- **The expense keypad has bigger keys** and shows the amount as a black block at
  the top that stays visible while you pick a category.
- **On a computer**, the left sidebar now lists Calendar, Journal, Vinyl and
  Settings directly instead of hiding them behind "More".

### If something looks wrong

This was a big change and it wasn't possible to test every screen by hand in a
browser during the build. If a screen looks broken, cramped, unreadable, or just
wrong — say which screen and what looks off. Nothing about your data, money,
reminders or accounts was touched, so anything wrong is cosmetic and quick to
fix.

---

---

## Things that repeat — rent, salary, subscriptions

Anything that comes out (or goes in) on a schedule can log itself, so you never
type it again.

1. Tap **More → Money → Overview** and find the **Repeating** panel. Tap the
   **+**.
2. Choose **Goes out** or **Comes in**, name it ("Rent", "Salary"), put in the
   amount, and pick how often: every week, every 2 weeks, every month, or every
   year.
3. Pick the category and the account, then set **Next one due** — the next date
   it should happen, not the first time it ever happened.
4. Optionally add who it's paid to, and a **Stop after** date if it's something
   with an end (a 12-month loan, say).
5. Tap **Set it up**. That's it.

### How it actually posts

The next time you open the app after one comes due, it logs itself — dated to
the day it was due, not the day you happened to look. If you don't open the app
for three weeks, all three weeks' worth appear at once, each on its own correct
date. Your balance and your budgets update with them.

Short months are handled properly: rent set to the 31st comes out on the 28th
in February and goes back to the 31st in March. It doesn't drift.

### Pausing and stopping

- The **pause** button stops it posting without deleting it — useful for a
  subscription you've frozen. Tap **play** to start it again.
- The **bin** stops it for good. Everything it has already logged stays exactly
  where it is — that money really did leave your account.

---

## The Assistant

Tap **More → Assistant** (or the Assistant row at the bottom of Today).

It's a box you can type anything into. It can look at anything you can see in
the app and answer from the real numbers — and it can do a few small things for
you.

### Things worth asking it

- "What did I spend on groceries this month?"
- "How does this month compare to last month?"
- "Write me a summary of last month's money"
- "What's overdue?"
- "How much have I trained in the last month?"
- "Add a task to renew my passport on the 3rd"
- "Add milk and eggs to the shopping list"
- "I spent $14 at Tim Hortons"

### What it will and won't do

It **can** add a task, tick one off, log an expense, and add things to the
shopping list — the small, easily-undone things.

It **can't** delete anything, move money between accounts, or change your
budgets, goals, debts or repeating payments. Those stay on the screens built for
them, on purpose: they're decisions, not chores.

It only sees what your account can see. If someone else's account doesn't have
Money turned on, their assistant can't talk about money at all — not because
it's told not to, but because it isn't given the ability.

### It needs the key

The assistant can't answer anything until the free Google AI key is added (the
same one receipt-scanning needs — see the Phase 5 section above). Everything
else in the app works without it.

---

## What the AI costs

Short answer: **about $1 to $3 US a month**, and there's a hard ceiling of $5
that nothing can spend past. On Google's free tier it's **$0**.

### Where that comes from

Every question you ask the assistant costs roughly **a quarter of a cent**.
Reading a receipt costs about **a fifth of a cent**. Sorting a whole bank
statement import costs less than a tenth of a cent.

So:

| What you do | How often | Cost per month |
|---|---|---|
| Ask the assistant 10 times a day | 300 questions | about $0.71 |
| Ask it 30 times a day | 900 questions | about $2.13 |
| Scan 30 receipts | 30 | about $0.06 |
| Import your bank statement weekly | 4 | under $0.01 |

Even asking it thirty times a day, every day, you're at roughly the price of a
coffee for the whole month.

### The safety net

Tap **More → Settings → AI & cost**. It shows exactly what's been spent this
month, broken down by what spent it, against the $5 ceiling. If the ceiling is
ever reached, the AI features simply stop and everything else in the app keeps
working normally until the 1st. It's not possible for a bug to run up a bill.

### Free or paid — your call

Google's free tier allows far more than you'd ever use here (over a thousand
requests a day), so realistically you'd pay nothing. The one thing to know: on
the free tier Google may use what you send to improve their products. On the
paid one they don't.

For a personal finance app that's worth thinking about for a second. If you'd
rather it stay private, turning on billing costs you the $1-3 above and nothing
more.

---

---

## Does receipt scanning need AI? (short answer: no)

This comes up a lot, so here it is plainly.

**The receipt feature works completely without AI.** Take or pick a photo, it
uploads and is stored, a review screen opens showing the photo, you fill in the
merchant, date and each item, tap Approve, and it becomes a real transaction —
and anything on it that's still on your shopping list gets ticked off there
automatically. None of that touches AI.

**What AI adds is only the typing.** With the key set up, the app reads the
photo first and the review screen opens with the merchant, date and every line
item already filled in. You check it and tap Approve.

So the difference is:

| | Without the AI key | With it |
|---|---|---|
| Take/choose a photo | ✅ | ✅ |
| Photo saved and shown to you | ✅ | ✅ |
| Review screen | ✅ (blank, you type) | ✅ (pre-filled, you check) |
| Becomes a transaction | ✅ | ✅ |
| Ticks off your shopping list | ✅ | ✅ |

Same for importing a bank CSV: it works fully without AI — the app guesses
categories from merchants you've used before. AI just improves the guesses on
merchants it's never seen.

The one thing that genuinely doesn't work without the key is the **Assistant**,
because there's nothing for it to think with.

---

## Checking your accounts against your bank (month-end)

This is the one that keeps your numbers honest. Do it once a month, when your
statement arrives.

### Why bother

Every balance in the app is built by adding up what you've logged. That's only
right for as long as you log everything — and nobody does. One forgotten $4
coffee and the app is quietly $4 wrong forever, and so is your safe-to-spend,
your net worth and every report. This is the check that catches it.

### Doing it

1. Tap **Money → Overview → Check against your bank**.
2. Pick the account, the **closing date** on your statement, and the **closing
   balance** it shows.
3. **Optional but worth it:** download that same statement as a CSV from your
   bank and choose the file. Confirm which column is the date, which is the
   description and which is the amount (the app guesses first), then tap
   **Read it**.
4. Tap **Compare**.

### What you'll see

Three numbers across the top: what the **bank says**, what the **app says**, and
the **difference**. If the difference is zero, you're done — tap finish.

If it isn't zero, and you gave it the statement file, the app shows you exactly
what's wrong:

- **"On the statement, not in the app"** — things you forgot to log. Pick a
  category for each and tap **Add it**. Watch the difference shrink as you go.
  This is usually the whole story.
- **Your transactions**, with everything the statement confirms already ticked.
  Anything left unticked and highlighted didn't appear on your statement —
  normal if it happened in the last day or two, worth a look if it's older
  (you might have logged it twice, or it never actually went through).

### Closing the gap

Once you've added what was missing, if there's still a difference, tap
**Correct by $X and finish**. That adds one transaction called "Balance
adjustment" so the app matches your bank exactly.

It's a real transaction, not a hidden fudge — it shows up in your list like
anything else. That's deliberate: if you keep needing a $30 correction every
month, you can *see* that something regular isn't being logged. A silently
edited balance would hide it.

### Afterwards

Everything you ticked is marked as confirmed and won't come up again next
month, so each check only ever asks about new activity. Previous checks are
listed at the bottom of the screen — a run of "Matched" is a good feeling, and
a run of "Off by $40" is telling you something.

### A note on part-months

If you reconcile on the 25th against a statement that closed on the 20th, the
app ignores everything after the 20th — it belongs to next month's statement.
It'll tell you how many transactions it set aside.

---

---

## Workout — rebuilt around you

The Workout screen used to open on what everyone else had been doing, with your
own training tucked behind a filter. It's the other way round now.

### The "You" tab (what you land on)

Top to bottom:

- **Session in progress** — only appears if you walked away mid-workout. Tap
  **Continue** to pick up exactly where you were, or **Discard** to bin it (it
  asks first, and tells you how many sets you'd lose).
- **This week** — seven boxes, Monday to Sunday. A filled box is a day you
  trained; runs are marked differently from lifting, so a week of running and a
  week of weights don't look the same. It's a record, not a target — the app
  isn't going to nag you about a number you never set.
- **Next up** — the app's suggestion, based on whatever you've left longest.
  *"Legs — 9 days since you trained this."* Tap **Start** and it opens the
  exercise list with legs already at the top. Underneath it: **Repeat last
  session**, any **templates** you've saved, and **Start from scratch**.
- **Recent** — your last eight sessions.
- **Records** — your best ever on each lift. Tap any one to see its full story.
- **Crew** — one row, tapping through to the other tab.

### The "Crew" tab

Everything that used to be the front page is here, unchanged: what everyone's
logged, reactions, the confetti when someone hits a personal best, and the
leaderboard. Just two buttons now (Feed and Leaderboard) instead of four.

### Exercise pages — new

Tap any record, and you get that one exercise's whole history:

- Your heaviest ever, your best estimated one-rep max, how many times you've
  done it, and when you last did.
- **A chart** showing whether it's actually going up. Switch between heaviest
  set, estimated one-rep max, and total volume.
- Every session you've ever logged it in, with a trophy on the ones that set a
  record.

This is the thing the app genuinely couldn't do before — you could see the last
four times you'd benched while you were benching, and nothing else, ever.

### Your session can't disappear any more

**This is the important one.** Before, if your phone locked mid-workout, or you
flipped to your music app and back, or your browser quietly dropped the page —
everything you'd logged that session was gone. No warning, nothing to recover.

Now it saves itself as you go. Close the app, come back tomorrow, and the
Workout screen offers to continue exactly where you stopped, with every set
still there. When you finish a session it clears itself, so it'll never offer
you a workout you've already saved.

You don't have to do anything for this — there's no save button. The header says
"Saved as you go" while you're logging.

### One number was wrong

Your streak counts consecutive **days** you trained, and always has — but the
screen was labelling it "wk". A 5-day streak was showing as "5 wk". It now says
days, which is what it always meant.

---

---

## Timeline — everything you did, in one line

**More → Timeline** (or the Timeline row at the bottom of Today).

Until now the app has been six separate sections that couldn't see each other.
This is the first screen that reads them all together: what you spent, what you
trained, what you ticked off, what you bought, all on one line in the order it
happened.

- **A day / A week** — switch between one day at a time and the last seven.
- **The arrows** move you back and forward through your history.
- **Four numbers at the top**: spent, money in, days trained, tasks done — each
  one taps through to the module behind it.
- **Every row taps through** to whatever produced it. A shopping trip goes to
  your list, a workout to Workout, an expense to Money.

Shopping is grouped into trips rather than listed item by item, so a fifteen-item
shop is one line and doesn't bury your workout.

### What the week showed

Once a week, the app looks at everything above together and tells you one or two
things you probably haven't noticed — the kind of thing that needs two sections
at once to see. *"Your takeaway spend doubles in the weeks you train less than
twice."*

It's honest rather than encouraging. If the week was unremarkable it says so
rather than manufacturing something.

Sometimes it'll offer **one button** — "add milk to the list", say. Nothing
happens until you tap it. That's a deliberate limit: the app notices and
suggests, it doesn't act on its own. You can change that under **Settings → AI &
cost** once that screen lands.

This costs about **2 to 3 cents a month** — one look per week, and it's stored,
so opening the Timeline ten times doesn't cost ten times. (It needs the Gemini
key, like everything else AI.)

---

## Journal and Vinyl are gone

You asked for them removed, so they are — no more empty pages advertising things
that don't exist. Nothing else was affected.

The (empty) database tables were left in place rather than deleted, in case you
ever want them back. If you're sure you never will, say so and I'll drop them.

---

## Two things that used to be fixed, and no longer are

Groundwork for the Settings screens coming next — the values behave exactly as
they did, but they're now things that *can* be changed rather than numbers baked
into the code:

- **How long before a staple comes back.** It was 14 days for everything — milk
  and washing-up liquid on the same timer. The app now also records every
  purchase, so once you've bought something a few times it can work out your own
  rate instead of guessing.
- **Your timezone.** The app assumed Winnipeg everywhere. It'll follow your
  profile now, which matters when you travel. One rule worth knowing: your
  repeating reminders stay anchored to where you *live*, not where you are — so
  flying to India won't drag every reminder five and a half hours.

---

## Settings — everything you can now change

Settings used to be four screens. It's thirteen. **More → Settings.**

Nothing has a Save button — every switch and dropdown takes effect the moment
you touch it.

### Account

Your name, a **profile photo** (new — the app has never had a way to set one,
which is why your crew has only ever seen your initial), your email, your
timezone and which day your week starts on.

**Timezone matters if you travel.** Your repeating reminders stay anchored to
where you say you live, not where your phone is — so a trip to India won't drag
every reminder five and a half hours. Change it here when you actually move.

### Notifications

- **Quiet hours** — nothing is sent between the hours you set (10pm to 7am by
  default). Anything that came due during the quiet window arrives once it's
  over. It isn't lost.
- **A switch per type** — task nudges, routine reminders, crew personal bests,
  bills about to land, and the weekly pattern. Turn off what you don't want.
- **Your devices** — every phone, tablet or browser you've allowed notifications
  on gets a copy of everything. This is the first time you can see that list and
  remove an old one.

### Today

Choose which panels appear on your Today screen and put them in the order you
want, with the up/down arrows. Hide anything you never look at. There's a new
one available too: **Today so far**, a short version of the Timeline showing
what's already happened today.

### Plan

- **Working hours** — the app folds work tasks away outside these. It was fixed
  at 8am–6pm, weekdays.
- **When evening planning starts** — Today swaps from "what's on now" to "plan
  tomorrow" after this. Was fixed at 8pm.
- **What new tasks default to** for their reminder, and which of the three Plan
  views opens first.

### Money

Your default account for quick logging, your payday (so new budgets anchor
correctly), whether repeating payments post themselves or wait to be added by
hand, and a monthly nudge to check your accounts against the bank.

### Shopping

- **Learn each item's own rate** — instead of bringing every staple back after
  the same 14 days, work out how often you actually buy each thing from your
  history. Needs three purchases before it kicks in; until then it uses the
  fallback below.
- **The fallback**, for anything it hasn't seen you buy enough times.
- Whether receipts tick things off your list, and how the list sorts.

### AI & cost

- **Your monthly spending limit** — was fixed at $5, now anything from $1 to $50.
  It's a hard stop, not a target.
- **How bold it can be** — just tell me / offer a button / do small things. It
  can never delete anything or move money whatever you pick.
- **A switch per feature** — receipts, bank imports, the assistant, weekly
  patterns. Turn one off and that part goes back to fully manual. It still
  works; you just do the typing.

### Data — new

- **Download everything** you've ever logged as a single file. Money, training,
  tasks, shopping, the lot. You've never been able to get your data out of this
  app before, which is worth fixing for something holding your bank balances.
- **Clear one section** and start it over, leaving everything else alone. It
  makes you type "clear" first, because this is not something to do by accident.
  Take the download first.
