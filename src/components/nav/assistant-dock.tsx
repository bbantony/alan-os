"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Maximize2, Sparkles } from "lucide-react";

import { AssistantChat } from "@/app/(app)/assistant/assistant-chat";
import { getCaptureData, type CaptureAssistantData } from "@/app/(app)/capture-actions";
import { useWideScreen } from "@/lib/use-wide-screen";
import type { ModuleAccess } from "@/lib/permissions";
import type { UsageSummary } from "@/lib/ai/usage";

/**
 * THE ASSISTANT, PERMANENTLY BESIDE THE PAGE.
 *
 * On a wide screen — in practice the Galaxy Z Fold's unfolded inner display —
 * the app is the screen you are on down the left and the assistant docked down
 * the right. Alan's stated reason for wanting this app at all is "talk to the
 * AI in one place and have it do things", and a chat you have to open is a chat
 * you forget you have. Folded, or on any phone, this renders NOTHING and the
 * app is exactly as it was: the capture sheet's chat, one tap away.
 *
 * ---------------------------------------------------------------------------
 * IT IS NOT A SECOND CHAT. Read the header of assistant-chat.tsx first.
 * ---------------------------------------------------------------------------
 *
 * There may only ever be ONE AssistantChat mounted in the tab. Two gave two
 * composers, two microphones, two copies of one conversation, and dictation
 * typing into a box hidden behind a dialog. The three candidates are the
 * /assistant page, the capture sheet, and this. They are kept apart by
 * `useAssistantDockLive` below, which both this file and quick-add.tsx call:
 *
 *   - This dock is not rendered on /assistant, because that page IS the chat.
 *   - The capture sheet leaves ITS chat out whenever this returns true, and
 *     keeps its four forms — the same arrangement it has always had on
 *     /assistant, where the real chat is on the screen behind the sheet. Here
 *     the real chat is beside it instead.
 *
 * CONDITIONALLY RENDERED, NEVER CSS-HIDDEN. `hidden md:flex` would leave the
 * dock's chat mounted on a phone: a live textarea and a live dictation session
 * inside a box nobody can see, which is the exact bug the one-chat rule was
 * written for. The width test is therefore a real JavaScript one — see
 * lib/use-wide-screen.ts, which owns the single breakpoint number.
 *
 * NAVIGATION DOES NOT REMOUNT IT; THE HINGE DOES. This is rendered by the app
 * shell, which App Router keeps mounted across client-side navigations (the
 * capture sheet has relied on that since it started caching its forms' data),
 * so moving between screens costs nothing and refetches nothing. It IS
 * remounted, and there are three ways, not two:
 *
 *   - a full page load;
 *   - the /assistant round trip, the one route that unmounts it on purpose;
 *   - the wide test flipping — folding and unfolding the phone, or rotating
 *     it. That is not an edge case, it is the entire design, and it is the one
 *     that happens with a half-typed question in the box.
 *
 * Which is why nothing this component knows is allowed to die with it. What it
 * fetches lives in module scope below, so a remount is free; the question in
 * the air, the queue and which chat you are in live in assistant-chat.tsx's own
 * shared store, so unfolding mid-answer loses nothing.
 */

/**
 * Is the dock the live chat right now? The ONE answer to that question, called
 * from here and from quick-add.tsx so the two can never disagree about which
 * chat is alive.
 *
 * The assistant has no module of its own — it rides on `tasks`, exactly as
 * ROUTE_MODULE_ALIASES gates /assistant, as quick-add gates its box, and as
 * capture-actions gates the data. One rule, four places that obey it.
 */
export function useAssistantDockLive(moduleAccess: ModuleAccess): boolean {
  const wide = useWideScreen();
  const pathname = usePathname();
  // The same route test the capture sheet already uses, deliberately identical.
  const onAssistant = pathname === "/assistant" || pathname.startsWith("/assistant/");
  return wide && !onAssistant && moduleAccess.tasks;
}

/**
 * Whether an AI key exists, the month's spend, and the account's timezone —
 * remembered for the life of the tab.
 *
 * None of it is needed for the box to be typeable, so it is fetched after the
 * dock is on screen rather than blocking it, and kept here rather than in
 * component state so a trip to /assistant and back does not pay for it twice.
 * Module scope is safe for the same reason the chat's own shared store is:
 * there is only ever one of these alive.
 */
let cachedAssistantData: CaptureAssistantData | null = null;

