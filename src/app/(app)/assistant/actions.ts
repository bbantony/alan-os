"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { canAccessPath } from "@/lib/permissions";
import { askAssistant, type AssistantReply } from "@/lib/ai/assistant";
import {
  CONVERSATION_CAP_PER_USER,
  MESSAGE_CAP_PER_CONVERSATION,
  conversationIntent,
  conversationTitle,
  overCap,
  type AssistantMessage,
  type ConversationIntent,
} from "@/lib/ai/history";
import { getUsageSummary, type UsageSummary } from "@/lib/ai/usage";
import { sanitiseProposals, type AssistantProposal } from "@/lib/ai/boldness";
import { ALL_TOOLS, type ToolContext } from "@/lib/ai/tools";
import { friendlyDbError, type DbErrorLike } from "@/lib/db-errors";

/**
 * The assistant's memory (migration 0041).
 *
 * TWO RULES GOVERN THIS FILE.
 *
 * 1. THE MODEL IS NEVER HANDED THE BROWSER'S COPY OF THE CONVERSATION. History
 *    is read back out of the database on the server. That is not tidiness: the
 *    client used to pass `history` up with every question, so a tab that had
 *    been open since before Alan deleted a chat could re-upload the messages he
 *    had just deleted, and they would be written straight back in. There is no
 *    longer any parameter or action through which a client can put arbitrary
 *    text into the message log — `ask` writes both rows of an exchange itself,
 *    from the question it was given and the reply it just paid for, and that is
 *    the only write path there is.
 *
 * 2. A FAILED SAVE MUST NEVER COST AN ANSWER. The reply has already been paid
 *    for by the time persistence is attempted. Every write in `ask` is
 *    therefore best-effort: it is logged, it flips `persisted` to false, and
 *    the reply is returned regardless. The screen degrades to exactly the
 *    behaviour it had before this feature existed — an in-memory chat — rather
 *    than showing an error where an answer should be.
 *
 * The plain CRUD actions below are the opposite: they are the user asking for
 * something to be saved or deleted, so they report failure honestly through
 * `friendlyDbError`.
 */

// Enough rows to fill the model's window (12) several times over even after
// empty messages and a leading answer are dropped, without reading a whole
// 200-message chat on every question.
const HISTORY_FETCH_LIMIT = 40;

interface ConversationRow {
  id: string;
  title: string | null;
  created_at: string;
  last_message_at: string;
}

interface MessageRow {
  id: string;
  role: string;
  content: string;
  actions: string[] | null;
  /**
   * Migration 0043's jsonb column. Optional here because the history read that
   * feeds the MODEL deliberately does not select it — see the note there.
   */
  proposals?: unknown;
  created_at: string;
}

/** A stored message: an AssistantMessage plus what the database knows about it. */
export interface StoredAssistantMessage extends AssistantMessage {
  id: string;
  /** ISO 8601, UTC. Converted for display by lib/time.ts, never here. */
  createdAt: string;
  /**
   * Writes this reply offered but did not make. Carried on the STORED message
   * rather than on `AssistantMessage` on purpose: `AssistantMessage` is what
   * gets sent back up to the model, and the model has no use for a button.
   */
  proposals: AssistantProposal[];
}

export interface ConversationSummary {
  id: string;
  /** Null until the first question is asked; render "New chat". */
  title: string | null;
  createdAt: string;
  lastMessageAt: string;
}

