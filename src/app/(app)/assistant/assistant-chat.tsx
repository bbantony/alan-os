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
}: {
  configured: boolean;
  initialUsage: UsageSummary;
  moduleAccess: ModuleAccess;
}) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
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

  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || thinking) return;

    // Sending ends dictation — otherwise the mic keeps appending to a box
    // that has already been cleared.
    dictationRef.current?.stop();

    const history = messages;
    setMessages([...history, { role: "user", content: trimmed }]);
    setInput("");
    setNotice(null);
    setThinking(true);

    const reply = await ask({ question: trimmed, history });

    setThinking(false);
    setUsage(reply.usage);
    if (reply.unavailable) {
      setNotice(reply.unavailable);
      return;
    }
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: reply.text, actions: reply.actions },
    ]);
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
