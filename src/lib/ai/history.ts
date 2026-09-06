/**
 * What the assistant remembers, and what it is willing to pay to remember.
 *
 * Deliberately PURE and free of `server-only`, for two reasons: the server
 * actions, the assistant loop and `tests/assistant-history.test.mts` all need
 * it, and the money question below is exactly the kind of thing that must be
 * testable without standing up a database.
 *
 * THE COST RULE, which is the whole point of this file existing separately
 * from assistant.ts. Migration 0041 persists EVERY message forever (up to the
 * retention caps). The model is still sent only a window. Storage is free on
 * Supabase; input tokens are not, and lib/ai/usage.ts already records that the
 * $5/month budget is an underestimate because the twenty-tool schema is
 * re-sent on every single turn. So: persist everything for READING, send a
 * trimmed window for THINKING, and never let the two numbers drift.
 *
 * The window has two limits, not one:
 *
 *   MAX_HISTORY (12 messages) — unchanged from the `history.slice(-12)` this
 *   replaces, so the per-turn ceiling is exactly what it was before memory
 *   existed.
 *
 *   MAX_HISTORY_CHARS (24,000) — NEW, and it only ever makes a turn cheaper.
 *   Before memory, the browser held the history and 12 messages could be 12
 *   pasted bank statements. Now the history comes out of a database where a
 *   single message may be up to 32,000 characters (0041's content check), so
 *   an unbounded 12 could be ~100k tokens of input on one question. 24,000
 *   characters is roughly 6,000 tokens, which sits under the fixed cost of the
 *   system prompt plus the tool schema and cannot be the thing that blows the
 *   month.
 */

/** One turn of a conversation, as the model and the UI both see it. */
export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
  /** Names of the writes performed while answering, for the "what I did" line. */
  actions?: string[];
}

/** Messages of prior context sent to the model on any one turn. */
export const MAX_HISTORY = 12;

/** Characters of prior context sent to the model on any one turn. */
export const MAX_HISTORY_CHARS = 24_000;

/**
 * Retention, mirrored from the triggers in migration 0041. The database is
 * authoritative — these constants exist so the read paths never ask for more
 * rows than can exist, and so a future change to one number is visibly a
 * change to a documented rule rather than a stray edit in a .sql file.
 *
 * 200 x 30 = 6,000 rows per account, hard. No age rule: a chat untouched for
 * three months is not the same thing as a chat nobody wants.
 */
export const MESSAGE_CAP_PER_CONVERSATION = 200;
export const CONVERSATION_CAP_PER_USER = 30;

/** Longest a generated conversation title may get. */
export const TITLE_MAX_CHARS = 80;

export interface HistoryWindowOptions {
  maxMessages?: number;
  maxChars?: number;
}

/**
 * The slice of a conversation that is actually sent to the model.
 *
 * Three things happen here, in this order, and each one was a real problem:
 *
 *  1. EMPTY MESSAGES ARE DROPPED. A turn where the model was unavailable used
 *     to be able to leave a blank entry behind. A part with empty text is a
 *     content-free part the API is charged for and may reject.
 *  2. THE NEWEST MESSAGES WIN, up to both limits. Counted newest-first so the
 *     character budget spends itself on recent context rather than on whatever
 *     happened to be said first.
 *  3. THE WINDOW STARTS ON A QUESTION. `slice(-12)` on a log whose first
 *     remaining message is an answer hands Gemini a conversation opening with
 *     a `model` turn, which is a shape the API is entitled to refuse. Every
 *     exchange is now written as ONE two-row insert, so the stored log is
 *     even-length — but the window over it need not be: the read path takes
 *     the newest 40 rows, this function then takes the newest 12 of those and
 *     the character budget can stop mid-exchange, and 0041's 200-row pruning
 *     trigger fires per row and can leave a dangling answer at the front.
 *
 * The most recent message is never dropped for being too long on its own: if
 * one message alone exceeds the character budget it is still included, because
 * returning nothing would silently answer the wrong question. It is bounded by
 * the 32,000-character database constraint regardless.
 */