export interface StoredConversation extends ConversationSummary {
  messages: StoredAssistantMessage[];
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/**
 * The one sentence a blocked account is ever told. Shared so the four actions
 * in this file cannot start saying four slightly different things.
 */
const ASSISTANT_UNAVAILABLE = "The assistant isn't switched on for this account.";

/** One sentence for every "that proposal is not there to run", for the same reason. */
const THAT_ONES_GONE = "That suggestion isn't there any more.";

/**
 * Is the assistant switched on for whoever is calling?
 *
 * Every exported action in this file asks this, not just `ask()`. The reason
 * the other three need it is smaller but real: `/assistant` is gated by
 * ADDRESS, and a server action posts to whatever page you are already on, so a
 * workout-only crew account that never visits the assistant can still call
 * `startConversation` from a page it can reach and leave empty conversation
 * rows behind. Nothing leaks — RLS keeps every row to its own account, and
 * these three spend no model credit — but rows it has no business creating are
 * rows it should not be able to create, and 0041's pruning trigger acts on
 * them.
 *
 * Gated on `canAccessPath` rather than on `moduleAccess.tasks` for the reason
 * spelled out at length in `ask()`: one definition of "can use the assistant",
 * in one file, so the five call sites cannot drift.
 */
async function assistantIsAvailable(): Promise<boolean> {
  const profile = await getCurrentProfile();
  return profile !== null && canAccessPath(profile, "/assistant");
}

function toStoredMessage(row: MessageRow): StoredAssistantMessage {
  return {
    id: row.id,
    role: row.role === "user" ? "user" : "assistant",
    content: row.content,
    actions: row.actions ?? [],
    // Never the raw column. A row written by an older build, or one that lost
    // an argument, must not reach a registry lookup — and note that dropping a
    // malformed entry RENUMBERS, which is why the screen and the server both
    // index into THIS array and not into what came out of the database.
    proposals: sanitiseProposals(row.proposals),
    createdAt: row.created_at,
  };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Look up the conversation a caller means, WITHOUT creating one.
 *
 * The three intents are decided by `conversationIntent` (lib/ai/history.ts) and
 * nowhere else, because reading "no id" as "the most recent chat" is exactly
 * the bug this pair of functions was split apart to kill:
 *
 *   resume    the most recently used chat, or null if there are none;
 *   specific  that chat, or null if it has been deleted;
 *   fresh     null, without asking the database anything. A caller in no
 *             conversation must never be handed one that already exists.
 *
 * Null is not an error in any of the three. Every query carries
 * `.eq("user_id", user.id)` on top of RLS, per SPEC B2.
 */
async function findConversation(
  supabase: Client,
  userId: string,
  intent: ConversationIntent
): Promise<{ conversation: ConversationRow | null; error: DbErrorLike | null }> {
  if (intent.mode === "fresh") return { conversation: null, error: null };

  const owned = supabase
    .from("assistant_conversations")
    .select("id, title, created_at, last_message_at")
    .eq("user_id", userId);

  const { data, error } =
    intent.mode === "specific"
      ? await owned.eq("id", intent.id).maybeSingle()
      : await owned.order("last_message_at", { ascending: false }).limit(1).maybeSingle();

  return { conversation: (data as ConversationRow | null) ?? null, error };
}

async function createConversation(
  supabase: Client,
  userId: string
): Promise<{ conversation: ConversationRow | null; error: DbErrorLike | null }> {
  const { data, error } = await supabase
    .from("assistant_conversations")
    .insert({ user_id: userId })
    .select("id, title, created_at, last_message_at")
    .single();
  return { conversation: (data as ConversationRow | null) ?? null, error };
}

/**
 * Load a conversation and its messages, oldest first — what the chat renders.
 *
 * Same three intents as `ask`: omit the argument for "wherever I left off",
 * pass an id for that chat, pass an explicit `null` for "I am in no chat" and
 * get nothing back. `conversation: null` means there is nothing to show, which
 * is not an error and must not be rendered as one.
 */
export async function getConversation(
  conversationId?: string | null
): Promise<{ conversation: StoredConversation | null; error?: string }> {
  const { supabase, user } = await requireUser();
  // Gated like the other four even though this one only ever reads the
  // caller's own rows and RLS already guarantees that. The point is that
  // "every exported action in this file asks the same question" is a rule a
  // test can enforce and a reader can check at a glance; "all but this one,
  // because it happens to be harmless" is a rule that decays.
  if (!(await assistantIsAvailable())) {
    return { conversation: null, error: ASSISTANT_UNAVAILABLE };
  }

  const { conversation, error } = await findConversation(
    supabase,
    user.id,
    conversationIntent(conversationId)
  );
  const lookupFailure = friendlyDbError(error);
  if (lookupFailure) return { conversation: null, error: lookupFailure };
  if (!conversation) return { conversation: null };

  // Newest-first plus a limit is the index in 0041, so this is one seek and no
  // sort. Reversed below for display. Asked for slightly more than the cap so
  // `overCap` can trim a database whose pruning trigger has gone missing.
  const { data, error: messagesError } = await supabase
    .from("assistant_messages")
    .select("id, role, content, actions, proposals, created_at")
    .eq("conversation_id", conversation.id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MESSAGE_CAP_PER_CONVERSATION + 10);

  const readFailure = friendlyDbError(messagesError);
  if (readFailure) return { conversation: null, error: readFailure };

  const ascending = ((data as MessageRow[] | null) ?? []).slice().reverse();
  const excess = overCap(ascending.length, MESSAGE_CAP_PER_CONVERSATION);

  return {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.created_at,
      lastMessageAt: conversation.last_message_at,
      messages: ascending.slice(excess).map(toStoredMessage),
    },
  };
}

/**
 * The account's recent chats, most recently used first — the "past chats"
 * list, and the thing `deleteConversation` is offered from. Never longer than
 * the retention cap, because nothing longer can exist.
 */
export async function listConversations(): Promise<{
  conversations: ConversationSummary[];
  error?: string;
}> {
  const { supabase, user } = await requireUser();
  if (!(await assistantIsAvailable())) {
    return { conversations: [], error: ASSISTANT_UNAVAILABLE };
  }

  const { data, error } = await supabase
    .from("assistant_conversations")
    .select("id, title, created_at, last_message_at")
    .eq("user_id", user.id)
    .order("last_message_at", { ascending: false })
    .limit(CONVERSATION_CAP_PER_USER);

  const failure = friendlyDbError(error);
  if (failure) return { conversations: [], error: failure };

  return {
    conversations: ((data as ConversationRow[] | null) ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      lastMessageAt: row.last_message_at,
    })),
  };
}

