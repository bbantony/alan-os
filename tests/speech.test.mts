import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTranscript } from "../src/lib/speech.ts";

/**
 * Dictation transcript — "it repeats each word twice" (15 Sep 2026).
 *
 * The mic built its transcript by appending every final result from
 * `event.resultIndex` onwards into a running string kept across events. When
 * `resultIndex` didn't advance, results already added were added again. The
 * transcript is now rebuilt from the whole list on every event.
 *
 * None of these lists were captured from a phone. They are the shape the
 * Web Speech API documents — every event carries the full list of results so
 * far — which is all the fix relies on.
 */

type Result = { 0: { transcript: string }; isFinal: boolean; length: number };
const r = (transcript: string, isFinal = true): Result => ({
  0: { transcript },
  isFinal,
  length: 1,
});

test("a result delivered again on the next event is not counted twice", () => {
  // Event 1 carries one finished phrase; event 2 carries it again plus the
  // next one. The old code, with resultIndex stuck at 0, produced
  // "log bench presslog bench press 135 for 8" from exactly this.
  assert.equal(buildTranscript([r("log bench press")]).text, "log bench press");
  assert.equal(
    buildTranscript([r("log bench press"), r(" 135 for 8")]).text,
    "log bench press 135 for 8"
  );
});

test("reading the same list twice gives the same text", () => {
  const results = [r("add eggs"), r("to the list")];
  assert.equal(buildTranscript(results).text, "add eggs to the list");
  assert.equal(buildTranscript(results).text, "add eggs to the list");
});

test("words someone really said twice are kept", () => {
  // A draft of this fix merged look-alike phrases and dropped these.
  assert.equal(
    buildTranscript([r("buy milk"), r("buy milk and eggs")]).text,
    "buy milk buy milk and eggs"
  );
  assert.equal(buildTranscript([r("yes"), r("yes")]).text, "yes yes");
});

test("interim words show, and isFinal is only true when every result is final", () => {
  assert.deepEqual(buildTranscript([r("add eggs"), r("to the list", false)]), {
    text: "add eggs to the list",
    isFinal: false,
  });
  assert.equal(buildTranscript([r("add eggs")]).isFinal, true);
  assert.deepEqual(buildTranscript([]), { text: "", isFinal: true });
});

test("blank and space-padded results don't leave stray spaces", () => {
  assert.equal(buildTranscript([r(" hello "), r("   "), r("world")]).text, "hello world");
});
