import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CONVERSATION_CAP_PER_USER,
  MAX_HISTORY,
  MAX_HISTORY_CHARS,
  MESSAGE_CAP_PER_CONVERSATION,
  TITLE_MAX_CHARS,
  conversationIntent,
  conversationTitle,
  historyWindow,
  overCap,
  type AssistantMessage,
} from "../src/lib/ai/history.ts";

/**
 * Assistant memory — "keep everything, send twelve".
 *
 * Same charter as the other files in here: this is the pure maths behind a
 * decision that costs real money, tested without a database. Migration 0041
 * made the assistant remember conversations across navigation; the risk it
 * introduced is that "remember" quietly becomes "re-send", and the input bill
 * on every question goes up with the length of the chat. lib/ai/usage.ts
 * already records that the $5/month budget is an underestimate because the
 * twenty-tool schema is re-sent every turn, so there is no headroom to spend.
 *
 * The invariant these tests exist to hold down:
 *
 *   PERSISTENCE IS UNBOUNDED-ISH (200 messages a chat, 30 chats).
 *   WHAT THE MODEL SEES IS NOT (12 messages, 24,000 characters).
 *
 * Two of the cases below are bugs that `history.slice(-12)` — the line
 * historyWindow replaces — genuinely had, and that only became reachable once
 * history came out of a database instead of out of React state:
 *
 *  - a window starting with a `model` turn, which the API is entitled to
 *    refuse. The stored log is always even (an exchange is one two-row insert,
 *    and the action that could append a single message was deleted on 6 Sep
 *    2026) but the WINDOW over it is not: the read path takes the newest 40
 *    rows, the character budget can stop mid-exchange, and 0041's 200-row
 *    pruning trigger fires per row;
 *  - twelve messages of unbounded size. In React state a message was whatever
 *    had just been typed. In the database it can be up to 32,000 characters
 *    (0041's content check), so twelve of them is ~100k tokens on one question.
 */

function log(...roles: ("user" | "assistant")[]): AssistantMessage[] {
  return roles.map((role, i) => ({ role, content: `${role} message ${i}` }));
}

function alternating(pairs: number): AssistantMessage[] {
  const out: AssistantMessage[] = [];
  for (let i = 0; i < pairs; i++) {
    out.push({ role: "user", content: `question ${i}` });
    out.push({ role: "assistant", content: `answer ${i}` });
  }
  return out;
}

// --- The message cap: unchanged from before memory existed -------------------

test("the per-turn message ceiling is still twelve", () => {
  // If this ever changes, the cost note in lib/ai/usage.ts changes with it.
  assert.equal(MAX_HISTORY, 12);
});

test("a long conversation is trimmed to the newest twelve messages", () => {
  const window = historyWindow(alternating(50));
  assert.equal(window.length, MAX_HISTORY);
  // The newest exchange must be in it; the oldest must not.
  assert.equal(window.at(-1)?.content, "answer 49");
  assert.equal(window.at(0)?.content, "question 44");
  assert.ok(!window.some((m) => m.content === "question 0"));
});

test("a short conversation is sent whole", () => {
  const messages = alternating(2);
  assert.deepEqual(historyWindow(messages), messages);
});

test("an empty conversation sends nothing", () => {
  assert.deepEqual(historyWindow([]), []);
});

test("trimming never mutates the stored conversation", () => {
  const messages = alternating(20);
  const before = messages.map((m) => m.content);
  historyWindow(messages);
  assert.deepEqual(
    messages.map((m) => m.content),
    before
  );
});

// --- The window has to start on a question -----------------------------------

test("a window that would open on an answer drops it", () => {
  // Odd-length log: the plain slice(-12) would start on `assistant`.
  const messages = [{ role: "user" as const, content: "opening" }, ...alternating(10)];
  const window = historyWindow(messages, { maxMessages: 5 });
  assert.equal(window[0].role, "user");
  assert.equal(window.length, 4, "the dangling answer is dropped, not padded over");
});

test("a log of nothing but answers sends nothing rather than an invalid shape", () => {
  assert.deepEqual(historyWindow(log("assistant", "assistant")), []);
});

test("asking for no history sends none", () => {
  assert.deepEqual(historyWindow(alternating(5), { maxMessages: 0 }), []);
});

// --- Empty content is not a turn ---------------------------------------------

test("blank messages are not sent to the model", () => {
  const messages: AssistantMessage[] = [
    { role: "user", content: "what did I spend" },
    { role: "assistant", content: "   " },
    { role: "user", content: "and last month" },
    { role: "assistant", content: "$412." },
  ];
  const window = historyWindow(messages);
  assert.equal(window.length, 3);
  assert.ok(!window.some((m) => m.content.trim() === ""));
});

// --- The character budget: the new brake -------------------------------------

test("the character budget drops the oldest messages first", () => {
  const messages: AssistantMessage[] = [
    { role: "user", content: "A".repeat(400) },
    { role: "assistant", content: "B".repeat(400) },
    { role: "user", content: "C".repeat(100) },
    { role: "assistant", content: "D".repeat(100) },
  ];
  const window = historyWindow(messages, { maxChars: 300 });
  assert.deepEqual(
    window.map((m) => m.content[0]),
    ["C", "D"]
  );
});

test("the character budget is a real ceiling on twelve database-sized messages", () => {
  // Twelve messages at 32,000 characters each — the largest 0041 allows — is
  // roughly 100k tokens of input on a single question. It must not be sendable.
  const messages = Array.from({ length: 12 }, (_, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: "x".repeat(32_000),
  }));
  const window = historyWindow(messages);
  const total = window.reduce((sum, m) => sum + m.content.length, 0);
  assert.ok(
    total <= MAX_HISTORY_CHARS || window.length === 1,
    `sent ${total} characters, budget is ${MAX_HISTORY_CHARS}`
  );
});