/**
 * There is deliberately NO action here that appends an arbitrary message.
 *
 * One existed (`appendMessage`, removed 6 Sep 2026) for turns recorded outside
 * `ask`. Nothing ever called it, and while it existed two invariants this
 * feature depends on were only nearly true: that no client path can write
 * chosen text into the message log — so a stale tab cannot resurrect messages
 * Alan deleted — and that an exchange is always stored as a question and its
 * answer together. If a future turn really does need recording outside `ask`,
 * add it back as a narrow action that writes BOTH rows in one insert.
 */

/** Best-effort: a chat with no name is a cosmetic problem, never an error. */
async function titleConversation(
  supabase: Client,
  userId: string,
  conversationId: string,
  firstQuestion: string
): Promise<void> {
  const { error } = await supabase
    .from("assistant_conversations")
    .update({ title: conversationTitle(firstQuestion) })
    .eq("id", conversationId)
    .eq("user_id", userId)
    .is("title", null);
  if (error) console.error("[assistant] could not name conversation", error);
}

/**
 * "New chat".
 *
 * Reuses the current conversation when it is already empty, so tapping it
 * twice — or tapping it and then walking away — cannot leave a trail of blank
 * threads pushing real ones out under the 30-conversation cap.
 */
export async function startConversation(): Promise<{
  conversationId?: string;
  error?: string;
}> {
  const { supabase, user } = await requireUser();
  if (!(await assistantIsAvailable())) return { error: ASSISTANT_UNAVAILABLE };

  const { conversation, error: lookupError } = await findConversation(supabase, user.id, {
    mode: "resume",
  });
  const lookupFailure = friendlyDbError(lookupError);
  if (lookupFailure) return { error: lookupFailure };

  if (conversation) {
    const { count, error: countError } = await supabase
      .from("assistant_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversation.id)
      .eq("user_id", user.id);

    if (!countError && (count ?? 0) === 0) {
      return { conversationId: conversation.id };
    }
  }

  const created = await createConversation(supabase, user.id);
  const failure = friendlyDbError(created.error);
  if (failure || !created.conversation) {
    return { error: failure ?? "That didn't save. Try again." };
  }

  revalidatePath("/assistant");
  return { conversationId: created.conversation.id };
}

/**
 * Delete a whole chat. The messages go with it through the 0041 foreign key
 * cascade, in the database, so "deleted" means deleted — and because `ask`
 * reads history from the database rather than from the browser, a tab still
 * holding the old messages cannot put them back.
 */
export async function deleteConversation(
  conversationId: string
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!(await assistantIsAvailable())) return { error: ASSISTANT_UNAVAILABLE };
  if (!conversationId) return { error: "There was nothing to delete." };

  const { error } = await supabase
    .from("assistant_conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", user.id);

  const failure = friendlyDbError(error);
  if (failure) return { error: failure };

  revalidatePath("/assistant");
  return {};
}