/**
 * The newest AI spend figure a reply has come back with.
 *
 * THE SAME BUG THE CAPTURE SHEET ALREADY HAD, arriving by a different door.
 * `cachedAssistantData` above is fetched once and never updated, and the chat
 * re-seeds its cost line from whatever `initialUsage` it is handed on mount —
 * so with only that cache, "AI this month:" would read the figure from when
 * the tab was opened, however many questions ago. quick-add.tsx (see its
 * `latestUsage`) hit this because the sheet closes; the dock hits it because
 * of the "open full screen" link in its own header, which goes to the one
 * route that unmounts the dock. Tap it, come back, and the caption is stale.
 * The number is spend Alan is asked to trust, so under-reporting it is not a
 * cosmetic defect.
 *
 * The shape differs from the sheet's in one way, and only one: the sheet keeps
 * this in component state because the component holding it (the sheet) outlives
 * the chat, whereas the dock and its chat unmount together. So the surviving
 * copy has to be out here in module scope, and the state below is seeded from
 * it. Safe in module scope for the same reason the chat's own shared store is:
 * there is only ever one chat, and therefore only ever one dock.
 *
 * WHAT THIS DOES NOT CLOSE, so nobody reads the above as more than it is:
 * questions asked on the FULL-SCREEN /assistant page do not come back here.
 * That page passes no `onUsage`, so ask in the dock, open full screen, ask
 * three more, come back — and this caption shows the figure from before the
 * page. The capture sheet has had the identical blind spot since it shipped.
 * It is a display lag and nothing else: `ai_usage` is written server-side by
 * `recordUsage` either way, the monthly ceiling is enforced from the database,
 * and the chat's own cost line under the composer on that page IS live. (Its
 * masthead is not: that figure is server-rendered once at page load and
 * nothing refreshes it — the same snapshot this caption is, by a different
 * route. Said precisely because the first draft of this paragraph claimed the
 * page header was correct, and it is not.) Closing it properly
 * means /assistant reporting its usage upward too, which is a change to that
 * page rather than to this file.
 */
let cachedLatestUsage: UsageSummary | null = null;

export function AssistantDock({ moduleAccess }: { moduleAccess: ModuleAccess }) {
  const live = useAssistantDockLive(moduleAccess);
  // Nothing rendered, nothing mounted — see the note above about why this is a
  // real return and not a `hidden` class.
  if (!live) return null;
  return <DockColumn moduleAccess={moduleAccess} />;
}

function DockColumn({ moduleAccess }: { moduleAccess: ModuleAccess }) {
  const router = useRouter();
  const [assistant, setAssistant] = useState<CaptureAssistantData | null>(cachedAssistantData);
  /**
   * STATE, not a ref — the same call quick-add.tsx makes and for the same
   * reason: this value is RENDERED (it seeds the chat's cost line), and a ref
   * changing does not re-render, so the caption could sit on a stale figure
   * until something unrelated redrew the dock.
   */
  const [latestUsage, setLatestUsage] = useState<UsageSummary | null>(cachedLatestUsage);

  useEffect(() => {
    if (cachedAssistantData) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await getCaptureData();
        if (cancelled || result.error || !result.assistant) return;
        cachedAssistantData = result.assistant;
        setAssistant(result.assistant);
      } catch {
        // Deliberately silent. This decides whether the "needs a key" note and
        // the running-cost line are shown, and nothing else — the chat below is
        // fully usable without it, and if the key really is missing the server
        // says so inside the conversation, which is where the answer would have
        // been. An error banner here would be shouting about a caption.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount only. There is nothing this could usefully re-run for: the dock is
    // mounted once per session and the values are per-account, not per-page.
  }, []);

  return (
    <aside
      aria-label="Assistant"
      /* `self-start` + `sticky top-0` + `h-dvh`: the column is exactly one
         screen tall and stays there while the page beside it scrolls. Without
         `self-start` a flex item stretches to the full height of the row and a
         sticky element with nowhere to move never sticks. */
      className="sticky top-0 flex h-dvh w-[var(--dock-w)] shrink-0 flex-col self-start border-l-2 border-rule bg-surface"
    >
      {/* h-16 is the side rail's wordmark strip, to the pixel, so the rule
          across the top of the app runs unbroken from one edge to the other.
          That continuity is most of what makes this read as part of the
          instrument rather than a panel bolted to the side of it. */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b-2 border-rule px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-primary" strokeWidth={2.5} />
          <span className="micro truncate">Assistant</span>
        </div>
        {/* Where the dock goes when you want the whole screen for it — and the
            one route on which this column is deliberately absent, so the link
            explains its own disappearance. */}
        <Link
          href="/assistant"
          aria-label="Open the assistant full screen"
          className="tap-press flex size-8 shrink-0 items-center justify-center border-2 border-rule text-muted-foreground transition-colors hover:text-foreground"
        >
          <Maximize2 className="size-3.5" strokeWidth={2.5} />
        </Link>
      </div>

      {/* `min-h-0` on the growing child is the half of the flex pair people
          forget: without it a long transcript stretches this box past the
          bottom of the screen instead of scrolling inside it, and the composer
          goes with it. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <AssistantChat
          variant="dock"
          moduleAccess={moduleAccess}
          configured={assistant?.configured}
          /* A figure from a real reply is always newer than the one the
             first-open fetch brought down, so it wins. */
          initialUsage={latestUsage ?? assistant?.usage ?? null}
          timeZone={assistant?.timeZone}
          onUsage={(usage) => {
            // Remembered in both places: the state so this render is right, and
            // module scope so the NEXT mount is (see `cachedLatestUsage`).
            setLatestUsage(usage);
            cachedLatestUsage = usage;
            // A reply landed, and the assistant WRITES: it can log an expense,
            // move a task, tick something off. The page in the left-hand pane
            // was rendered before that happened, so it is now potentially one
            // exchange out of date — and unlike the capture sheet, which
            // refreshes when it closes, the dock never closes. This is the only
            // moment there is. Costs one server round trip per question asked,
            // which is the price of the screen beside it telling the truth.
            router.refresh();
          }}
        />
      </div>
    </aside>
  );
}
