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

*(Phase 1 section will be added here once its checklist is complete.)*