/**
 * Ask a question. The one place an exchange is written to the message log.
 *
 * THE `conversationId` CONTRACT, which the chat screen has to match exactly:
 *
 *   omitted        continue wherever I left off — the most recently used chat.
 *                  The page-load case, and the only one that may adopt an
 *                  existing thread the caller did not name.
 *   null           I am deliberately in NO chat: always start a fresh thread.
 *                  Send this after deleting the chat you were in and after
 *                  "New chat". Never falls back to an older conversation.
 *   an id          continue that chat. If it no longer exists (deleted in
 *                  another tab) a fresh thread is started, not the next chat
 *                  along.
 *
 * Nothing is created until there is an exchange to put in it. A question that
 * cannot be answered — no API key, budget spent, assistant switched off —
 * leaves the database exactly as it found it, because an empty conversation
 * row still counts against the 30-chat cap and would evict a real chat.
 */
export async function ask(input: {
  question: string;
  /** Which chat this belongs to. See the contract above — `null` is not `undefined`. */
  conversationId?: string | null;
}): Promise<
  AssistantReply & {
    usage: UsageSummary;
    /**
     * The chat the caller is now in — adopt it. Null means there is still no
     * chat: either the question could not be answered (so nothing was created,
     * on purpose) or the thread could not be created. Not the same as
     * `persisted`: an existing chat is returned even when this exchange went
     * unsaved.
     */
    conversationId: string | null;
    /** False means the exchange is on screen only — warn, don't error. */
    persisted: boolean;
    /**
     * The row this reply was stored as — what a proposal button posts back
     * alongside its index. Null whenever the exchange was not saved, and in
     * that case `proposals` is empty too: a button with no row to read cannot
     * work, so it is not offered.
     */
    messageId: string | null;
  }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  // --- Can this account use the assistant at all? --------------------------
  //
  // THE HOLE THIS CLOSES. `/assistant` is gated in ROUTE_MODULE_ALIASES
  // (lib/permissions.ts) precisely because, as the comment there says, it
  // "spends the owner's Gemini credit" — but that guard works by ADDRESS, and a
  // server action posts to whatever page you are already on. A crew account
  // with workout-only access never visits /assistant and so never trips the
  // guard, yet could call this action directly from any page it can reach and
  // bill the owner for every question. No data leaked — `toolsFor()` filters
  // the tools per account, so it could only ever have asked about workouts —
  // but the spending was real and uncapped by anything except the monthly
  // ceiling.
  //
  // Asked of `canAccessPath` rather than by reading `moduleAccess.tasks` here.
  // That file exists because three copies of this check drifted apart once;
  // putting a fourth literal in a different file is how it happens again. If
  // the assistant is ever moved to its own module, this line needs no edit.
  //
  // Refused BEFORE the conversation lookup and before any model call, so a
  // blocked account costs one profile read and writes nothing — no row in
  // `ai_usage`, no empty conversation for 0041's pruning trigger to act on.
  if (!canAccessPath(profile, "/assistant")) {
    return {
      text: "",
      actions: [],
      proposals: [],
      unavailable: ASSISTANT_UNAVAILABLE,
      usage: await getUsageSummary(),
      conversationId: null,
      persisted: false,
      messageId: null,
    };
  }

  // --- Find the conversation. Nothing is CREATED here. ----------------------
  //
  // Deliberately a lookup only. Creating the row before calling the model meant
  // a question that could not be answered still left a conversation behind —
  // which fires 0041's pruning trigger and, at the 30-chat cap, deleted the
  // least recently used real chat in exchange for a permanently blank one. The
  // insert now happens below, only once there is an exchange to store.
  //
  // A conversationId that matches nothing — deleted in another tab, or simply
  // not this account's — resolves to null, and a fresh chat is started below
  // rather than erroring. Losing the thread is survivable; losing the answer is
  // not. Failing here is survivable too: `found.error` suppresses the create,
  // so a database that is refusing reads is not answered with a new chat on
  // every question.
  const intent: ConversationIntent = conversationIntent(input.conversationId);
  const found = await findConversation(supabase, user.id, intent);
  if (found.error) console.error("[assistant] could not load conversation", found.error);
  let conversation = found.conversation;

  // --- Build the history the model sees. -----------------------------------
  //
  // From the database when there is one to read, because that is the only copy
  // that reflects deletions. `historyWindow` inside askAssistant then trims it
  // to the same twelve messages it always sent, so this costs no more per turn
  // than the browser-supplied version it replaces.
  //
  // A fresh thread, or a chat that has been deleted, reads nothing — the model
  // starts from a blank slate, which is exactly what the screen is showing. It
  // is the case this used to get wrong: it answered from the previous chat's
  // last dozen messages while showing an empty one.
  let history: AssistantMessage[] = [];
  if (conversation) {
    const { data, error } = await supabase
      .from("assistant_messages")
      // No `proposals`. This read feeds the MODEL, and an unpressed button
      // from four turns ago is not context — it is tokens, and worse, it is
      // an invitation to re-propose something already on screen.
      .select("id, role, content, actions, created_at")
      .eq("conversation_id", conversation.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(HISTORY_FETCH_LIMIT);

    if (error) {
      // No fallback to a browser-supplied copy: there is no longer such a
      // parameter, and there should not be. The conversation exists, so any
      // copy the client held may contain messages that were deleted from it;
      // answering with slightly less context is the cheaper mistake.
      console.error("[assistant] could not load history", error);
    } else {
      history = ((data as MessageRow[] | null) ?? []).slice().reverse().map(toStoredMessage);
    }
  }

  const reply = await askAssistant({
    // The user's own client, so every tool runs under their session and Row
    // Level Security is what stops the assistant seeing anyone else's data.
    // Nothing in this path ever touches a service-role client.
    ctx: { supabase, userId: user.id },
    displayName: profile.displayName,
    moduleAccess: profile.moduleAccess,
    history,
    question: input.question,
    // Settings → AI & cost. At Alan's setting (`suggest`) the money writes
    // come back as proposals instead of having happened; see lib/ai/boldness.ts.
    boldness: profile.preferences.aiBoldness,
  });

  // --- Persist the exchange. Never at the cost of the answer. ---------------
  //
  // Both rows in ONE insert, so the log can never hold an answer with no
  // question. Nothing was spent when `unavailable` is set (no key, budget gone,
  // feature switched off) and there is no exchange to record; an empty reply is
  // the same. In those cases the conversation below is never created either —
  // that is the whole reason the create moved down here. Every failure past
  // this point is logged and swallowed.
  let persisted = false;
  let messageId: string | null = null;
  const question = input.question.trim();
  const worthStoring = !reply.unavailable && reply.text.trim().length > 0 && question.length > 0;

  // Now, and only now, is a thread worth a row. Skipped when the lookup itself
  // failed, so a transient read error cannot fork a duplicate chat.
  if (worthStoring && !conversation && !found.error) {
    const created = await createConversation(supabase, user.id);
    if (created.error) console.error("[assistant] could not start conversation", created.error);
    conversation = created.conversation;
  }

  if (worthStoring && conversation) {
    const { data: written, error } = await supabase
      .from("assistant_messages")
      .insert([
        { conversation_id: conversation.id, user_id: user.id, role: "user", content: question, actions: [], proposals: [] },
        {
          conversation_id: conversation.id,
          user_id: user.id,
          role: "assistant",
          content: reply.text,
          actions: reply.actions,
          // The proposals are stored ON the reply they belong to. That is what
          // makes the button work after a reload, and what makes
          // `runAssistantProposal` able to take an index and nothing else.
          proposals: reply.proposals,
        },
      ])
      // Ids back, so the screen can address the proposals it is about to show.
      // Ordered by `created_at` because the assistant row is the one wanted
      // and the insert's return order is not promised — 0041 sets
      // `clock_timestamp()` per row precisely so these two are separable.
      .select("id, role, created_at")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[assistant] could not save exchange", error);
    } else {
      persisted = true;
      messageId =
        ((written as { id: string; role: string }[] | null) ?? []).find(
          (r) => r.role === "assistant"
        )?.id ?? null;
      if (!conversation.title) {
        await titleConversation(supabase, user.id, conversation.id, question);
      }
    }
  }

  // If it changed something, the screens showing that thing are now stale.
  if (reply.actions.length > 0) {
    revalidatePath("/today");
    revalidatePath("/plan");
    revalidatePath("/money");
    revalidatePath("/shopping");
  }

  return {
    ...reply,
    usage: await getUsageSummary(),
    conversationId: conversation?.id ?? null,
    persisted,
    messageId,
    // A proposal that was never written down cannot be run: the button posts a
    // message id and an index, and there is no message. Rather than show a
    // button that will always fail, the screen is told there are none and the
    // reply's own text still explains what the assistant would have done.
    // Nothing was changed, which is the safe direction for this to fail in.
    proposals: messageId ? reply.proposals : [],
  };
}

