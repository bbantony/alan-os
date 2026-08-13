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
   Week, This Month,** or **Someday**), and tap **+**. That's it for the fast path —
   everything else below is optional and lives one tap away, not crammed into the
   quick-add row.
2. **Tap any task's title** (not its checkbox) to open its details: category, a due
   date, notes, **Repeat**, and **Remind me** — all in one place instead of scattered
   across the row.
3. **Recurring tasks** (new): in a task's details, set **Repeat** to Daily, Weekdays,
   Weekly, Every N days, or Monthly — you'll need a due date set first, since that's
   what tells it when to come back. When you complete a repeating task, it checks off
   like normal and a fresh copy appears automatically at its next due date — you never
   have to re-type a chore you do every week.
4. Turn on **Remind me** in the same details screen (once a due date is set) to get a
   push notification when it's due — works for one-time and repeating tasks alike; a
   repeating task's reminder repeats right along with it.
5. Tap the small **+** next to any task to add a subtask underneath it (one level —
   subtasks can't have their own subtasks).
6. Tap a task's empty checkbox to complete it. If it still has unfinished subtasks,
   you'll be asked to confirm first.
7. Every task shows a small category tag under its title now (unless it's Personal,
   the default) — Work tasks live in the same list as everything else instead of a
   separate collapsible section, sorted purely by Now/Today/This Week/etc.
8. Tap **Completed** near the bottom to see everything you've finished (and undo one
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
   before making a purchase.
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

### Sending money home (remittances)

1. From the Overview tab, tap **+ Send** on the remittance card.
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
2. Pick a photo or take one with your camera. It uploads right away.
3. If the AI key is set up, it reads the merchant, date, and each item off
   the receipt for you within a few seconds — a review screen opens
   automatically. If it's not set up (or couldn't read something), the same
   review screen opens with blank fields ready for you to type in by hand.
4. On the review screen: fix the merchant/date if needed, edit or add line
   items (name, price, category for each), and pick which account it came
   out of.
5. Choose **Save as one transaction** (the whole receipt logs as a single
   expense) or **Split by category** (creates one transaction per category
   the items span — e.g. groceries and a magazine on the same receipt each
   post to their own budget).
6. Tap **Approve**. Any item that matches something still on your shopping
   list gets automatically checked off there too — no need to do it twice.
7. Not a real receipt, or want to throw it out? Tap **Discard** instead.

### Importing transactions from a CSV file

1. Tap **More → Settings → Money**. Scroll to **Import from CSV** → **Choose
   file** → pick your bank's exported .csv file.
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
   Routines** section.
2. Tap **+ Add routine** to create one: give it a name, pick an icon, choose how often
   it repeats (daily, weekdays, weekly on certain days, every N days, or monthly), and
   optionally a rough time of day. If you want a reminder, set a time and flip the
   switch.
3. If it's a multi-step routine (like "Morning Routine: make bed, stretch, review
   today"), turn on **Checklist** and add each step — tapping the card opens a small
   checklist instead of marking it done in one tap.
4. Each routine shows a little flame with a number next to it — that's your current
   streak (same idea as the Workout streak). Missing a single day here and there won't
   reset it, but missing two days in the same week will.
5. To change anything about a routine later — its name, icon, category, time, repeat
   schedule, checklist steps, or reminder — tap the small pencil icon on its card. That
   opens the same screen you used to create it, already filled in. Tapping the card
   itself still just marks it done (or opens its checklist).
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

*(Phase 6 section will be added here once its checklist is complete.)*
