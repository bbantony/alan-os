"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowUp,
  Check,
  ChevronDown,
  History,
  Mic,
  Plus,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { Panel, PanelEmpty } from "@/components/ui/panel";
import { Micro } from "@/components/ui/tag";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { fadeInUpVariants } from "@/lib/motion";
import { conversationTitle, type AssistantMessage } from "@/lib/ai/history";
import type { UsageSummary } from "@/lib/ai/usage";
import type { ModuleAccess } from "@/lib/permissions";
import { APP_TIMEZONE, formatInAppTimezone } from "@/lib/time";
import { speechSupported, startDictation, type Dictation } from "@/lib/speech";
import type { AssistantProposal } from "@/lib/ai/boldness";
import {
  ask,
  deleteConversation,
  getConversation,
  listConversations,
  runAssistantProposal,
  startConversation,
  type ConversationSummary,
  type StoredAssistantMessage,
  type StoredConversation,
} from "./actions";

/**
 * THE ONE CHAT. There is no second one.
 *
 * This component is rendered in two places — full screen at /assistant, and
 * inside the global capture sheet (components/nav/quick-add.tsx) — but never
 * in both AT ONCE. The sheet leaves the chat out entirely while you are
 * standing on /assistant (it keeps its forms), because mounting it there gave
 * you two composers, two microphones and two copies of one conversation, and
 * dictation started on the page kept typing into the box hidden behind the
 * sheet. One chat alive at a time is not a nicety here; it is what makes the
 * shared state below safe.
 *
 * `variant` changes the FRAME and nothing else: how tall the transcript is
 * allowed to get, whether it starts collapsed, whether the composer sticks to
 * the viewport, and which box the newest message is scrolled into. Every
 * behaviour — memory, dictation, the queue, the cost line — is shared, because
 * two chat screens that drift apart is a worse outcome than either of them.
 *
 * MEMORY (migration 0041). The conversation is loaded from the database, not
 * kept in this component's head. On /assistant the page hands it down already
 * fetched, so there is no flash of an empty screen; in the sheet, which has no
 * page of its own, it is fetched on open — for the thread this tab was last
 * in (see the shared store's `intent` below), not merely the newest one, and
 * for a deliberately blank chat that means fetching nothing at all. History is
 * never uploaded from here: the server reads it back out of the database,
 * which is the only copy that knows what has been deleted.
 */

/** One per line when several rescued questions go back into the box. */
const NEWLINE = String.fromCharCode(10);

/**
 * How tall the transcript may get inside the capture sheet.
 *
 * Deliberately modest. The sheet has a second job — the Expense/Task/Shopping/
 * Receipt chips underneath it — and a transcript that can eat half the screen
 * with a phone keyboard up pushes them below the fold.
 */
const SHEET_LIST_HEIGHT = "max-h-[32dvh]";

interface ChatMessage extends AssistantMessage {
  /** Stable render key: the database id, or a local one for a fresh message. */
  key: string;
  /**
   * True when the exchange came back with `persisted: false` — the answer is
   * real and was paid for, but nothing could be written down. Set on BOTH
   * halves of the pair: the question went unsaved as surely as the answer did,
   * and captioning only the reply implied the question had survived.
   */
  unsaved?: boolean;
  /**
   * The row this reply is stored as. Null on an exchange that could not be
   * saved — and in that case `proposals` is empty, because a button that posts
   * a message id nothing can look up would fail every time it was pressed.
   */
  messageId?: string | null;
  /** Writes this reply offered but did not make. See lib/ai/boldness.ts. */
  proposals?: AssistantProposal[];
}

/** What `ask` gives back, whoever is (or isn't) still on screen to receive it. */
type AskReply = Awaited<ReturnType<typeof ask>>;

/**
 * The one exchange that may be in the air, parked OUTSIDE React.
 *
 * The sheet's copy of this component unmounts the moment the sheet closes, and
 * an answer takes seconds. Held in component state, closing mid-answer threw
 * the reply away: reopening showed the transcript as it was BEFORE the
 * question, with no question, no "Looking…", and no way to see the answer
 * short of closing and opening again — so the natural thing to do was ask the
 * same question a second time, which costs real money and files the exchange
 * twice.
 *
 * Kept here instead, in module scope, the question and its answer outlive any
 * mount: whichever chat is on screen next picks it up and finishes the job.
 * Safe precisely BECAUSE only one chat is ever alive (see the header above).
 */
type LiveExchange =
  | { status: "asking"; question: string }
  | { status: "landed"; question: string; reply: AskReply }
  | {
      status: "failed";
      question: string;
      message: string;
      /**
       * The connection dropped after the question had gone out. The server may
       * well have answered it, saved it and charged for it — so this is never
       * reported as "nothing happened, try again".
       */
      mayHaveLanded: boolean;
    };

/**
 * Which thread this TAB is in — as an INTENT, not merely an id.
 *
 * It mirrors the server's three cases exactly (`conversationIntent` in
 * lib/ai/history.ts), because anything less than all three loses one of them:
 *
 *   resume     wherever I left off. The server may hand back the most recently
 *              used chat. The page-load case, and the ONLY one that may adopt a
 *              thread nobody named.
 *   fresh      I am deliberately in no chat — after "New chat", and after
 *              deleting the chat I was in. Always starts a new thread; never
 *              falls back to an older one.
 *   specific   that chat, by id.
 *
 * "Fresh" is the one that keeps getting lost, and the loss is expensive: a
 * question asked in that state used to go out as "resume", which the server
 * correctly filed into whichever unrelated thread was newest, handing the model
 * a dozen messages of someone else's context. So it is stored WHOLE, in the
 * shared store below, and it survives a remount exactly as the in-flight
 * exchange does — because "I deliberately have no chat" is a fact about this
 * tab, not about one mount of one component.
 */
type ChatIntent =
  | { mode: "resume" }
  | { mode: "fresh" }
  | { mode: "specific"; id: string };

/**
 * THE SHARED STORE. Everything that has to outlive a mount, in one value.
 *
 * The sheet's copy of this component unmounts the moment the sheet closes, so
 * anything held in component state dies with it. Three things must not:
 *
 *   exchange   the question in the air and its answer (see above).
 *   queue      questions waiting their turn. They were component state, so
 *              closing the sheet with words waiting silently threw them away —
 *              the exact loss the queue exists to prevent.
 *   intent     which chat this tab is in, including "deliberately none".
 *
 * One object, one subscriber list, one `useSyncExternalStore` call in the
 * component. Deliberately not three stores: three would be three places to
 * forget, which is how the intent got lost twice already. Safe precisely
 * BECAUSE only one chat is ever alive (see the header at the top of the file).
 */
type SharedChatState = {
  exchange: LiveExchange | null;
  queue: string[];
  intent: ChatIntent;
};

/** Also the server snapshot: nothing is in flight, queued or remembered there. */
const INITIAL_SHARED: SharedChatState = {
  exchange: null,
  queue: [],
  intent: { mode: "resume" },
};

let shared: SharedChatState = INITIAL_SHARED;
const sharedWatchers = new Set<() => void>();

function updateShared(patch: Partial<SharedChatState>) {
  shared = { ...shared, ...patch };
  for (const watcher of sharedWatchers) watcher();
}

function subscribeShared(onChange: () => void) {
  sharedWatchers.add(onChange);
  return () => {
    sharedWatchers.delete(onChange);
  };
}

function readShared() {
  return shared;
}

function readServerShared(): SharedChatState {
  return INITIAL_SHARED;
}

function setLiveExchange(next: LiveExchange | null) {
  updateShared({ exchange: next });
}

// ---- The queue, module-scope for the reason above ----

function enqueueAsk(question: string) {
  updateShared({ queue: [...shared.queue, question] });
}

function takeNextAsk(): string | undefined {
  const [next, ...rest] = shared.queue;
  if (next === undefined) return undefined;
  updateShared({ queue: rest });
  return next;
}

function clearQueue(): string[] {
  const waiting = shared.queue;
  if (waiting.length > 0) updateShared({ queue: [] });
  return waiting;
}