/**
 * Runs one proposal — only ever from a tap.
 *
 * The four invariants below are copied, deliberately and almost line for line,
 * from `runOutlookSuggestion` in today/outlook-actions.ts. That file is the
 * reference implementation of "the model stored an intent, a thumb turns it
 * into an action", and every one of its rules was arrived at by getting it
 * wrong first. They are not stylistic:
 *
 *   1. THE CLIENT SENDS ONLY AN INDEX, never `{tool, args}`. This is a server
 *      action, so its argument is whatever the browser sends; accepting a tool
 *      name and arguments would make it a general-purpose write endpoint that
 *      any signed-in account could post to. Taking a message id and a position
 *      means the only things executable are the ones the model actually wrote,
 *      for this person, in a reply they can see.
 *   2. THE PROPOSAL IS RE-READ FROM THE DATABASE. Nothing about what runs comes
 *      from the request except which one.
 *   3. THE TOOL IS RE-LOOKED-UP IN `ALL_TOOLS` AND ITS MODULE RE-CHECKED. The
 *      proposal was written under one account's module access and could be
 *      tapped after that access changed.
 *   4. A TAKEN PROPOSAL IS MARKED, NEVER REMOVED. Filtering renumbers the array
 *      while the browser still holds the old numbering, and the button then
 *      does something other than what its label says.
 *
 * WHAT IS DIFFERENT HERE, AND WHY. The outlook's chips are held to the two-name
 * allowlist in `suggestable.ts`; these are not, and must not be — the entire
 * point of `suggest` is that `log_expense` and the other money writes come here
 * instead of running. The protection is different in kind rather than weaker:
 * an outlook suggestion is written by a model that nobody asked, so what it may
 * name is restricted; a proposal only exists because Alan asked for that thing
 * in that sentence, and he is looking at a button describing it. What replaces
 * the allowlist is the `writes` check below — a proposal naming a READ tool
 * would be a button that does nothing visible and then marks itself done.
 */
