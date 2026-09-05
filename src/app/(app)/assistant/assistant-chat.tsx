"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { ArrowUp, Mic, Sparkles, Square } from "lucide-react";
import { Panel, PanelEmpty } from "@/components/ui/panel";
import { Micro } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { fadeInUpVariants } from "@/lib/motion";
import type { AssistantMessage } from "@/lib/ai/assistant";
import type { UsageSummary } from "@/lib/ai/usage";
import type { ModuleAccess } from "@/lib/permissions";
import { speechSupported, startDictation, type Dictation } from "@/lib/speech";
import { ask } from "./actions";

/** One per line when several rescued questions go back into the box. */
const NEWLINE = String.fromCharCode(10);

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

export function AssistantChat({
  configured,
  initialUsage,
  moduleAccess,
  initialQuestion = null,
  questionKey = null,
}: {
  configured: boolean;
  initialUsage: UsageSummary;
  moduleAccess: ModuleAccess;
  /**
   * A question that was already asked somewhere else — today that means the
   * global capture sheet's text box, which sends you here with `?q=`. It is
   * sent the moment this screen mounts, so the sheet's box behaves like the
   * composer below rather than like a link to it.
   */
  initialQuestion?: string | null;
  /**
   * A token unique to each handover from the capture sheet. Identifies the
   * ASK, not the words — so the same sentence sent twice is asked twice.
   */
  questionKey?: string | null;
}) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  // With no AI key there is nothing to send a handed-over question to, so it
  // starts life in the box instead of vanishing — whatever was typed into the
  // capture sheet is still there once the key is added. Seeded here rather
  // than set from the effect below: the value is known at first render, and
  // setting state inside an effect would paint an empty box first.
  const [input, setInput] = useState(!configured && initialQuestion ? initialQuestion : "");
  // ...and again for every handover after the first.
  //
  // Seeding initial state only covers the case where this screen MOUNTS with a
  // question. Sending a second one from the capture sheet while already here is
  // a soft navigation: the component re-renders with new props rather than
  // remounting, so the seed above never runs again and the second sentence
  // reached nothing — the sheet had closed and cleared its own box by then, so
  // the words were simply gone. This is the adjust-state-during-render pattern
  // used in money-shell.tsx: compare the incoming identity with the one already
  // adopted and set state DURING render, which React re-runs immediately
  // without painting. An effect would be both a lint error and a frame of the
  // wrong (empty) box. The identity is the sheet's one-shot token, matching the
  // ask-guard below, so the same words sent twice still count as two handovers.
  // A newer handover wins over anything half-typed here: with no AI key the box
  // is inert anyway, and the sentence just spoken into the sheet is the newer
  // intent of the two.
  const askIdentity = initialQuestion ? questionKey ?? initialQuestion : null;
  const [adoptedAskIdentity, setAdoptedAskIdentity] = useState(askIdentity);
  if (askIdentity !== adoptedAskIdentity) {
    setAdoptedAskIdentity(askIdentity);
    if (!configured && initialQuestion) setInput(initialQuestion);
  }
  const [thinking, setThinking] = useState(false);
  const [usage, setUsage] = useState(initialUsage);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // Stop the microphone if the page is left mid-sentence.
  useEffect(() => () => dictationRef.current?.stop(), []);

  function toggleDictation() {
    if (listening) {
      dictationRef.current?.stop();
      return;
    }
    beforeSpeechRef.current = input ? `${input.trim()} ` : "";
    const session = startDictation({
      onText: (text) => setInput(beforeSpeechRef.current + text),
      onDone: (error) => {
        setListening(false);
        dictationRef.current = null;
        if (error === "not-allowed" || error === "service-not-allowed") {
          setNotice("Microphone access is blocked. Allow it in your browser settings to talk to it.");
        } else if (error) {
          setNotice("The microphone stopped working. Type it instead.");
        }
        inputRef.current?.focus();
      },
    });
    if (!session) {
      setNotice("Dictation isn't available in this browser. Type it instead.");
      return;
    }
    dictationRef.current = session;
    setNotice(null);
    setListening(true);
  }

  const suggestions = suggestionsFor(moduleAccess);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  // A question handed over from the capture sheet, asked once each.
  //
  // The guard remembers WHICH ask this was, not merely that one happened:
  // opening the sheet again while already on this screen is a soft navigation,
  // so this component re-renders with a new question rather than remounting. A
  // plain "have we asked?" boolean would still be true from the first sentence
  // and would swallow the second in silence — the sheet has closed and cleared
  // the box by then, so the words would simply be gone. The identity is the
  // sheet's one-shot token rather than the text, because "add milk" sent twice
  // an hour apart is two real asks that the words alone cannot tell apart.
  // Re-running with the same token (a re-render, React's development
  // double-effect) still asks once, which is what stops it being paid twice.
  //
  // The `?q=` is then wiped from the address bar with the browser's own history
  // API rather than the Next router, deliberately — a router replace would
  // re-render this screen from the server and throw away the conversation that
  // is at that moment mid-flight. This way a pull-to-refresh lands on a clean
  // Assistant instead of silently asking the same thing again.
  const askedKeyRef = useRef<string | null>(null);
  /**
   * Questions handed over while an answer was still coming back, in the order
   * they arrived. A LIST, not one slot: a single slot meant a third question
   * silently overwrote the second, which is the exact loss this whole queue
   * exists to prevent. Held in a ref rather than state because it is drained
   * inside `send` itself, which keeps the mechanism out of render and out of
   * an effect body.
   */
  const pendingAsksRef = useRef<string[]>([]);
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
    // Unconfigured: the question is already sitting in the box (seeded into
    // `input` above), so there is nothing to do but leave it there.
    if (!configured) return;
    // A reply already in flight does NOT mean the new question is dropped: it
    // waits its turn and is asked the moment the current answer lands (Alan's
    // choice, 5 Sep 2026). The sheet is one tap away and a reply takes
    // seconds, so a second question arriving mid-answer is ordinary, not an
    // edge case — and losing it in silence was the worst thing this screen
    // could do with words someone had already typed.
    if (thinking) {
      pendingAsksRef.current.push(initialQuestion);
      return;
    }
    void send(initialQuestion);
    // `send` is redefined every render and is not a dependency worth chasing —
    // this must run exactly once per handover, which the ref above guarantees.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion, questionKey, configured, thinking]);

  /**
   * Hands unsendable questions back to the composer rather than dropping them.
   * Anything already typed there wins — nothing he is in the middle of writing
   * gets overwritten by a rescue.
   */
  function returnToComposer(questions: string[]) {
    const words = questions.filter(Boolean).join(NEWLINE);
    if (!words) return;
    setInput((current) => (current.trim() ? current : words));
  }

  /**
   * `fromQueue` marks the one caller allowed past the busy check: the drain at
   * the bottom of this function, which runs immediately after the previous
   * reply landed. It cannot rely on the `thinking` flag having flipped —
   * `setThinking(false)` a few lines above only schedules a re-render, so this
   * closure still reads the old value — and a silent bail there would drop the
   * very question the queue exists to protect.
   *
   * `priorHistory` is the other half of that: `send` is redefined every render
   * and the drain runs inside the closure of the send BEFORE it, so reading
   * `messages` there would hand the model the conversation as it stood before
   * the previous question — the follow-up would be answered without the thing
   * it was following up on, and re-setting the array from that stale list
   * would erase the exchange that had just happened from the screen. The
   * caller therefore passes the history it knows to be true.
   */
  async function send(question: string, fromQueue = false, priorHistory?: AssistantMessage[]) {
    const trimmed = question.trim();
    if (!trimmed || (thinking && !fromQueue)) return;

    // Sending ends dictation — otherwise the mic keeps appending to a box
    // that has already been cleared.
    dictationRef.current?.stop();

    const history = priorHistory ?? messages;
    setMessages([...history, { role: "user", content: trimmed }]);
    // Clear the box only when the box is what was sent. A question arriving
    // from the capture sheet (or drained from the queue) has nothing to do
    // with whatever is sitting here half-typed, and wiping it would be the
    // last remaining way for words to go missing on this screen.
    setInput((current) => (current.trim() === trimmed ? "" : current));
    setNotice(null);
    setThinking(true);

    let reply: Awaited<ReturnType<typeof ask>>;
    try {
      reply = await ask({ question: trimmed, history });
    } catch {
      // A rejection is the connection, not the model. Without this the screen
      // stays disabled until a full reload AND anything queued behind it is
      // stranded for good, which is the failure this unit exists to kill.
      setNotice("Couldn't reach the assistant — check your connection and try again.");
      const stranded = pendingAsksRef.current;
      pendingAsksRef.current = [];
      returnToComposer([trimmed, ...stranded]);
      setMessages(history);
      return;
    } finally {
      setThinking(false);
    }

    setUsage(reply.usage);
    if (reply.unavailable) {
      setNotice(reply.unavailable);
      // Whatever was waiting cannot be asked either — hand it all back to the
      // box rather than dropping it, so the words survive to be sent again.
      const stranded = pendingAsksRef.current;
      pendingAsksRef.current = [];
      returnToComposer(stranded);
      return;
    }

    // The conversation as it now truly stands. Built here rather than read
    // back from state because the drain below needs it synchronously, and
    // because state set in this tick is not readable in this tick.
    const nextHistory: AssistantMessage[] = [
      ...history,
      { role: "user", content: trimmed },
      { role: "assistant", content: reply.text, actions: reply.actions },
    ];
    setMessages(nextHistory);

    // Now the queue: the oldest question that arrived while this one was in
    // flight goes next, carrying the completed exchange as its history so a
    // follow-up makes sense. Shifted off BEFORE sending so a failure cannot
    // replay it, and its own completion drains whatever is behind it.
    const queued = pendingAsksRef.current.shift();
    if (queued) {
      void send(queued, true, nextHistory);
    }
  }

  return (
    <div className="flex min-h-[60vh] flex-col gap-4">
      {!configured && (
        <Panel tone="raised">
          <p className="px-3 py-3 text-sm">
            The assistant needs a free Google AI key before it can do anything.
            The Manual&rsquo;s Phase 5 section has the five steps — it takes about
            two minutes.
          </p>
        </Panel>
      )}

      {/* ---------------- Conversation ---------------- */}
      <div className="flex flex-1 flex-col gap-3">
        {messages.length === 0 && (
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
                    onClick={() => send(s)}
                    disabled={!configured}
                    className="tap-press bg-surface px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </Panel>
        )}

        {messages.map((m, i) => (
          <motion.div
            key={i}
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
              <div className="assistant-prose whitespace-pre-wrap break-words">{m.content}</div>
              {m.actions && m.actions.length > 0 && (
                <Micro className="mt-2 block border-t border-hairline pt-1.5">
                  Done — the app has been updated
                </Micro>
              )}
            </div>
          </motion.div>
        ))}

        {thinking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 border-2 border-rule bg-surface px-3 py-2.5">
              <Sparkles className="size-4 animate-pulse text-primary" />
              <Micro>Looking…</Micro>
            </div>
          </div>
        )}

        {notice && (
          <p className="border-2 border-destructive px-3 py-2 text-sm text-destructive">{notice}</p>
        )}

        <div ref={endRef} />
      </div>

      {/* ---------------- Composer ---------------- */}
      <div className="sticky bottom-0 flex flex-col gap-1.5 bg-background pt-2 pb-1">
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
                send(input);
              }
            }}
            rows={1}
            placeholder={
              listening ? "Listening…" : "Ask anything, or tell it to do something"
            }
            disabled={!configured || thinking}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-base outline-none placeholder:text-muted-foreground disabled:opacity-50 md:text-sm"
          />
          {canDictate && (
            <button
              type="button"
              onClick={toggleDictation}
              disabled={!configured || thinking}
              aria-label={listening ? "Stop listening" : "Talk to it"}
              aria-pressed={listening}
              className={cn(
                "press-hard flex size-9 shrink-0 items-center justify-center border-2 border-rule disabled:pointer-events-none disabled:opacity-40",
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
            onClick={() => send(input)}
            disabled={!configured || thinking || !input.trim()}
            aria-label="Send"
            className="press-hard flex size-9 shrink-0 items-center justify-center border-2 border-rule bg-primary text-primary-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ArrowUp className="size-4" strokeWidth={3} />
          </button>
        </div>

        {/* The running cost, always visible. The point isn't the number, it's
            that there is one — spend you can see is spend you can trust. */}
        <Micro className="text-right">
          AI this month: {usage.label}
        </Micro>
      </div>
    </div>
  );
}
