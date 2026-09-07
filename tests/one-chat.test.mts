import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * THE ONE CHAT rule, enforced rather than remembered.
 *
 * `assistant-chat.tsx` opens with a comment headed "THE ONE CHAT. There is no
 * second one," and it is not style advice: two mounted chats gave two
 * composers, two microphones, two copies of one conversation, and dictation
 * started on the page typing into a box hidden behind a dialog. Until 7 Sep
 * 2026 there were two candidates — the /assistant page and the capture sheet —
 * kept apart by one route test. The Fold dock is a THIRD, and three things
 * that must never coexist is where "everybody knows" stops being enough.
 *
 * These are structural tests over the source, the same idiom as
 * `billing-gate.test.mts` and `ai-suggestions.test.mts`: these modules are
 * `"use client"` React and cannot be imported into node's test runner, and the
 * failure being guarded against — a fourth mount point, or a dock hidden with
 * a CSS class instead of an `if` — typechecks perfectly.
 */

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");
}

const DOCK = source("components/nav/assistant-dock.tsx");
const QUICK_ADD = source("components/nav/quick-add.tsx");
const CHAT = source("app/(app)/assistant/assistant-chat.tsx");
const SHELL = source("components/nav/app-shell.tsx");
const WIDE = source("lib/use-wide-screen.ts");

test("the sheet and the dock ask the same question, from the same function", () => {
  // Two copies of "is the dock live?" is how they start disagreeing — and the
  // moment they do, either both chats mount or neither does.
  assert.ok(
    DOCK.includes("export function useAssistantDockLive("),
    "the shared decision has moved or been renamed"
  );
  assert.match(
    QUICK_ADD,
    /import \{[^}]*useAssistantDockLive[^}]*\} from "\.\/assistant-dock"/,
    "quick-add.tsx no longer imports the shared decision — it is deciding for itself"
  );
  assert.match(
    QUICK_ADD,
    /const showChat = canAsk && !onAssistant && !dockLive;/,
    "the capture sheet's chat is no longer suppressed while the dock is live: " +
      "opening the sheet on an unfolded screen would put two chats on screen at once"
  );
});

test("the dock is not rendered at all when it isn't live", () => {
  // `hidden md:flex` would leave a live textarea and a live dictation session
  // mounted inside a box nobody can see — the exact bug the rule exists for.
  assert.match(
    DOCK,
    /if \(!live\) return null;/,
    "the dock no longer returns early — check it is not being CSS-hidden instead"
  );
  // And the decision really does include the route test, so /assistant (which
  // IS the chat) never also gets a dock.
  assert.match(DOCK, /!onAssistant/);
  assert.match(DOCK, /pathname\.startsWith\("\/assistant\/"\)/);
});

test("there are exactly three places a chat can be mounted", () => {
  // A census, deliberately. If a fourth `<AssistantChat` appears, whoever adds
  // it has to come here and say why it cannot coexist with the other three.
  const mounts = [
    ["app/(app)/assistant/page.tsx", "the full-screen page"],
    ["components/nav/quick-add.tsx", "the capture sheet"],
    ["components/nav/assistant-dock.tsx", "the Fold dock"],
  ] as const;
  for (const [path, what] of mounts) {
    assert.ok(source(path).includes("<AssistantChat"), `${what} (${path}) no longer mounts a chat`);
  }

  // The shell mounts the dock and the sheet, and nothing else that could be one.
  assert.match(SHELL, /<AssistantDock/);
  assert.ok(
    !SHELL.includes("<AssistantChat"),
    "the app shell mounts a chat directly — it would be alive on every route, /assistant included"
  );
});

test("the width test has both a width and a height, and fails closed on the server", () => {
  // THE HEIGHT CLAUSE IS LOAD-BEARING. The Fold's cover screen held sideways
  // is comfortably wider than 820px and barely any height; a dock there eats a
  // third of an already-cramped strip. Width alone would put one on it.
  //
  // BUT IT IS NOT A MEDIA QUERY, and this test used to insist that it was.
  // `app/layout.tsx` sets `interactiveWidget: "resizes-content"`, so the
  // Android keyboard SHRINKS the viewport — a `(min-height: 600px)` clause
  // therefore unmounted the dock while Alan was typing in it, taking the
  // half-written question with it. The height now comes from `screen.height`,
  // which describes the screen rather than the viewport: unchanged by the
  // keyboard, still correct across orientation, which is the only thing this
  // guard has to know. The two assertions below are what stops it drifting
  // back to a viewport measurement.
  const width = /const MIN_WIDTH = (\d+);/.exec(WIDE);
  const height = /const MIN_SCREEN_HEIGHT = (\d+);/.exec(WIDE);
  assert.ok(width, "the width threshold changed shape — it must stay one named constant");
  assert.ok(height, "the height guard is gone — a cover screen held sideways would get a dock");
  assert.ok(Number(width[1]) >= 700, "the width threshold is low enough to dock a phone");
  assert.ok(Number(height[1]) >= 500, "the height threshold is too low to exclude a landscape phone");

  // The height must come from the SCREEN, never the viewport.
  assert.match(WIDE, /window\.screen/);
  assert.ok(
    !/matchMedia\([^)]*min-height/.test(WIDE) && !WIDE.includes('and (min-height'),
    "the height guard is back in the media query, where the keyboard can trip it"
  );
  // And a fold that does not change the width still has to be noticed.
  assert.match(WIDE, /addEventListener\("orientationchange"/);
  assert.match(WIDE, /addEventListener\("resize"/);

  // False on the server, so the HTML React sends has no dock in it and there is
  // no hydration mismatch on the app's most important control.
  assert.match(WIDE, /function getServerSnapshot\(\): boolean \{\s*return false;\s*\}/);
});

test("the dock is a frame, not a second implementation", () => {
  // `variant` is documented to change the FRAME and nothing else. A "dock"
  // variant that started branching on behaviour would be the two-chats bug
  // again, arrived at from inside one component.
  assert.match(CHAT, /variant\?: "page" \| "sheet" \| "dock";/);
  assert.match(CHAT, /const dock = variant === "dock";/);
  assert.match(CHAT, /const framed = sheet \|\| dock;/);

  // One implementation: there is exactly one exported chat component.
  assert.equal(
    (CHAT.match(/export function AssistantChat\(/g) ?? []).length,
    1,
    "there is more than one AssistantChat"
  );
});
