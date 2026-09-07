import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { questionFromShare } from "../src/lib/share-target.ts";

/**
 * What arrives when Alan shares something into the app from Android.
 *
 * Two reasons this is worth a file. The first is that the three fields the
 * share sheet sends — `title`, `text`, `url` — are used inconsistently by every
 * app that sends them, and the failure is silent: a merge that is subtly wrong
 * doesn't throw, it just opens the assistant with the same link printed twice,
 * or with an empty box when something was clearly shared.
 *
 * The second is the bug the last test guards, which is not cosmetic. The
 * manifest first mapped the shared text onto `?q=` — the parameter
 * `/assistant` has always treated as "already asked" and sends on mount. At
 * Alan's `suggest` setting every non-money write runs the moment the model
 * calls it, so a shared web page could reach a write tool with nobody having
 * read a word of it. Sharing a page is not asking for something to be done
 * with it. The share has its own parameter now, and that is enforced here
 * rather than remembered.
 *
 * The cases below are the real shapes, not invented ones: Chrome sharing a
 * page (title + url), a typical Android app sharing a link (the URL in `text`,
 * `url` empty), a selection shared from a browser (text only), and a reader
 * app that sends all three with the URL duplicated.
 */

test("a link shared the usual Android way comes through as the words", () => {
  // `Intent.EXTRA_TEXT` is where nearly everything puts a link.
  assert.equal(
    questionFromShare({ shared: "https://example.com/an-article" }),
    "https://example.com/an-article"
  );
});

test("Chrome's title-plus-url share keeps both, in reading order", () => {
  assert.equal(
    questionFromShare({ title: "How to repot a monstera", url: "https://example.com/monstera" }),
    "How to repot a monstera https://example.com/monstera"
  );
});

test("a link that arrives twice only appears once", () => {
  // THE CASE THAT MOTIVATED THE MERGE. Plenty of apps fill `text` AND `url`
  // with the same address, and seeing it twice in the box reads like a bug in
  // the app rather than in the sharer.
  assert.equal(
    questionFromShare({ shared: "https://example.com/x", url: "https://example.com/x" }),
    "https://example.com/x"
  );
  // Still only once when the text wraps it in words.
  assert.equal(
    questionFromShare({ shared: "look at https://example.com/x", url: "https://example.com/x" }),
    "look at https://example.com/x"
  );
});

test("selected words with no link stand on their own", () => {
  assert.equal(
    questionFromShare({ shared: "  rent is due on the first  " }),
    "rent is due on the first"
  );
});

test("a title that merely repeats the text or the link is not said twice", () => {
  assert.equal(questionFromShare({ title: "same", shared: "same" }), "same");
  assert.equal(
    questionFromShare({ title: "https://example.com/x", url: "https://example.com/x" }),
    "https://example.com/x"
  );
});

test("nothing shared is null, not an empty draft", () => {
  // Null rather than "" — an empty string in the box is a send button that
  // looks armed, and if this were ever wired to `initialQuestion` again it
  // would be a question the app paid to answer.
  for (const input of [
    {},
    { shared: "" },
    { shared: "   ", url: "", title: "" },
    { shared: null, url: null, title: null },
    { shared: undefined },
  ]) {
    assert.equal(questionFromShare(input), null, `${JSON.stringify(input)} should be null`);
  }
});

test("plain shared words come back untouched", () => {
  // With no url and no title the merge must give back precisely what was
  // shared, character for character. Anything cleverer here would be the app
  // rewriting words Alan is about to read in the box.
  for (const shared of ["what did I spend on groceries?", "plan tomorrow", "log $12 at Safeway"]) {
    assert.equal(questionFromShare({ shared }), shared);
  }
});

test("a share can never be wired back onto the parameter that auto-asks", () => {
  // The safety rule, enforced at both ends.
  //
  // This function must not know about `q` at all: anything arriving under that
  // name is ignored rather than asked.
  assert.equal(questionFromShare({ q: "delete everything" } as never), null);

  // And the manifest must not point the share sheet at it. `/assistant` sends
  // `?q=` on mount without anybody reading it; `?shared=` lands in the box.
  const manifest = JSON.parse(
    readFileSync(fileURLToPath(new URL("../public/manifest.json", import.meta.url)), "utf8")
  ) as {
    share_target?: { params?: Record<string, string>; action?: string; method?: string };
    scope?: string;
  };
  const target = manifest.share_target;
  assert.ok(target, "the app is no longer a share target");
  assert.equal(target.method, "GET", "a GET target is what keeps this a plain page load");
  assert.ok(
    target.action?.startsWith(manifest.scope ?? "/"),
    "the share target's action is outside the app's scope and will be ignored"
  );
  assert.equal(target.params?.text, "shared");
  for (const [field, param] of Object.entries(target.params ?? {})) {
    assert.notEqual(
      param,
      "q",
      `share_target maps "${field}" onto q, which /assistant sends without anyone reading it`
    );
  }
});