// ---- The intent: ONE writer, ONE reader, TWO derived questions ----

function setChatIntent(next: ChatIntent) {
  updateShared({ intent: next });
}

/** The only way to ask "which chat am I in?" anywhere in this file. */
function readChatIntent(): ChatIntent {
  return shared.intent;
}

/** The id, when there is one. "Resume" and "fresh" are both `null` — that is why they cannot be stored as ids. */
function intentConversationId(intent: ChatIntent): string | null {
  return intent.mode === "specific" ? intent.id : null;
}

/**
 * The intent as the argument `ask` and `getConversation` take: an id, explicit
 * `null` for a deliberate blank, `undefined` for "wherever I left off". The one
 * place an intent is turned into a server argument.
 */
function intentArgument(intent: ChatIntent): string | null | undefined {
  if (intent.mode === "specific") return intent.id;
  return intent.mode === "fresh" ? null : undefined;
}

/**
 * Is an answer still coming back? Read by the capture sheet, which closes over
 * the top of this component and would otherwise say nothing about it.
 */
export function assistantAnswerInFlight(): boolean {
  return shared.exchange?.status === "asking";
}

/**
 * The one live dictation session, so the rest of the app can end it.
 *
 * WHY THIS EXISTS — please don't quietly remove it. There is only ever one
 * chat alive, but on /assistant the capture sheet opens OVER it, and the box
 * you were talking into is then behind a dialog you cannot see through. Left
 * running, the microphone keeps appending to that hidden box: you start
 * dictating, think better of it, tap "+" to log an expense instead, and half a
 * sentence you had forgotten about is sitting in the assistant composer the
 * next time you look. That is the two-microphones confusion in a new hat — one
 * box now, but an invisible one.
 *
 * Stopping is not discarding. Every word already transcribed stays in the
 * composer, because it is what was said; only the live session ends, and the
 * mic button goes back to looking like what it is.
 */
let stopActiveDictation: (() => void) | null = null;

function registerDictation(stop: () => void) {
  stopActiveDictation = stop;
}

function releaseDictation(stop: () => void) {
  // Only if it is still ours: a component tidying up after itself must not
  // cancel a session that has since been started by another one.
  if (stopActiveDictation === stop) stopActiveDictation = null;
}

/** End dictation from outside the composer. A no-op when nothing is listening. */
export function stopAssistantDictation() {
  stopActiveDictation?.();
}

/** Openers that show what it's for, chosen from what the account can actually see. */
function suggestionsFor(access: ModuleAccess): string[] {
  // Deliberately weighted towards DOING rather than asking. The assistant
  // could always answer questions; what Alan wanted was one that changes
  // things, and an opener list of questions taught the opposite.
  const all: { module: keyof ModuleAccess | null; text: string }[] = [
    { module: "workout", text: "Log bench press, 135 for 8, three sets" },
    { module: "money", text: "Log $42 at Superstore on groceries" },
    { module: "tasks", text: "Add a task to renew my passport on the 3rd" },
    { module: "shopping", text: "Add milk and eggs to the shopping list" },
    { module: "money", text: "Set my groceries budget to $600 a month" },
    { module: "tasks", text: "Move the dentist task to next Tuesday" },
    { module: "money", text: "What did I spend on groceries this month?" },
    { module: "money", text: "Write me a summary of last month's money" },
  ];
  return all.filter((s) => s.module === null || access[s.module]).map((s) => s.text).slice(0, 4);
}

/**
 * The buttons under a reply that offered to change something.
 *
 * Alan's "how bold should the AI be" setting is `suggest`, which means the
 * assistant does not log an expense, move a transaction, set a budget or touch
 * a savings goal on its own — it says what it would do and puts this under the
 * sentence. Everything else it can do still just happens; see
 * lib/ai/boldness.ts for why money is the line and nothing else is.
 *
 * THE LABEL IS BUILT ON THE SERVER FROM THE ARGUMENTS THAT WILL RUN, never by
 * the model, so the words on the button and the thing the button does cannot
 * disagree. Do not "improve" this by rendering something the model wrote.
 *
 * The tap sends a message id and a POSITION and nothing else — no tool name,
 * no arguments. That is what stops this being a general-purpose write endpoint
 * anyone signed in could post to, and it is why a taken proposal is marked
 * rather than removed: the position has to keep meaning the same thing.
 */
function ProposalButtons({
  messageId,
  proposals,
}: {
  messageId: string | null | undefined;
  proposals: AssistantProposal[] | undefined;
}) {
  // Optimistic done-state layered on top of the server's own `actedAt`, exactly
  // as the Today outlook does it: the server never reorders or shortens the
  // list, so an index means the same proposal before and after a revalidate.
  // This only covers the gap between the action returning and fresh props.
  const [done, setDone] = useState<number[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  if (!messageId || !proposals || proposals.length === 0) return null;
  // Nothing left to offer. The reply's own words already said what happened,
  // so a row of "Done" ticks under an old message is noise — but a proposal
  // taken in THIS session keeps its tick, so the tap has a visible result.
  if (proposals.every((p) => p.actedAt) && done.length === 0) return null;

  async function act(index: number) {
    setBusy(index);
    const result = await runAssistantProposal({ messageId: messageId!, index });
    setBusy(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setDone((d) => [...d, index]);
  }

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-hairline pt-2">
      {proposals.map((p, i) =>
        p.actedAt || done.includes(i) ? (
          // Always the label, never a bare "Done". After a reload the server's
          // own `actedAt` is what marks it, and a row of anonymous ticks under
          // an old answer tells you something happened without telling you what.
          //
          // The tick is for things that HAPPENED. An entry the app could no
          // longer read is stamped so that nothing offers it (see
          // `sanitiseProposals`), but it did not succeed, and a green tick
          // beside "This one can't be read any more." says the opposite of
          // what that sentence says.
          //
          // Recognised by its empty tool name rather than by importing the
          // sentinel, so `boldness.ts` stays a type-only import here and no
          // runtime module crosses into the browser bundle for one icon. An
          // empty `tool` is exactly what `sanitiseProposals` guarantees for an
          // unreadable entry and nothing else, and a test pins that.
          <Micro key={i} className="flex items-center gap-1.5 py-1">
            {!p.tool ? (
              <AlertCircle className="size-3.5 text-muted-foreground" strokeWidth={2.5} />
            ) : (
              <Check className="size-3.5 text-ok" strokeWidth={3} />
            )}
            {p.label}
          </Micro>
        ) : (
          <Button
            key={i}
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => act(i)}
          >
            {busy === i ? "Working…" : p.label}
          </Button>
        )
      )}
    </div>
  );
}

function toChatMessages(conversation: StoredConversation): ChatMessage[] {
  return conversation.messages.map((m) => ({
    key: m.id,
    role: m.role,
    content: m.content,
    actions: m.actions ?? [],
    messageId: m.id,
    proposals: m.proposals,
  }));
}

/**
 * Add a finished exchange to a transcript — unless it is already the end of it.
 *
 * The duplicate is a real case, not a theoretical one: close the sheet
 * mid-answer and reopen, and the transcript is re-read from the database at
 * the same moment the answer lands. If the save got in first the pair is in
 * both, and appending blind shows the same question and answer twice.
 */
function withExchange(
  previous: ChatMessage[],
  asked: ChatMessage,
  answered: ChatMessage
): ChatMessage[] {
  const last = previous[previous.length - 1];
  const beforeLast = previous[previous.length - 2];
  const alreadyThere =
    last?.role === "assistant" &&
    last.content === answered.content &&
    beforeLast?.role === "user" &&
    beforeLast.content === asked.content;
  if (alreadyThere) return previous;
  return [...previous, asked, answered];
}

/**
 * The most recent QUESTION in a stored transcript — by the time the database
 * wrote it down, not by where it happens to sit in the array.
 *
 * Exists for the "did it get through?" check below, which must not answer yes
 * because the same words appear somewhere further up. The stored messages
 * carry `createdAt` precisely so "newest" can be a fact instead of a guess.
 */
