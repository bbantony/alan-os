"use client";

import { useSyncExternalStore } from "react";

/**
 * "Is there room beside the page for the assistant dock?"
 *
 * ---------------------------------------------------------------------------
 * THE ONE NUMBER. If the dock does not appear on the real device, change
 * MIN_WIDTH and nothing else — but read the floor below before you do.
 * ---------------------------------------------------------------------------
 *
 * 820px is an ESTIMATE of the narrow end of the unfolded inner display on the
 * device class this app is built for (a Galaxy Z Fold 7). Nobody has measured
 * that screen's CSS pixel width; ~884px is the best available guess, and 820
 * leaves a little headroom under it. Nothing else in the codebase depends on
 * this figure — it is deliberately not a Tailwind breakpoint, because it
 * describes one device's hinge, not the app's responsive scale.
 *
 * THERE IS A FLOOR, AND IT IS ABOUT 820. The page keeps whatever the side rail
 * and the dock leave it:
 *
 *     pane = viewport - 224 (the side rail) - max(280px, 32vw) (the dock)
 *
 *   820 →  316px   the narrowest the app is designed to render at, and what
 *                  the container queries in ui/stat.tsx were tuned against.
 *   780 →  276px   narrower than the smallest phone the app supports.
 *   700 →  196px   money figures, stat strips and the settings rail all break.
 *
 * So lowering this to make the dock appear buys a dock at the cost of the
 * screen it is meant to sit beside. Below ~800 the right move is to shrink
 * `--dock-w` in globals.css FIRST (the dock is legible down to about 260px),
 * and only then to lower this number.
 */
const MIN_WIDTH = 820;

/**
 * THE HEIGHT GUARD, AND WHY IT IS NOT A MEDIA QUERY.
 *
 * Its only job is to tell the unfolded inner display (roughly square, ~816
 * CSS px tall) apart from the Fold's COVER screen held sideways, which is
 * comfortably past 820px across and barely 420px tall. A dock there would take
 * a third of an already-cramped strip.
 *
 * It was `(min-height: 600px)` in the same matchMedia call, and that was a bug
 * waiting to happen. `src/app/layout.tsx` sets `interactiveWidget:
 * "resizes-content"`, which SHRINKS THE VIEWPORT when the Android keyboard
 * opens — deliberately. Unfolded and held sideways, the keyboard can plausibly
 * push the viewport under 600px, and the dock is conditionally rendered, so it
 * would have unmounted while Alan was typing in it: the half-written question
 * gone, the keyboard closing, the height coming back, and the dock returning
 * empty. The worst possible moment for it to disappear.
 *
 * `window.screen.height` does not move when the keyboard opens — it describes
 * the screen, not the viewport — but it DOES follow orientation, which is the
 * only thing this guard needs to know. Recomputed mid-keyboard it gives the
 * same answer, which is exactly the property wanted.
 *
 * KNOWN AND ACCEPTED: a desktop browser window that is wide but short now
 * passes this check, because the monitor behind it is tall. That is the right
 * outcome — a 1200x500 window has ample room for a dock, and the only reason
 * this clause exists is a phone's cover screen.
 */
const MIN_SCREEN_HEIGHT = 600;

const WIDTH_QUERY = `(min-width: ${MIN_WIDTH}px)`;

/**
 * One MediaQueryList for the whole tab, created lazily. `getSnapshot` runs on
 * every render, and building a fresh one each time would be a new object per
 * render for no reason. What it returns is a boolean, so
 * `useSyncExternalStore`'s identity check is satisfied without any caching.
 */
let media: MediaQueryList | null = null;

function mediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  media ??= window.matchMedia(WIDTH_QUERY);
  return media;
}

/**
 * BOTH signals, because neither is enough on its own.
 *
 * Unfolding the phone from the cover screen in landscape does not necessarily
 * change the answer to "is the viewport at least 820px wide?" — both screens
 * can be — so the media query may never fire. Only `resize` /
 * `orientationchange` catch that, which is the transition the whole dock
 * exists for. And the media query catches a desktop window being dragged
 * narrower, which fires no orientation event.
 */
function subscribe(onChange: () => void) {
  const list = mediaQuery();
  list?.addEventListener("change", onChange);
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    list?.removeEventListener("change", onChange);
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

function getSnapshot(): boolean {
  const list = mediaQuery();
  if (!list) return false;
  // `screen` is missing in some embedded webviews; treat that as "no dock"
  // rather than guessing, since guessing wrong puts one on a cover screen.
  const screenHeight = typeof window.screen?.height === "number" ? window.screen.height : 0;
  return list.matches && screenHeight >= MIN_SCREEN_HEIGHT;
}

/**
 * FALSE on the server, always — so the markup React sends down has no dock in
 * it and the dock appears a beat after hydration instead of being rendered
 * into HTML the client might disagree with. The alternative (guessing on the
 * server) is a hydration mismatch on the single most important control in the
 * app. Same shape as the dictation-support check in assistant-chat.tsx.
 */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * True when the screen is wide enough, and is a real screen rather than a
 * cover display held sideways, to sit the assistant beside the page. Read by
 * the dock itself and by the capture sheet, which must leave its own chat out
 * whenever the dock is the live one — see the header of assistant-chat.tsx for
 * why exactly one chat may be alive.
 */
export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