export function historyWindow(
  messages: readonly AssistantMessage[],
  options: HistoryWindowOptions = {}
): AssistantMessage[] {
  const maxMessages = options.maxMessages ?? MAX_HISTORY;
  const maxChars = options.maxChars ?? MAX_HISTORY_CHARS;
  if (maxMessages <= 0) return [];

  const usable = messages.filter((m) => m.content.trim().length > 0);

  const picked: AssistantMessage[] = [];
  let chars = 0;
  for (let i = usable.length - 1; i >= 0 && picked.length < maxMessages; i--) {
    const message = usable[i];
    const next = chars + message.content.length;
    if (picked.length > 0 && next > maxChars) break;
    picked.push(message);
    chars = next;
  }
  picked.reverse();

  while (picked.length > 0 && picked[0].role !== "user") picked.shift();
  return picked;
}

/**
 * What a caller means by the conversation id it did — or did not — send.
 *
 * THE BUG THIS EXISTS TO PREVENT. Until now the server read a missing id and
 * an explicit `null` as the same thing — "continue wherever I left off" — and
 * fell through to the most recently used chat. After Alan deletes the chat he
 * is in, the screen legitimately holds no conversation, so his next question
 * was filed into an unrelated older thread, and up to a dozen of THAT thread's
 * messages were sent to the model as context for what the screen was showing
 * as a blank new chat. Silent, and impossible to notice from the outside
 * except as the assistant answering as if it remembered something it was never
 * told.
 *
 * So the two are now different intents, and this is the only place that
 * decides which is which:
 *
 *   undefined (or the key absent) — RESUME. "Wherever I left off": the most
 *     recently used chat, or a new one if the account has never asked anything.
 *     This is the page load case.
 *   null — FRESH. "I am deliberately in no chat." Always a new thread; never
 *     falls back to an older one. The client sends this after a delete and
 *     after "New chat".
 *   a non-empty string — SPECIFIC. That chat, and only that chat. If it no
 *     longer exists the caller starts a fresh one rather than wandering into
 *     the next chat along.
 *
 * Anything else — a blank string, or a non-string that arrived over the server
 * action boundary where TypeScript is not there to stop it — is FRESH. That is
 * the safe direction: the worst case is an extra empty thread, where the
 * alternative is writing into a chat nobody asked for.
 */
export type ConversationIntent =
  | { mode: "resume" }
  | { mode: "fresh" }
  | { mode: "specific"; id: string };

export function conversationIntent(conversationId?: string | null): ConversationIntent {
  if (conversationId === undefined) return { mode: "resume" };
  if (typeof conversationId !== "string") return { mode: "fresh" };
  const id = conversationId.trim();
  return id ? { mode: "specific", id } : { mode: "fresh" };
}

/**
 * A name for a chat, taken from the first thing asked in it.
 *
 * No AI call: naming a conversation is not worth a model round trip, and the
 * first question is almost always a better title than a generated one anyway.
 * Cut on a word boundary when there is a sensible one, so "How much did I
 * spend on gro…" rather than a title ending mid-syllable.
 */
export function conversationTitle(firstUserMessage: string): string {
  const flat = firstUserMessage.replace(/\s+/g, " ").trim();
  if (!flat) return "New chat";
  if (flat.length <= TITLE_MAX_CHARS) return flat;

  const cut = flat.slice(0, TITLE_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > TITLE_MAX_CHARS / 3 ? cut.slice(0, lastSpace) : cut;
  return `${body.trimEnd()}…`;
}

/**
 * How many rows are over a retention cap, given how many exist.
 *
 * The DELETE itself lives in the 0041 triggers, which are authoritative. This
 * is the same arithmetic in a form the read path can apply and a test can pin
 * down: `getConversation` asks for slightly more than the cap and trims the
 * excess, so a database where the trigger is absent — a partially applied
 * 0041, a future migration that drops it — degrades to "shows the newest 200"
 * rather than to "renders an unbounded chat log on a phone".
 *
 * Never negative: "already under the cap" is 0, not -7. `slice(-7)` on the
 * ascending list would silently return the whole thing, which is the bug this
 * guards against being written by hand at the call site.
 */
export function overCap(total: number, cap: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(cap)) return 0;
  return Math.max(0, Math.trunc(total) - Math.trunc(cap));
}