function newestStoredQuestion(
  messages: readonly StoredAssistantMessage[]
): StoredAssistantMessage | null {
  let newest: StoredAssistantMessage | null = null;
  let newestAt = -Infinity;
  for (const message of messages) {
    if (message.role !== "user") continue;
    const parsed = Date.parse(message.createdAt);
    // A stamp that will not parse must not beat a real one on nonsense, and
    // must not lose the message either: it falls back to the transcript's own
    // order, which is the order on screen.
    const when = Number.isNaN(parsed) ? newestAt : parsed;
    if (newest === null || when >= newestAt) {
      newest = message;
      newestAt = when;
    }
  }
  return newest;
}

export function AssistantChat({
  configured,
  initialUsage = null,
  moduleAccess,
  initialQuestion = null,
  questionKey = null,
  initialConversation,
  variant = "page",
  inputRef: providedInputRef,
  timeZone = APP_TIMEZONE,
  onUsage,
}: {
  /**
   * Whether an AI key exists. `undefined` means "not known yet" — the capture
   * sheet fetches this lazily and the box must be typeable before it lands.
   * Only an explicit `false` blocks the composer; if the key really is missing
   * the server says so in the conversation, which is where the answer would
   * have been.
   */
  configured?: boolean;
  initialUsage?: UsageSummary | null;
  moduleAccess: ModuleAccess;
  /**
   * A question that was already asked somewhere else. The capture sheet no
   * longer uses this — it holds a real conversation now — but a launcher
   * shortcut or an old bookmark can still arrive at /assistant?q=…, and those
   * words must be asked rather than dropped.
   */
  initialQuestion?: string | null;
  /**
   * A token unique to each handover. Identifies the ASK, not the words — so
   * the same sentence sent twice is asked twice.
   */
  questionKey?: string | null;
  /**
   * The stored conversation, already fetched on the server. Pass it and this
   * component renders the transcript on its first paint. Leave it `undefined`
   * — which the sheet does, having no server page of its own — and it is
   * fetched here on mount instead.
   */
  initialConversation?: { conversation: StoredConversation | null; error?: string };
  /** `page` is the full screen; `sheet` is inside the capture sheet. */
  variant?: "page" | "sheet";
  /**
   * The sheet's `initialFocus` target. Handed in rather than owned here so the
   * sheet can put the cursor in this box on open WITHOUT keeping a second
   * textarea of its own — which is what it used to do, and which meant two
   * boxes and two microphones could exist at once.
   */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** The account's timezone, for stamping past chats. */
  timeZone?: string;
  /** Lets a parent that outlives this component remember the running cost. */
  onUsage?: (usage: UsageSummary) => void;
}) {
  const aiBlocked = configured === false;
  const sheet = variant === "sheet";

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialConversation?.conversation ? toChatMessages(initialConversation.conversation) : []
  );
  const [title, setTitle] = useState<string | null>(
    initialConversation?.conversation?.title ?? null
  );
  /**
   * The three things that outlive this mount, read from the one shared store
   * above rather than held here. `useSyncExternalStore` is the supported way
   * to read a store that lives outside React, and this one deliberately does.
   *
   * Read it here, ONCE, and derive everything from it — there is no second
   * copy of "which chat am I in" in this component to fall out of step.
   */
  const shared = useSyncExternalStore(subscribeShared, readShared, readServerShared);
  const live = shared.exchange;
  const pendingAsks = shared.queue;
  const conversationId = intentConversationId(shared.intent);

  /**
   * Write down which thread this tab is in. The ONLY writer of that value.
   *
   * `deliberate` is the whole distinction: `false` means "I haven't looked
   * yet" (resume — the server may hand back the chat you were last in), `true`
   * means "I am deliberately in no chat" (fresh — always start a new thread).
   * Getting it wrong after a delete files your next question into a
   * conversation you never opened. It is written to the shared store, so it
   * survives the sheet being closed and reopened.
   */
  function adoptConversation(id: string | null, deliberate = false) {
    setChatIntent(
      id ? { mode: "specific", id } : deliberate ? { mode: "fresh" } : { mode: "resume" }
    );
  }

  // Nothing to wait for when the server already sent the conversation down —
  // and nothing to wait for when this tab is deliberately in no chat either,
  // because that state has nothing to fetch. Both are known at first render,
  // so they are decided here rather than corrected from an effect afterwards:
  // setting it false inside the effect would paint one frame of "Catching up…"
  // over a chat that was never loading, and is a cascading render besides.
  const [loadingConversation, setLoadingConversation] = useState(
    () => initialConversation === undefined && readChatIntent().mode !== "fresh"
  );

  // With no AI key there is nothing to send a handed-over question to, so it
  // starts life in the box instead of vanishing — whatever was typed is still
  // there once the key is added. Seeded here rather than set from an effect:
  // the value is known at first render, and setting state inside an effect
  // would paint an empty box first.
  const [input, setInput] = useState(aiBlocked && initialQuestion ? initialQuestion : "");
  // ...and again for every handover after the first. Seeding initial state
  // only covers the case where this screen MOUNTS with a question; arriving
  // with a second one is a soft navigation, so this component re-renders with
  // new props rather than remounting and the seed above never runs again.
  // This is the adjust-state-during-render pattern used in money-shell.tsx:
  // compare the incoming identity with the one already adopted and set state
  // DURING render, which React re-runs immediately without painting.
  const askIdentity = initialQuestion ? questionKey ?? initialQuestion : null;
  const [adoptedAskIdentity, setAdoptedAskIdentity] = useState(askIdentity);
  if (askIdentity !== adoptedAskIdentity) {
    setAdoptedAskIdentity(askIdentity);
    if (aiBlocked && initialQuestion) setInput(initialQuestion);
  }

  // Busy until the outcome has been TAKEN, not merely arrived — a landed
  // exchange still waiting on a loading transcript is not a free composer.
  const thinking = live !== null;

  const [usage, setUsage] = useState<UsageSummary | null>(initialUsage);
  // The cost line arrives LATE in the sheet. Its data is fetched lazily on the
  // first open so the box is typeable immediately, which means this component
  // mounts with no usage figure and is handed one a moment later — and a prop
  // that only seeds initial state would have been ignored, leaving the caption
  // missing until a question was asked. Adopted during render (the
  // money-shell.tsx pattern) rather than from an effect, so there is no frame
  // without it. A figure this component has already updated from a real reply
  // is newer than anything arriving now, and wins.
  const [adoptedUsage, setAdoptedUsage] = useState(initialUsage);
  if (initialUsage !== adoptedUsage) {
    setAdoptedUsage(initialUsage);
    if (initialUsage && !usage) setUsage(initialUsage);
  }
  // Seeded from the server read when there was one and it failed. A
  // conversation that could not be READ is worth saying out loud — unlike
  // `conversation: null`, which just means nothing has been asked yet.
  const [notice, setNotice] = useState<string | null>(initialConversation?.error ?? null);
  /**
   * A question whose answer may or may not exist, after the connection dropped
   * mid-ask. Non-null puts a "check if it got through" button under the
   * notice: re-reading the chat is free, where asking again costs money and
   * files the same exchange twice.
   */
  const [unsureAbout, setUnsureAbout] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const ownInputRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = providedInputRef ?? ownInputRef;
  /** Local render keys for messages that have no database id yet. */
  const localKeyRef = useRef(0);
  function nextKey() {
    localKeyRef.current += 1;
    return `local-${localKeyRef.current}`;
  }

  /**
   * Whether the sheet's chat is showing its transcript.
   *
   * The sheet opens SHORT — one line saying which chat you are in, the box,
   * and the running cost — because the sheet's other job is the four capture
   * chips underneath, and a full transcript with a phone keyboard up pushed
   * them off the screen. Tapping that line, or asking anything, opens it out.
   * On /assistant, where the chat is the whole point, it is always open.
   */
  const [expanded, setExpanded] = useState(false);

  // ---------------- Past chats ----------------
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [confirming, setConfirming] = useState<ConversationSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  /**
   * True while this component does not yet know which thread it is in — the
   * first load, a switch to another chat, a delete in progress.
   *
   * The composer stays live through all three, which is the point: nothing
   * about "still catching up" should stop you typing. It is the SENDING that
   * waits, in the queue below, where the words can be seen waiting.
   */
  const notReady = loadingConversation || switching || deleting;

  // Dictation. Whether the browser has speech recognition is a CLIENT-ONLY
  // fact: reading it during render would differ between the server pass and
  // the client one and produce a hydration mismatch on the composer, and
  // setting it from an effect is a cascading render (and a lint error).
  // `useSyncExternalStore` is the built-in answer to exactly this — a server
  // snapshot of false, a client snapshot of the real value, and no extra
  // render. It never changes after load, so the subscribe function is a no-op.
  const canDictate = useSyncExternalStore(
    () => () => {},
    () => speechSupported(),
    () => false
  );
  const [listening, setListening] = useState(false);
  const dictationRef = useRef<Dictation | null>(null);
  /** What was already typed before the mic opened, so speech appends. */
  const beforeSpeechRef = useRef("");
  /**
   * True when something OUTSIDE this composer ended the session — the capture
   * sheet opening over the top of it. The words stay; the cursor must NOT be
   * pulled back into a box that is now behind a dialog.
   */
  const externallyStoppedRef = useRef(false);
  /** This component's entry in the module-wide registry above, if any. */
  const stopHandleRef = useRef<(() => void) | null>(null);

  function forgetDictation() {
    dictationRef.current = null;
    if (stopHandleRef.current) {
      releaseDictation(stopHandleRef.current);
      stopHandleRef.current = null;
    }
  }

  // Stop the microphone if the screen is left — or the sheet closed —
  // mid-sentence. In the sheet that unmount IS the close, which is exactly
  // when a still-listening mic would otherwise keep typing into nothing.
  useEffect(
    () => () => {
      dictationRef.current?.stop();
      if (stopHandleRef.current) releaseDictation(stopHandleRef.current);
    },
    []
  );

  function toggleDictation() {
    if (listening) {
      dictationRef.current?.stop();
      return;
    }
    externallyStoppedRef.current = false;
    beforeSpeechRef.current = input ? `${input.trim()} ` : "";
    const session = startDictation({
      onText: (text) => setInput(beforeSpeechRef.current + text),
      onDone: (error) => {
        // The browser fires this whenever the session ends, however it ended —
        // which is what keeps the mic button honest when the stop came from
        // somewhere other than the button itself.
        setListening(false);
        forgetDictation();
        if (error === "not-allowed" || error === "service-not-allowed") {
          setNotice("Microphone access is blocked. Allow it in your browser settings to talk to it.");
        } else if (error) {
          setNotice("The microphone stopped working. Type it instead.");
        }
        // What was transcribed is already in the box either way; this is only
        // about where the cursor goes next. Nowhere, if the sheet took over.
        const external = externallyStoppedRef.current;
        externallyStoppedRef.current = false;
        if (!external) inputRef.current?.focus();
      },
    });
    if (!session) {
      setNotice("Dictation isn't available in this browser. Type it instead.");
      return;
    }
    dictationRef.current = session;
    // Registered only while a session is genuinely live, so
    // `stopAssistantDictation` does nothing the rest of the time.
    const handle = () => {
      if (!dictationRef.current) return;
      externallyStoppedRef.current = true;
      dictationRef.current.stop();
    };
    stopHandleRef.current = handle;
    registerDictation(handle);
    setNotice(null);
    setListening(true);
  }

  const suggestions = suggestionsFor(moduleAccess);

  // ---------------- The queue ----------------
  //
  // Questions that could not go out at the moment they were sent — because an
  // answer was still coming back, or because this component did not yet know
  // which thread it was in. They wait ON SCREEN and go the instant the way is
  // clear. A LIST, not one slot: a single slot meant a third question silently
  // overwrote the second, which is the exact loss this prevents.
  //
  // The queue itself lives in the shared store at the top of this file, NOT in
  // component state, for the same reason the in-flight exchange does: closing
  // the capture sheet unmounts this component, and a queue that died with it
  // threw away words nobody had answered yet. `pendingAsks` above is the same
  // list, read for rendering; `enqueueAsk` / `takeNextAsk` / `clearQueue` write
  // it synchronously, which is what `send` and the drain below need.

  /**
   * Hands unsendable questions back to the composer rather than dropping them.
   *
   * They are APPENDED, never discarded: a rescued question used to be thrown
   * away whenever the box already had something in it, so a queued question
   * that failed while you were half-way through typing something else was
   * gone. Nothing had been paid for, but the words were still lost — and
   * losing words is the one thing this screen must never do.
   */
  function returnToComposer(questions: string[]) {
    const words = questions.filter(Boolean).join(NEWLINE);
    if (!words) return;
    setInput((current) => {
      const kept = current.trimEnd();
      if (!kept) return words;
      // One per line, under whatever was being typed, so both survive and it
      // is obvious which is which.
      return `${kept}${NEWLINE}${words}`;
    });
  }

  /**
   * Take one rescued question back OUT of the composer — used when the check
   * below proves it did get through, so the box is not left holding a question
   * that has already been answered. Only that question goes — however many
   * lines it runs to; anything else typed around it stays.
   */
  function dropFromComposer(question: string) {
    setInput((current) => {
      if (current.trim() === question) return "";
      // The question can itself contain line breaks — dictated, or pasted in —
      // so this looks for the whole BLOCK of text rather than a single line. A
      // line-by-line match quietly failed on those and left the question
      // sitting in the box, ready to be sent (and paid for) a second time.
      //
      // The match still has to start and end on line boundaries, so a question
      // that happens to be a fragment of a longer sentence being typed is left
      // alone. Searched from the end, because the rescued copy is always the
      // one appended last.
      let at = -1;
      let from = current.length;
      for (;;) {
        const found = current.lastIndexOf(question, from);
        if (found === -1) break;
        const end = found + question.length;
        const startsLine = found === 0 || current[found - 1] === NEWLINE;
        const endsLine = end === current.length || current[end] === NEWLINE;
        if (startsLine && endsLine) {
          at = found;
          break;
        }
        if (found === 0) break;
        from = found - 1;
      }
      if (at === -1) return current;
      // The line break that joined it on goes too, so removing the question
      // does not leave a blank gap in the middle of what is still being typed.
      const kept = `${at > 0 ? current.slice(0, at - 1) : ""}${current.slice(
        at + question.length
      )}`;
      return kept.trim() ? kept.trimEnd() : "";
    });
  }

  // ---------------- Load the conversation ----------------
  //
  // Only when nobody handed one down. On /assistant the page has already read
  // it on the server, so this never runs there and the transcript is on screen
  // in the first paint; in the sheet it runs once per open, which is one
  // indexed lookup and is what makes "carry on where I left off" true from any
  // screen in the app.
  //
  // `conversation: null` is NOT an error. It is an account that has never
  // asked anything, and it renders as the openers, exactly like a new chat.
  useEffect(() => {
    if (initialConversation !== undefined) {
      // The page read it on the server — a "wherever I left off" read — and
      // the transcript on screen IS whatever that resolved to, so that is the
      // thread this tab is now in. Written down for the sheet, which is opened
      // from other screens and otherwise has no way of knowing.
      const served = initialConversation.conversation?.id ?? null;
      if (served === null && initialConversation.error) {
        // The read FAILED. Nothing came back, but that is a fact about the
        // database being unreachable, not about which chat this tab is in — so
        // the intent it already had is kept, whole. Writing one here turned a
        // named chat, or a deliberate blank, into "resume", and the next
        // question was then filed into whichever thread happened to be newest.
        // The notice seeded from that same error already says the last chat
        // couldn't be loaded.
        return;
      }
      // Nothing came back, so there is no thread to be in — and a deliberate
      // blank stays deliberate rather than quietly turning back into "resume".
      adoptConversation(served, served === null && readChatIntent().mode === "fresh");
      return;
    }
    let cancelled = false;
    // Whichever thread this tab was last in — INCLUDING "deliberately none",
    // which survives this mount because it lives in the shared store rather
    // than in the component that was just thrown away. That case asks the
    // server for nothing and correctly gets nothing back; the intent must not
    // be downgraded to "resume" because of it, which is precisely the bug that
    // filed a fresh question into an unrelated chat.
    const intentOnMount = readChatIntent();
    // A deliberate blank has nothing to fetch — the server is obliged to answer
    // "the chat I am in" with nothing, and a blank chat is already what is on
    // screen. Skipping the round trip is also what makes reopening the sheet in
    // that state instant instead of a query that can only say "no". The
    // loading flag was already seeded false for this case at first render, so
    // there is nothing to unset here.
    if (intentOnMount.mode === "fresh") return;
    const target = intentArgument(intentOnMount);
    void (async () => {
      try {
        const result = await getConversation(target);
        if (cancelled) return;
        if (result.error) {
          setNotice(result.error);
          return;
        }
        if (result.conversation) {
          adoptConversation(result.conversation.id);
          setTitle(result.conversation.title);
          setMessages(toChatMessages(result.conversation));
          return;
        }
        // Asked for one chat in particular and it is not there any more —
        // deleted in another tab. The screen is showing a blank chat, so the
        // next question must START one rather than quietly resuming whatever
        // thread happens to be newest. "Resume" that found nothing and "fresh"
        // are both already right, and are left exactly as they are.
        if (intentOnMount.mode === "specific") adoptConversation(null, true);
      } catch {
        // A rejection is the connection, not the database. Losing the
        // scrollback is survivable and the composer below stays live, so this
        // says what happened and gets out of the way.
        if (!cancelled) {
          setNotice("Couldn't load your last chat — you can still ask something new.");
        }
      } finally {
        if (!cancelled) setLoadingConversation(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount only. `initialConversation` is a prop that either exists for the
    // life of this component or never does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A question handed over in the address bar, asked once each.
  //
  // The guard remembers WHICH ask this was, not merely that one happened: a
  // second `?q=` arriving is a soft navigation, so this component re-renders
  // rather than remounting, and a plain "have we asked?" boolean would swallow
  // the second question in silence. Whether it can go out this second is
  // `send`'s decision, not a second copy of that rule here — a question handed
  // over while the chat is still loading queues, in view, and goes when it can.
  //
  // The `?q=` is then wiped from the address bar with the browser's own
  // history API rather than the Next router, deliberately — a router replace
  // would re-render this screen from the server and throw away the
  // conversation that is at that moment mid-flight. This way a pull-to-refresh
  // lands on a clean Assistant instead of silently asking the same thing again.
  const askedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialQuestion) return;
    // Fall back to the words when no token came along, so a hand-typed
    // /assistant?q=… link still behaves.
    const identity = questionKey ?? initialQuestion;
    if (askedKeyRef.current === identity) return;
    askedKeyRef.current = identity;
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/assistant");
    }
    // No key: the question is already sitting in the box (seeded into `input`
    // above), so there is nothing to do but leave it there.
    if (aiBlocked) return;
    void send(initialQuestion);
    // `send` is redefined every render and is not a dependency worth chasing —
    // this must run exactly once per handover, which the ref above guarantees.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion, questionKey, aiBlocked]);

  /**
   * Ask it — or, if it cannot be asked this second, put it in the queue where
   * it can be SEEN waiting.
   *
   * Nothing is written into the transcript here. The question lives in the
   * shared store until the whole exchange is complete, which is what stops a
   * conversation still loading in the background from painting over it: the
   * bug where the question vanished, and then took the entire scrollback with
   * it when the answer landed.
   */
  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || aiBlocked) return;

    // Sending ends dictation — otherwise the mic keeps appending to a box
    // that has already been cleared.
    dictationRef.current?.stop();
    // Asking is leaving the past-chats list, whether or not it was open, and
    // the answer is worth making room for.
    setHistoryOpen(false);
    setExpanded(true);
    // Clear the box only when the box is what was sent. A question drained
    // from the queue has nothing to do with whatever is sitting here
    // half-typed, and wiping it would be the last remaining way for words to
    // go missing on this screen.
    setInput((current) => (current.trim() === trimmed ? "" : current));

    // Busy, or not yet sure which thread this is. Either way the words wait
    // rather than being lost or filed into the wrong conversation.
    if (thinking || notReady) {
      enqueueAsk(trimmed);
      return;
    }

    setNotice(null);
    setUnsureAbout(null);
    setLiveExchange({ status: "asking", question: trimmed });
    // A chat is named after its first question, and the DATABASE does the
    // naming — but not until the answer lands. Showing it now costs nothing
    // and is the same sentence, from the same pure helper the server uses.
    if (messages.length === 0 && !title) setTitle(conversationTitle(trimmed));

    // Which chat this belongs to, from the ONE value that holds it: an id,
    // explicit `null` for a deliberate blank, or the key left off entirely for
    // "wherever I left off". NO `history` ARGUMENT — the server reads the
    // conversation back out of the database, which is the only copy that
    // reflects what has been deleted.
    const conversationArgument = intentArgument(readChatIntent());
    let outcome: LiveExchange | null = null;
    try {
      const reply = await ask(
        conversationArgument === undefined
          ? { question: trimmed }
          : { question: trimmed, conversationId: conversationArgument }
      );
      outcome = { status: "landed", question: trimmed, reply };
    } catch {
      // A rejection is the connection, not the model — and it says nothing
      // about whether the question got there. It may have been answered,
      // saved and paid for, so this never pretends nothing happened.
      outcome = {
        status: "failed",
        question: trimmed,
        message:
          "Couldn't reach the assistant. Your question may still have gone through and been paid for — check before asking it again.",
        mayHaveLanded: true,
      };
    } finally {
      // Whatever happened, the screen stops saying "Looking…" — and the
      // outcome is published even if this component was unmounted while it
      // waited, so the next chat to open picks it up.
      setLiveExchange(
        outcome ?? {
          status: "failed",
          question: trimmed,
          message: "Something went wrong sending that. Try again.",
          mayHaveLanded: false,
        }
      );
    }
  }

  /**
   * Take whatever the store is holding and put it on screen.
   *
   * Deliberately an effect rather than the tail of `send`: the chat that
   * STARTED an exchange may not be the chat that finishes it — close the sheet
   * mid-answer and reopen it and a different mount receives the reply — and
   * this way both cases run the same code.
   *
   * It waits for a conversation that is still loading, so the exchange is
   * appended to the real transcript instead of being wiped by it a moment
   * later.
   */
  useEffect(() => {
    if (!live || live.status === "asking") return;
    if (loadingConversation) return;

    // Deferred by one tick rather than run straight down the effect body: this
    // reacts to an EXTERNAL store (the live exchange, which outlives any one
    // mount), and settling it touches half a dozen pieces of local state at
    // once. Doing that synchronously inside an effect is a cascading render —
    // and a lint error. Nothing is painted in between, so the transcript never
    // shows a half-settled exchange. Same shape as the shopping list's sync.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      settleLiveExchange();
    });
    return () => {
      cancelled = true;
    };

    function settleLiveExchange() {
      if (!live || live.status === "asking") return;

    if (live.status === "failed") {
      setNotice(live.message);
      setUnsureAbout(live.mayHaveLanded ? live.question : null);
      // Whatever was queued behind it cannot be asked either — hand it all
      // back to the box rather than dropping it.
      returnToComposer([live.question, ...clearQueue()]);
      setLiveExchange(null);
      setExpanded(true);
      return;
    }

    const { reply } = live;
    setUsage(reply.usage);
    onUsage?.(reply.usage);
    // Whatever thread this landed in is the thread the next question
    // continues — including one the server had to create just now. A null
    // means there is still NO chat (nothing could be answered, so nothing was
    // created on purpose), which says nothing about where this tab is: leave
    // the intent alone rather than quietly turning a deliberate blank, or the
    // chat we are actually in, into "resume".
    if (reply.conversationId && reply.conversationId !== intentConversationId(readChatIntent())) {
      adoptConversation(reply.conversationId);
    }

    if (reply.unavailable) {
      setNotice(reply.unavailable);
      setUnsureAbout(null);
      returnToComposer([live.question, ...clearQueue()]);
      setLiveExchange(null);
      setExpanded(true);
      return;
    }

    // Both halves carry the same `unsaved` flag: if nothing could be written
    // down, the question is as gone as the answer.
    const asked: ChatMessage = {
      key: nextKey(),
      role: "user",
      content: live.question,
      unsaved: !reply.persisted,
    };
    const answered: ChatMessage = {
      key: nextKey(),
      role: "assistant",
      content: reply.text,
      actions: reply.actions,
      unsaved: !reply.persisted,
      messageId: reply.messageId,
      proposals: reply.proposals,
    };
      setMessages((previous) => withExchange(previous, asked, answered));
      setLiveExchange(null);
      setExpanded(true);
    }
    // Everything else touched here is a ref or a setter, neither of which is
    // worth re-running this for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, loadingConversation]);

  /**
   * Drain the queue: one at a time, oldest first, and only when there is
   * genuinely nothing in the way. An effect rather than the tail of `send`
   * because the thing being waited on is just as often a conversation still
   * loading as it is an answer still coming back.
   *
   * The list itself is in the shared store, so the mount that drains it need
   * not be the mount that filled it: close the capture sheet with questions
   * waiting and they are still waiting — and still go — when it is opened
   * again. Held in component state they were thrown away with the sheet, which
   * is the loss this queue exists to prevent, arriving by another door.
   */
  useEffect(() => {
    if (pendingAsks.length === 0) return;
    if (thinking || notReady || aiBlocked) return;
    const next = takeNextAsk();
    if (next) void send(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAsks, thinking, notReady, aiBlocked]);

  // ---------------- Memory, made visible ----------------

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const result = await listConversations();
      if (result.error) {
        setNotice(result.error);
        return;
      }
      setConversations(result.conversations);
    } catch {
      setNotice("Couldn't load your past chats — check your connection and try again.");
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    setNotice(null);
    // Fetched on the tap, never on mount: most opens of this chat never ask
    // for the list, and the list is the only extra round trip memory costs.
    if (next) void loadHistory();
  }

  /**
   * Re-read the chat after a dropped connection, instead of paying twice.
   * Free, unlike asking again, and it answers the only question that matters:
   * did it get through?
   *
   * WHERE it looks depends on the intent the question went out with, which is
   * the whole reason that is one value. In a DELIBERATELY blank chat there is
   * no id to re-read: asking the server for "the chat I am in" is contractually
   * answered with nothing, and this used to report that nothing as "it didn't
   * get through — nothing was saved and nothing was charged". That is a false
   * statement about Alan's money, and it pushes him into paying for the same
   * answer twice — the exact duplicate this button exists to prevent. A fresh
   * ask CREATES a chat as it lands, so in that state it looks where such an
   * exchange would actually have gone: the account's most recently used chat.
   *
   * And it never claims "nothing was charged". An answer can be paid for and
   * still fail to save. Not finding it is evidence, not proof, and this says so
   * rather than deciding for him.
   *
   * WHAT COUNTS AS FOUND is the NEWEST exchange in the chat, never the same
   * words somewhere in it. Ask one short sentence twice ("what's due today?"),
   * have the second one fail, and matching anywhere reports it delivered on the
   * strength of the first — while the screen shows the answer to the first. An
   * older copy is a "can't tell", not a yes.
   */
  async function recheck() {
    const question = unsureAbout;
    if (!question) return;
    const intentNow = readChatIntent();
    // "Fresh" has no id of its own; the thread it would have created is now the
    // most recent one, which is what an omitted argument returns.
    const lookIn = intentNow.mode === "fresh" ? undefined : intentArgument(intentNow);
    /** True when what came back is "your most recent chat", not one named chat. */
    const checkedMostRecent = lookIn === undefined;
    setRechecking(true);

    let result: Awaited<ReturnType<typeof getConversation>>;
    try {
      result = await getConversation(lookIn);
    } catch {
      // A check that could not be completed knows nothing, so it asserts
      // nothing. The notice and this button both stay: checking again is free.
      toast.error("Still can't reach it — try again in a moment.");
      return;
    } finally {
      setRechecking(false);
    }

    if (result.error) {
      toast.error(result.error);
      return;
    }

    const found = result.conversation;
    const loaded = found ? toChatMessages(found) : [];
    const stored = found?.messages ?? [];
    /**
     * Did THIS ask land — which is the NEWEST exchange in the chat, not the
     * same words anywhere in it. Ask one short sentence twice ("what's due
     * today?"), have the second one fail, and a match-anywhere check points at
     * the first and reports the second delivered, while the screen is showing
     * the answer to the first. In the fresh case it could point at an older
     * question in somebody else's thread entirely.
     */
    const newestAsked = newestStoredQuestion(stored);
    const landed = newestAsked?.content === question;
    /**
     * The words are in the chat, but only as an OLDER exchange. That is
     * evidence of nothing — it is the same question from before, not proof
     * this one arrived — so it is reported as "can't tell", never as "yes".
     * This button exists to stop a second paid ask, and confidence it hasn't
     * earned is the one outcome worse than an honest shrug.
     */
    const olderCopyOnly =
      !landed && stored.some((m) => m.role === "user" && m.content === question);

    if (found && landed) {
      // It is in the database, so it was answered, saved and paid for. Adopt
      // that thread — in the fresh case this is the chat the question created.
      adoptConversation(found.id);
      setTitle(found.title);
      setMessages(loaded);
      setUnsureAbout(null);
      setNotice(null);
      setExpanded(true);
      // The rescued copy in the box is now the same question a second time.
      dropFromComposer(question);
      toast.success("It did get through — the answer is here.");
      return;
    }

    setUnsureAbout(null);
    if (found && intentNow.mode !== "fresh") {
      // Not the question, but this IS the chat it would have been filed in, as
      // it stands right now — worth showing, so the screen and the sentence
      // below agree. Deliberately NOT done in the fresh case: that chat belongs
      // to somebody else's question, and adopting it is how a blank chat
      // quietly turns back into an old thread.
      adoptConversation(found.id);
      setTitle(found.title);
      setMessages(loaded);
      setExpanded(true);
    }
    if (found && olderCopyOnly) {
      // The words are there, but as an older exchange. Honest shrug, not a yes.
      setNotice(
        "The only copy of that question in your chat is an older one, from before — so I can't tell whether this one got through, and I can't promise it wasn't charged. It's back in the box: open Chats to look for yourself before sending it again."
      );
      return;
    }
    if (found) {
      // Read a chat, and the question is not in it. Likely, not certain.
      setNotice(
        "I couldn't find that question saved in your chat, so it probably didn't get through — but I can't promise it wasn't charged. It's back in the box: open Chats to look for yourself before sending it again."
      );
      return;
    }
    if (checkedMostRecent) {
      // Asked for the newest chat on the account and there isn't one, so
      // nothing was written down at all.
      setNotice(
        "Nothing was saved — there are no chats on your account, so it almost certainly didn't get through. The question is back in the box, ready to send again."
      );
      return;
    }
    // The chat it would have been saved in has since been deleted, so there is
    // nowhere left to look. Say that, rather than guessing either way.
    setNotice(
      "I can't tell whether that one went through — the chat it belonged to is gone. Open Chats to check before sending it again. The question is back in the box."
    );
  }

  async function handleNewChat() {
    // Everything needed to put the screen back exactly as it was if the new
    // chat can't be started — a blanked transcript with no replacement is the
    // one outcome worse than the error itself.
    const previous = { intent: readChatIntent(), title, messages };

    /** Back into the thread it was in — the whole intent, not merely the id. */
    function restoreThread() {
      setChatIntent(previous.intent);
      setTitle(previous.title);
      setMessages(previous.messages);
    }

    setSwitching(true);
    setHistoryOpen(false);
    setNotice(null);
    setUnsureAbout(null);
    setMessages([]);
    setTitle(null);
    // DELIBERATELY no conversation, not "haven't looked yet". Anything sent
    // during the wait below queues (`notReady` covers `switching`), and if it
    // somehow got past that, an explicit blank starts a new thread rather than
    // filing the question back into the chat that was just left.
    adoptConversation(null, true);

    let result: Awaited<ReturnType<typeof startConversation>>;
    try {
      result = await startConversation();
    } catch {
      restoreThread();
      toast.error("Couldn't start a new chat — check your connection and try again.");
      return;
    } finally {
      setSwitching(false);
    }

    if (result.error) {
      restoreThread();
      toast.error(result.error);
      return;
    }

    adoptConversation(result.conversationId ?? null, true);
    // Any list already on screen is now missing the thread just created.
    setConversations(null);
    inputRef.current?.focus();
  }

  async function openConversation(summary: ConversationSummary) {
    if (summary.id === intentConversationId(readChatIntent())) {
      setHistoryOpen(false);
      return;
    }
    setSwitching(true);
    setNotice(null);
    setUnsureAbout(null);

    let result: Awaited<ReturnType<typeof getConversation>>;
    try {
      result = await getConversation(summary.id);
    } catch {
      toast.error("Couldn't open that chat — check your connection and try again.");
      return;
    } finally {
      setSwitching(false);
    }

    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (!result.conversation) {
      // Deleted somewhere else between this list being drawn and the tap.
      toast.error("That chat has already been deleted.");
      setConversations((prev) => prev?.filter((c) => c.id !== summary.id) ?? prev);
      return;
    }

    adoptConversation(result.conversation.id);
    setTitle(result.conversation.title);
    setMessages(toChatMessages(result.conversation));
    setHistoryOpen(false);
  }

  async function handleDelete() {
    const target = confirming;
    if (!target) return;
    // An answer is on its way in. Deleting now would put that exchange on
    // screen under a chat that no longer exists — nothing is misfiled, because
    // the server turns a dead id into a new thread, but the screen would show
    // an exchange from a deleted conversation. The Chats controls are already
    // held while this is true; this covers the one way round it, a confirmation
    // opened just before a queued question went out.
    if (thinking) {
      toast.error("An answer is still on its way — wait for it to land, then delete this chat.");
      return;
    }
    // Pulled out before the closure below: inside a nested function TypeScript
    // can no longer see the guard above (the closure could run later, when
    // `confirming` has moved on), so `target` widens back to possibly-null.
    // The id is what the rollback actually needs.
    const targetId = target.id;
    // What has to go back if the delete doesn't land, including the open
    // transcript when the chat being deleted is the one on screen.
    const previousList = conversations;
    const previousIntent = readChatIntent();
    const wasOpen = targetId === intentConversationId(previousIntent);
    const previousThread = { title, messages };

    function restore() {
      setConversations(previousList);
      if (!wasOpen) return;
      // The intent as it was, not merely the id: restoring the thread has to
      // restore what "no id" meant, or a rolled-back delete leaves this tab
      // resuming a chat it was never in.
      setChatIntent(previousIntent);
      setTitle(previousThread.title);
      setMessages(previousThread.messages);
    }

    setDeleting(true);
    setConversations((prev) => prev?.filter((c) => c.id !== targetId) ?? prev);
    if (wasOpen) {
      setMessages([]);
      setTitle(null);
      // Explicitly NO conversation, not "haven't looked yet": the next
      // question starts a fresh chat rather than resuming whichever unrelated
      // thread is newest now that this one is gone.
      adoptConversation(null, true);
    }

    let result: Awaited<ReturnType<typeof deleteConversation>>;
    try {
      result = await deleteConversation(targetId);
    } catch {
      restore();
      toast.error("Couldn't delete that chat — check your connection and try again.");
      return;
    } finally {
      setDeleting(false);
      setConfirming(null);
    }

    if (result.error) {
      restore();
      toast.error(result.error);
      return;
    }

    toast.success("Chat deleted.");
  }

  // ---------------- Render ----------------

  const busy = switching || deleting;
  /**
   * The chat-switching controls — New, Chats, and the delete inside it — are
   * also held while an answer is in the air, not only while a switch or delete
   * is running. A reply that lands after its chat has been deleted is still
   * adopted onto the screen, which briefly shows an exchange from a
   * conversation that is gone. Holding the buttons is the shape "New" already
   * used, and it keeps the rule in one place rather than second-guessing a
   * reply after the fact.
   */
  const chatControlsHeld = busy || thinking;
  /**
   * The sheet's chat opens compact and grows into the space the moment it has
   * something to show. On the page it is always open.
   */
  const showTranscript =
    !sheet ||
    expanded ||
    historyOpen ||
    live !== null ||
    pendingAsks.length > 0 ||
    notice !== null;

  // Keep the newest line in view — inside the transcript's OWN box in the
  // sheet. `scrollIntoView` walks every scrollable ancestor, so there it moved
  // the sheet as well as the transcript and the two fought each other.
  useEffect(() => {
    if (!showTranscript) return;
    if (sheet) {
      const list = listRef.current;
      if (!list) return;
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      return;
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, live, pendingAsks, sheet, showTranscript]);

  const barLabel = historyOpen
    ? "Past chats"
    : loadingConversation
      ? "Catching up…"
      : (title ?? "New chat");

  return (
    <>
      <div
        className={cn(
          "flex flex-col",
          sheet ? "min-w-0 border-b-2 border-rule" : "min-h-[60vh] gap-4"
        )}
      >
        {aiBlocked && (
          <Panel
            tone={sheet ? "default" : "raised"}
            className={cn(sheet && "border-x-0 border-t-0")}
          >
            <p className="px-3 py-3 text-sm">
              The assistant needs a free Google AI key before it can do anything.
              The Manual&rsquo;s Phase 5 section has the five steps — it takes about
              two minutes.
            </p>
          </Panel>
        )}

        {/* ---------------- Which chat you're in ---------------- */}
        <div
          className={cn(
            "flex min-h-11 items-center justify-between gap-2 border-2 border-rule bg-surface px-3 py-1.5",
            sheet && "border-x-0 border-t-0"
          )}
        >
          {sheet ? (
            // In the sheet this line is also the handle. The compact state
            // exists so the capture chips stay on screen, so opening the
            // transcript over the top of them is a deliberate tap.
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={showTranscript}
              className="tap-press flex min-w-0 flex-1 items-center gap-1.5 text-left"
            >
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                  showTranscript && "rotate-180"
                )}
                strokeWidth={2.5}
              />
              <span className="micro min-w-0 truncate">{barLabel}</span>
              {!showTranscript && messages.length > 0 && (
                <Micro className="shrink-0">· {messages.length}</Micro>
              )}
            </button>
          ) : (
            <div className="micro min-w-0 truncate">{barLabel}</div>
          )}
          {showTranscript && (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => void handleNewChat()}
                disabled={chatControlsHeld}
              >
                <Plus />
                New
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={toggleHistory}
                disabled={chatControlsHeld}
                aria-expanded={historyOpen}
              >
                <History />
                Chats
              </Button>
            </div>
          )}
        </div>

        {/* ---------------- The conversation, or the list of them ---------------- */}
        {showTranscript && (
          <div
            ref={listRef}
            className={cn(
              "flex flex-col gap-3",
              // `overscroll-contain`: reaching the end of the transcript must
              // not hand the scroll on to the sheet behind it.
              sheet ? cn(SHEET_LIST_HEIGHT, "overflow-y-auto overscroll-contain p-3") : "flex-1"
            )}
          >
            {historyOpen ? (
              <PastChats
                conversations={conversations}
                loading={loadingHistory}
                busy={chatControlsHeld}
                currentId={conversationId}
                timeZone={timeZone}
                onOpen={(c) => void openConversation(c)}
                onDelete={setConfirming}
              />
            ) : (
              <>
                {loadingConversation && (
                  <p className="hatch px-3 py-6 text-center">
                    <Micro>Catching up on your last chat…</Micro>
                  </p>
                )}

                {!loadingConversation &&
                  messages.length === 0 &&
                  live === null &&
                  pendingAsks.length === 0 && (
                    <Panel>
                      <PanelEmpty>
                        Ask about anything in the app — what you spent, what&rsquo;s due, how
                        training&rsquo;s going — or tell it to add something.
                      </PanelEmpty>
                      {suggestions.length > 0 && (
                        <div className="grid gap-px border-t-2 border-rule bg-hairline">
                          {suggestions.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => void send(s)}
                              disabled={aiBlocked || thinking}
                              className="tap-press bg-surface px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </Panel>
                  )}

                {messages.map((m) => (
                  <motion.div
                    key={m.key}
                    variants={fadeInUpVariants}
                    initial="hidden"
                    animate="visible"
                    className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] border-2 border-rule px-3 py-2.5 text-sm",
                        m.role === "user"
                          ? "bg-foreground text-background"
                          : "bg-surface shadow-[var(--shadow-hard-sm)]"
                      )}
                    >
                      <div className="assistant-prose whitespace-pre-wrap break-words">
                        {m.content}
                      </div>
                      {m.actions && m.actions.length > 0 && (
                        <Micro className="mt-2 block border-t border-hairline pt-1.5">
                          Done — the app has been updated
                        </Micro>
                      )}
                      {/* Things it did NOT do, waiting on a tap. Sits below the
                          "done" line on purpose: a reply can both have changed
                          something and be offering to change something else,
                          and the order says which is which. */}
                      <ProposalButtons messageId={m.messageId} proposals={m.proposals} />
                      {/* The PAIR is marked, not just the reply: neither half
                          of an unsaved exchange will be here next time. */}
                      {m.unsaved &&
                        (m.role === "user" ? (
                          <span className="micro-sm mt-2 block border-t border-background/30 pt-1.5 opacity-80">
                            Not saved
                          </span>
                        ) : (
                          <Micro className="mt-2 block border-t border-hairline pt-1.5 text-warn">
                            This question and answer weren&rsquo;t saved — they won&rsquo;t be
                            here next time
                          </Micro>
                        ))}
                    </div>
                  </motion.div>
                ))}

                {/* The question in the air. Drawn from the shared store rather
                    than the transcript, which is what lets it survive the
                    sheet being closed and reopened mid-answer. */}
                {live && (
                  <>
                    <div className="flex justify-end">
                      <div className="max-w-[85%] border-2 border-rule bg-foreground px-3 py-2.5 text-sm text-background">
                        <div className="whitespace-pre-wrap break-words">{live.question}</div>
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="flex items-center gap-2 border-2 border-rule bg-surface px-3 py-2.5">
                        <Sparkles className="size-4 animate-pulse text-primary" />
                        <Micro>Looking…</Micro>
                      </div>
                    </div>
                  </>
                )}

                {/* Waiting its turn. Dashed, because it hasn't been asked yet. */}
                {pendingAsks.map((q, i) => (
                  <div key={`waiting-${i}`} className="flex justify-end">
                    <div className="max-w-[85%] border-2 border-dashed border-rule bg-muted px-3 py-2.5 text-sm text-muted-foreground">
                      <div className="whitespace-pre-wrap break-words">{q}</div>
                      <Micro className="mt-2 block border-t border-hairline pt-1.5">
                        {loadingConversation
                          ? "Catching up first — this sends in a moment"
                          : "Waiting its turn"}
                      </Micro>
                    </div>
                  </div>
                ))}

                {notice && (
                  <div className="border-2 border-destructive px-3 py-2 text-sm text-destructive">
                    <p>{notice}</p>
                    {unsureAbout && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="mt-2"
                        onClick={() => void recheck()}
                        disabled={rechecking}
                      >
                        {rechecking ? "Checking…" : "Check if it got through"}
                      </Button>
                    )}
                  </div>
                )}

                <div ref={endRef} />
              </>
            )}
          </div>
        )}

        {/* ---------------- Composer ---------------- */}
        <div
          className={cn(
            "flex flex-col gap-1.5",
            sheet ? "border-t-2 border-rule p-3" : "sticky bottom-0 bg-background pt-2 pb-1"
          )}
        >
          <div className="flex items-end gap-2 border-2 border-rule bg-surface p-2 shadow-[var(--shadow-hard-sm)]">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter makes a new line — the convention
                // everywhere else people type into a box like this.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={sheet ? 2 : 1}
              aria-label="Ask or tell it anything"
              placeholder={
                listening
                  ? "Listening…"
                  : notReady
                    ? "Type away — still catching up"
                    : "Ask anything, or tell it to do something"
              }
              // NOT disabled while catching up or switching chats: whatever is
              // typed then is kept and sent the moment it can be.
              disabled={aiBlocked || thinking}
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-base outline-none placeholder:text-muted-foreground disabled:opacity-50 md:text-sm"
            />
            {canDictate && (
              <button
                type="button"
                onClick={toggleDictation}
                disabled={aiBlocked || thinking}
                aria-label={listening ? "Stop listening" : "Talk to it"}
                aria-pressed={listening}
                className={cn(
                  "press-hard tap-reach flex size-9 shrink-0 items-center justify-center border-2 border-rule disabled:pointer-events-none disabled:opacity-40",
                  listening
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-surface text-muted-foreground hover:text-foreground"
                )}
              >
                {listening ? (
                  <Square className="size-3.5" strokeWidth={3} />
                ) : (
                  <Mic className="size-4" strokeWidth={2.5} />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => void send(input)}
              disabled={aiBlocked || thinking || !input.trim()}
              aria-label="Send"
              className="press-hard tap-reach flex size-9 shrink-0 items-center justify-center border-2 border-rule bg-primary text-primary-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <ArrowUp className="size-4" strokeWidth={3} />
            </button>
          </div>

          {/* The running cost, always visible. The point isn't the number, it's
              that there is one — spend you can see is spend you can trust. */}
          {usage && <Micro className="text-right">AI this month: {usage.label}</Micro>}
        </div>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        title="Delete this chat?"
        description={
          confirming ? `“${confirming.title ?? "New chat"}” and everything said in it.` : undefined
        }
        detail="The messages are deleted for good. Nothing else in the app changes."
        confirmLabel="Delete chat"
        pending={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

/**
 * The list of past chats.
 *
 * Two controls per row — open it, or delete it — so they are two buttons side
 * by side rather than a PanelRow with something nested inside its own button,
 * which is not a thing a browser will render.
 */
function PastChats({
  conversations,
  loading,
  busy,
  currentId,
  timeZone,
  onOpen,
  onDelete,
}: {
  conversations: ConversationSummary[] | null;
  loading: boolean;
  busy: boolean;
  currentId: string | null;
  timeZone: string;
  onOpen: (conversation: ConversationSummary) => void;
  onDelete: (conversation: ConversationSummary) => void;
}) {
  if (loading && !conversations) {
    return (
      <p className="hatch px-3 py-6 text-center">
        <Micro>Looking up your chats…</Micro>
      </p>
    );
  }

  if (!conversations || conversations.length === 0) {
    return (
      <Panel>
        <PanelEmpty>
          Nothing here yet. Every chat you have is kept, so you can come back to
          one later.
        </PanelEmpty>
      </Panel>
    );
  }

  return (
    <Panel>
      {conversations.map((c, i) => (
        <div
          key={c.id}
          className={cn(
            "flex items-stretch",
            i < conversations.length - 1 && "border-b border-hairline",
            c.id === currentId && "bg-muted/40"
          )}
        >
          <button
            type="button"
            onClick={() => onOpen(c)}
            disabled={busy}
            className="tap-press min-w-0 flex-1 px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
          >
            <span className="block truncate text-sm">{c.title ?? "New chat"}</span>
            <Micro className="mt-0.5 block">
              {/* Stored UTC, converted here and only here — lib/time.ts. */}
              {formatInAppTimezone(
                c.lastMessageAt,
                { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
                timeZone
              )}
              {c.id === currentId ? " · open now" : ""}
            </Micro>
          </button>
          <button
            type="button"
            onClick={() => onDelete(c)}
            disabled={busy}
            aria-label={`Delete the chat “${c.title ?? "New chat"}”`}
            className="tap-press flex w-11 shrink-0 items-center justify-center border-l border-hairline text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
          >
            <Trash2 className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      ))}
    </Panel>
  );
}