export async function runAssistantProposal(input: {
  messageId: string;
  index: number;
}): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  // Same gate as every other action in this file. It matters more here than in
  // most of them: this one performs a write chosen by the AI.
  if (!canAccessPath(profile, "/assistant")) return { error: ASSISTANT_UNAVAILABLE };

  // Shape first, because the index is spliced into a database filter below
  // (`proposals->N->>actedAt`) and it arrives from the browser. Anything but a
  // small whole number could carry filter syntax into that string. A turn
  // proposes single digits; the ceiling is loose but finite.
  const { messageId, index } = input;
  if (typeof messageId !== "string" || !messageId) return { error: THAT_ONES_GONE };
  if (!Number.isInteger(index) || index < 0 || index > 99) return { error: THAT_ONES_GONE };

  const { data: row } = await supabase
    .from("assistant_messages")
    .select("id, proposals")
    .eq("id", messageId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row) return { error: THAT_ONES_GONE };

  // Index-preserving by contract — see `sanitiseProposals`. If it ever starts
  // dropping entries, the position used against the database below stops
  // meaning the same thing as the position the screen showed, and every button
  // under a malformed entry runs its neighbour.
  const proposals = sanitiseProposals((row as { proposals: unknown }).proposals);
  const proposal = proposals[index];
  if (!proposal) return { error: THAT_ONES_GONE };
  // A first, friendly answer only. It is NOT what makes the button single-use;
  // reading a value and acting on it later is exactly the race the outlook
  // chips used to lose. The claim below is the real guard.
  if (proposal.actedAt) return { error: "That one's already done." };

  const tool = ALL_TOOLS.find((t) => t.name === proposal.tool);
  if (!tool) return { error: "That isn't something the app can do any more." };
  if (!tool.writes) {
    // Cannot happen from `ask()`, which only proposes writes. It is here
    // because the alternative to a check is a button that runs a read, shows
    // the person nothing, and marks itself done.
    return { error: "There's nothing to confirm there." };
  }
  if (tool.module !== null && !profile.moduleAccess[tool.module]) {
    return { error: "That isn't switched on for this account." };
  }

  // --- The claim -----------------------------------------------------------
  //
  // Marked BEFORE the tool runs and marked CONDITIONALLY.
  // `.is("proposals->N->>actedAt", null)` asks the database, inside the same
  // statement that does the writing, whether this proposal is still unclaimed;
  // exactly one simultaneous tap can match. `.select()` is what turns it from a
  // hope into a claim — no row back means the other tap won. Doing it the other
  // way round (run, then stamp) is how the same money gets logged twice from a
  // double tap, and this is the one feature where that is guaranteed to be
  // about money.
  //
  // THE SAME HONEST GAP AS THE OUTLOOK: the array is one jsonb column and
  // PostgREST can only set a whole column, so this writes back the copy read a
  // moment ago. Two DIFFERENT buttons under the same reply, claimed inside the
  // same round trip, can still lose one of the two marks. The `.is()` filter
  // means one button can never double-run, which is the part that costs money;
  // closing the rest needs a `jsonb_set` function under the same `where`, which
  // is a schema change and is deliberately not made here. Migration 0043 says
  // what such a migration would have to get right.
  const claimedAt = new Date().toISOString();
  const claimedArray = proposals.map((p, i) => (i === index ? { ...p, actedAt: claimedAt } : p));

  const { data: claimed, error: claimError } = await supabase
    .from("assistant_messages")
    .update({ proposals: claimedArray })
    .eq("id", messageId)
    .eq("user_id", user.id)
    .is(`proposals->${index}->>actedAt`, null)
    .select("id")
    .maybeSingle();

  if (claimError) return { error: "That didn't go through — try again in a moment." };
  if (!claimed) return { error: "That one's already done." };

  // Puts the button back if the tool refuses, so a fixable problem — a category
  // that doesn't exist yet — doesn't cost the proposal. Re-read first: whatever
  // else happened to the array meanwhile is kept, and only our own stamp,
  // matched exactly, is cleared.
  const userId = user.id;
  async function release() {
    const { data: fresh } = await supabase
      .from("assistant_messages")
      .select("proposals")
      .eq("id", messageId)
      .eq("user_id", userId)
      .maybeSingle();
    const current = fresh ? sanitiseProposals((fresh as { proposals: unknown }).proposals) : claimedArray;
    if (current[index]?.actedAt !== claimedAt) return;
    await supabase
      .from("assistant_messages")
      .update({ proposals: current.map((p, i) => (i === index ? { ...p, actedAt: null } : p)) })
      .eq("id", messageId)
      .eq("user_id", userId)
      .eq(`proposals->${index}->>actedAt`, claimedAt);
  }

  // The person's own client, so RLS is still what stops a tool touching
  // anyone else's rows — the same contract every tool runs under inside `ask`.
  const ctx: ToolContext = { supabase, userId: user.id };
  let result: { error?: string };
  try {
    result = (await tool.run(ctx, proposal.args)) as { error?: string };
  } catch {
    // NOT released. A tool that RETURNED an error refused cleanly and wrote
    // nothing; a tool that THREW may have written half of something, and
    // offering to run that again is the worse of the two failures.
    return { error: "That didn't go through — check the screen before trying it again." };
  }
  if (result?.error) {
    await release();
    return { error: result.error };
  }

  revalidatePath("/assistant");
  revalidatePath("/today");
  revalidatePath("/plan");
  revalidatePath("/money");
  revalidatePath("/shopping");
  return { ok: true };
}
