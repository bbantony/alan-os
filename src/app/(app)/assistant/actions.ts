"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
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
  created_at: string;
}

/** A stored message: an AssistantMessage plus what the database knows about it. */
export interface StoredAssistantMessage extends AssistantMessage {
  id: string;
  /** ISO 8601, UTC. Converted for display by lib/time.ts, never here. */
  createdAt: string;
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

function toStoredMessage(row: MessageRow): StoredAssistantMessage {
  return {
    id: row.id,
    role: row.role === "user" ? "user" : "assistant",
    content: row.content,
    actions: row.actions ?? [],
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
    .select("id, role, content, actions, created_at")
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
  }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

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
    const { error } = await supabase.from("assistant_messages").insert([
      { conversation_id: conversation.id, user_id: user.id, role: "user", content: question, actions: [] },
      {
        conversation_id: conversation.id,
        user_id: user.id,
        role: "assistant",
        content: reply.text,
        actions: reply.actions,
      },
    ]);

    if (error) {
      console.error("[assistant] could not save exchange", error);
    } else {
      persisted = true;
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
  };
}