test("one oversized newest message is still sent rather than answering blind", () => {
  const messages: AssistantMessage[] = [
    { role: "user", content: "old" },
    { role: "user", content: "y".repeat(30_000) },
  ];
  const window = historyWindow(messages, { maxChars: 1_000 });
  assert.equal(window.length, 1);
  assert.equal(window[0].content.length, 30_000);
});

// --- Retention -----------------------------------------------------------------

test("the retention caps match the triggers in migration 0041", () => {
  assert.equal(MESSAGE_CAP_PER_CONVERSATION, 200);
  assert.equal(CONVERSATION_CAP_PER_USER, 30);
});

test("retention has a hard row ceiling per account", () => {
  // The number that makes this safe on a free tier. 6,000 rows, no clock, no
  // unbounded growth. If either cap is raised, this is the figure to re-check.
  assert.equal(MESSAGE_CAP_PER_CONVERSATION * CONVERSATION_CAP_PER_USER, 6_000);
});

test("the store keeps far more than it ever sends", () => {
  // The whole design in one assertion: reading is cheap, thinking is not.
  assert.ok(MESSAGE_CAP_PER_CONVERSATION > MAX_HISTORY * 10);
});

test("overCap is the number of rows above the cap, never negative", () => {
  assert.equal(overCap(205, 200), 5);
  assert.equal(overCap(200, 200), 0);
  // The bug this guards: 193 - 200 is -7, and slice(-7) on an ascending list
  // returns the newest seven instead of trimming nothing.
  assert.equal(overCap(193, 200), 0);
  assert.equal(overCap(0, 200), 0);
});

test("overCap survives a missing count rather than producing NaN", () => {
  assert.equal(overCap(Number.NaN, 200), 0);
  assert.equal(overCap(Number.POSITIVE_INFINITY, 200), 0);
  assert.equal(overCap(10, Number.NaN), 0);
});

// --- Conversation titles -------------------------------------------------------

test("a short question becomes the chat's name as typed", () => {
  assert.equal(conversationTitle("What did I spend on groceries?"), "What did I spend on groceries?");
});

test("a title collapses the whitespace a dictated question arrives with", () => {
  assert.equal(conversationTitle("  how   much\n\ndid I spend  "), "how much did I spend");
});

test("a long question is cut on a word boundary and marked as cut", () => {
  const question =
    "How much did I spend on groceries in August and how does that compare with July and the month before";
  const title = conversationTitle(question);
  assert.ok(title.endsWith("…"));
  assert.ok(title.length <= TITLE_MAX_CHARS + 1);
  assert.ok(!title.includes(" …"), "no space left dangling before the ellipsis");
  assert.ok(question.startsWith(title.slice(0, -1)));
});

test("a long question with no spaces is still cut, not left whole", () => {
  const title = conversationTitle("z".repeat(300));
  assert.equal(title.length, TITLE_MAX_CHARS + 1);
  assert.ok(title.endsWith("…"));
});

test("an empty question falls back to a name rather than an empty chip", () => {
  assert.equal(conversationTitle("   "), "New chat");
  assert.equal(conversationTitle(""), "New chat");
});

// --- "Continue where I left off" is not the same as "I am in no chat" ---------
//
// The bug: `ask` read a missing conversation id and an explicit null as the
// same thing and fell through to the most recently used chat. Delete the chat
// you are in — the screen now legitimately holds no conversation — and the next
// question was filed into an unrelated older thread, with up to a dozen of that
// thread's messages sent to the model as context for a screen showing a blank
// new chat. This is the contract the chat screen is written against; if it ever
// stops being true, the two halves have drifted and nobody will see it.

test("an absent conversation id means resume where I left off", () => {
  assert.deepEqual(conversationIntent(), { mode: "resume" });
  assert.deepEqual(conversationIntent(undefined), { mode: "resume" });
});

test("an explicit null means a fresh chat, never the most recent one", () => {
  // The whole fix in one assertion: null is what the client sends after a
  // delete and after "New chat", and it must not resume anything.
  assert.deepEqual(conversationIntent(null), { mode: "fresh" });
  assert.notEqual(conversationIntent(null).mode, conversationIntent().mode);
});

test("an id means that chat and only that chat", () => {
  assert.deepEqual(conversationIntent("2f0d7c4e-1111-2222-3333-444455556666"), {
    mode: "specific",
    id: "2f0d7c4e-1111-2222-3333-444455556666",
  });
});

test("a padded id is still that chat", () => {
  assert.deepEqual(conversationIntent("  abc  "), { mode: "specific", id: "abc" });
});

test("a blank id is a fresh chat, not a resume", () => {
  // `conversationId ? ... : mostRecent` treated "" as falsy and resumed. An
  // empty string is not an id, and guessing which chat it meant is the bug.
  assert.deepEqual(conversationIntent(""), { mode: "fresh" });
  assert.deepEqual(conversationIntent("   "), { mode: "fresh" });
});

test("junk arriving over the server action boundary is a fresh chat", () => {
  // This is a server action argument: it comes off the wire and TypeScript is
  // not there to check it. Anything unrecognised must fail towards a new empty
  // thread, never towards writing into a chat nobody asked for.
  const junk = [0, 42, {}, [], true] as unknown as (string | null | undefined)[];
  for (const value of junk) {
    assert.deepEqual(conversationIntent(value), { mode: "fresh" });
  }
});
