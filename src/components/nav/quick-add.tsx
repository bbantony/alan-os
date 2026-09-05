"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Mic, Plus, Square, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented";
import { Micro } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { MECHANICAL } from "@/lib/motion";
import { speechSupported, startDictation, type Dictation } from "@/lib/speech";
import type { ModuleAccess } from "@/lib/permissions";
import type { Receipt } from "@/lib/finance/types";
import { getCaptureData, type CaptureData } from "@/app/(app)/capture-actions";
import { QuickLogForm } from "@/app/(app)/money/quick-log-form";
import { ReceiptScanButton } from "@/app/(app)/money/receipt-scan-button";
import { ReceiptReviewDialog } from "@/app/(app)/money/receipt-review-dialog";
import { CaptureTaskForm } from "./capture-task-form";
import { CaptureShoppingForm } from "./capture-shopping-form";

/**
 * The capture sheet: the one control on every screen that takes a thought out
 * of your head and puts it in the app, WITHOUT going anywhere.
 *
 * What this replaces, and why. The old "+" was a menu of doors: five rows that
 * each navigated somewhere else, so the fastest possible expense was tap, wait
 * for a page, then start typing. A menu of links behind a button is just the
 * nav bar again with an extra tap in front of it. Everything here happens in
 * place instead — the sheet is the form.
 *
 * The order of the sheet is the order of intent:
 *
 *   1. A box you can type or talk into, focused the moment it opens. Most
 *      captures are a sentence ("spent 40 at Superstore"), and the Assistant
 *      already knows how to turn a sentence into the right row in the right
 *      table. This box is the front door to that; it hands the sentence over
 *      to /assistant, which asks it on arrival.
 *   2. Then the exact forms, for when you'd rather tap than talk: an expense,
 *      a task, a shopping item, a receipt photo. Picking one opens it here.
 *
 * Only what the account can actually use is offered, on the same ModuleAccess
 * grid the nav and route guard use. The Assistant has no module of its own but
 * IS gated on `tasks` (see ROUTE_MODULE_ALIASES in lib/permissions.ts) — so
 * the text box is gated on `tasks` too, rather than offering a box that sends
 * you to a screen you'd bounce off.
 */

type CaptureMode = "expense" | "task" | "shopping" | "receipt";


export function QuickAdd({ moduleAccess }: { moduleAccess: ModuleAccess }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CaptureMode | null>(null);
  /**
   * The sheet's data, kept for as long as the app shell lives — which is the
   * life of the tab, since this component is mounted by the shell and never
   * unmounts on navigation. Accounts, categories and learned shopping items
   * barely change within a session, and the sheet gets opened over and over:
   * fetching on the FIRST open (never on shell mount) keeps it off the
   * critical path of every page load, and remembering the answer is what
   * makes every open after that instant. An errored result is never kept, so
   * a failure caused by a dropped signal can simply be retried.
   */
  const cacheRef = useRef<CaptureData | null>(null);
  /**
   * The last data that actually arrived, kept even when the cache above is
   * deliberately cleared after a capture. It is the fallback that stops a
   * failed refetch turning a working sheet into an error message.
   */
  const staleRef = useRef<CaptureData | null>(null);
  /** Numbers each handover to the Assistant so two asks are never confused. */
  const askSeqRef = useRef(0);
  const [data, setData] = useState<CaptureData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Receipts photographed here and not yet dealt with, oldest first — the head
   * of the queue is the one on screen.
   *
   * A queue rather than a single receipt because "From gallery" takes SEVERAL
   * photos at once and hands each one back the moment it has been read. Holding
   * only the latest meant photo two replaced photo one WHILE its review screen
   * was open: the words on screen still belonged to the first receipt but the
   * id being saved against had already changed, so approving could file one
   * shop's items under another shop's receipt. Same shape as the Money screen,
   * which has always kept a list and reviewed one at a time.
   */
  const [receiptQueue, setReceiptQueue] = useState<Receipt[]>([]);
  const reviewingReceipt = receiptQueue[0] ?? null;
  const askRef = useRef<HTMLTextAreaElement>(null);

  // Whether this browser can hear you is a CLIENT-ONLY fact: reading it while
  // rendering would differ between the server pass and the client one and
  // produce a hydration mismatch. Same guard, same reasons, as the Assistant's
  // composer — see the long note in assistant-chat.tsx.
  const canDictate = useSyncExternalStore(
    () => () => {},
    () => speechSupported(),
    () => false
  );
  const [listening, setListening] = useState(false);
  const dictationRef = useRef<Dictation | null>(null);
  /** What was already typed before the mic opened, so speech appends. */
  const beforeSpeechRef = useRef("");

  const canAsk = moduleAccess.tasks;
  // Typed to allow "" so the strip can render with NOTHING chosen — the sheet
  // opens on the text box, and a form that is already open under it would be
  // making a choice on your behalf.
  const modes: SegmentedOption<CaptureMode | "">[] = [
    ...(moduleAccess.money ? [{ value: "expense" as const, label: "Expense" }] : []),
    ...(moduleAccess.tasks ? [{ value: "task" as const, label: "Task" }] : []),
    ...(moduleAccess.shopping ? [{ value: "shopping" as const, label: "Shopping" }] : []),
    ...(moduleAccess.money ? [{ value: "receipt" as const, label: "Receipt" }] : []),
  ];

  // An account that can neither ask nor log anything shouldn't see the control.
  if (!canAsk && modes.length === 0) return null;

  async function loadData() {
    if (cacheRef.current) {
      setData(cacheRef.current);
      return;
    }
    setLoadingData(true);
    // What we last knew, if anything. A capture clears the cache so a new
    // account or aisle shows up next time — but if that refetch then fails
    // (the signal dropped between the two), falling back to slightly stale
    // lists is far better than an error where the forms should be. The
    // previous data is only ever replaced by newer data, never by a failure.
    const lastGood = staleRef.current;
    try {
      const result = await getCaptureData();
      if (!result.error) {
        cacheRef.current = result;
        staleRef.current = result;
        setData(result);
        return;
      }
      setData(lastGood ?? result);
    } catch {
      if (lastGood) {
        setData(lastGood);
        return;
      }
      setData({
        error: "Couldn't load your accounts and lists. Check your connection and try again.",
      });
    } finally {
      setLoadingData(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Lazily, on the tap — not when the app shell mounts. The text box needs
      // none of this and is usable while it's still in the air.
      void loadData();
      return;
    }
    // A half-finished mic session must not keep listening to a closed sheet.
    dictationRef.current?.stop();
    setMode(null);
    setNotice(null);
  }

  function closeSheet() {
    handleOpenChange(false);
  }

  function toggleDictation() {
    if (listening) {
      dictationRef.current?.stop();
      return;
    }
    beforeSpeechRef.current = text ? `${text.trim()} ` : "";
    const session = startDictation({
      onText: (spoken) => setText(beforeSpeechRef.current + spoken),
      onDone: (error) => {
        setListening(false);
        dictationRef.current = null;
        if (error === "not-allowed" || error === "service-not-allowed") {
          setNotice("Microphone access is blocked. Allow it in your browser settings to talk to it.");
        } else if (error) {
          setNotice("The microphone stopped working. Type it instead.");
        }
        askRef.current?.focus();
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

  /**
   * Hands what was typed to the Assistant, which asks it the moment that
   * screen opens (see `?q=` in assistant/page.tsx). A full conversation
   * inside the sheet is a later job; this already means one tap, one
   * sentence, done.
   *
   * `?t=` is a one-shot token identifying THIS handover. Opening the sheet
   * again while already on the Assistant is a soft navigation, so that screen
   * re-renders rather than remounting and has to be able to tell a second
   * question from the first — which the words alone cannot do, since "add
   * milk" asked twice an hour apart is two real asks. Without a token the
   * second sentence was swallowed in silence, and the sheet had already
   * cleared the box by then, so it was simply gone.
   */
  function ask() {
    const trimmed = text.trim();
    if (!trimmed) return;
    dictationRef.current?.stop();
    setText("");
    closeSheet();
    // A plain counter, not a clock or a uuid: the token only has to differ
    // from the one before it so the Assistant can tell two asks apart, and a
    // counter cannot collide with itself inside the same millisecond. Both
    // this component and the Assistant live as long as the app shell, so the
    // numbering and the "already asked" guard reset together on a full load.
    askSeqRef.current += 1;
    router.push(
      `/assistant?q=${encodeURIComponent(trimmed)}&t=${askSeqRef.current}`
    );
  }

  /** Something was saved from one of the inline forms. */
  function handleSaved() {
    // The screen underneath may well be showing the very list that just
    // changed. Refreshing it is cheaper than guessing which one it is.
    router.refresh();
    // The sheet's remembered copy of accounts, categories and learned shopping
    // items is now one save out of date, and it is kept for the life of the
    // tab — so without this a category or account created a moment ago never
    // appeared in these forms until a full reload. Dropping it costs one fetch
    // on the next open, which is the cheapest possible way to stay honest.
    cacheRef.current = null;
  }

  const money = data?.money;
  const shopping = data?.shopping;

  function renderMode() {
    if (!mode) return null;

    // The task form needs nothing from the server, so it never waits.
    if (mode === "task") return <CaptureTaskForm onSaved={handleSaved} />;

    if (!data) {
      return (
        <p className="hatch px-3 py-6 text-center">
          <Micro className="text-muted-foreground">Getting things ready…</Micro>
        </p>
      );
    }

    if (data.error) {
      return (
        <div className="flex flex-col items-start gap-3 p-3">
          <p className="text-sm text-destructive">{data.error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadData()}>
            Try again
          </Button>
        </div>
      );
    }

    if (mode === "expense") {
      if (!money) return <ModuleGone what="Money" />;
      return (
        <QuickLogForm
          inline
          accounts={money.accounts}
          categories={money.categories}
          recentMerchants={money.recentMerchants}
          initialAccountId={money.defaultAccountId}
          onClose={closeSheet}
          onTransferred={() => {
            // A transfer hands back no optimistic row (it is two rows and two
            // balance moves), and the form has already said so with its own
            // toast — so this only has to close and let the screen underneath
            // catch up. Without it, moving money from the sheet changed the
            // page you were standing on not at all.
            closeSheet();
            handleSaved();
          }}
          onLogged={() => {
            // QuickLogForm says "$40.00 logged" itself — saying it twice would
            // be two toasts for one action.
            closeSheet();
            handleSaved();
          }}
        />
      );
    }

    if (mode === "shopping") {
      if (!shopping) return <ModuleGone what="Shopping" />;
      return (
        <CaptureShoppingForm
          categories={shopping.categories}
          knownItems={shopping.knownItems}
          onSaved={handleSaved}
        />
      );
    }

    // Receipt. The scan button and the review screen are the Money screen's
    // own, mounted here as they are — a second copy of a receipt flow is the
    // last thing this app needs.
    if (!money) return <ModuleGone what="Money" />;
    return (
      <div className="flex flex-col gap-3 p-3">
        <p className="text-sm">
          Photograph a receipt and the app reads it. You get a screen to check
          it over before anything is saved.
        </p>
        <div className="flex justify-start">
          <ReceiptScanButton
            onUploaded={(receipt) => {
              // The sheet gets out of the way: the review screen is a job of
              // its own, not something to do inside a capture sheet. Later
              // photos from the same batch line up behind the one being
              // reviewed instead of replacing it underneath you.
              closeSheet();
              setReceiptQueue((prev) => [...prev, receipt]);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        aria-label="Add something"
        className="press-hard tap-target fixed right-4 bottom-24 z-40 flex size-14 items-center justify-center border-2 border-rule bg-primary text-primary-foreground md:bottom-8"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <Plus className="size-6" strokeWidth={3} />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          side="bottom"
          showCloseButton={false}
          // The box is what the sheet is FOR, so the cursor starts in it.
          initialFocus={canAsk ? askRef : undefined}
          className="gap-0 p-0"
        >
          {/* ---------------- Header ---------------- */}
          <div className="flex items-start justify-between gap-3 border-b-2 border-rule px-3 py-2.5">
            <div className="min-w-0">
              <DialogTitle>Add</DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                {/* This used to promise that "nothing here leaves this
                    screen" directly above a box whose entire job is to hand
                    what you typed to the Assistant, which IS another screen.
                    The forms below are the part that stays put, so that is
                    what it says now. */}
                {canAsk
                  ? "Type it or say it and the assistant takes it from there. Or fill one in below without leaving this screen."
                  : "Fill one in below without leaving this screen."}
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={closeSheet}
              aria-label="Close"
              className="tap-target tap-press shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" strokeWidth={2.5} />
            </button>
          </div>

          {/* ---------------- Say it / type it ---------------- */}
          {canAsk && (
            <div className="border-b-2 border-rule p-3">
              <div className="flex items-end gap-2 border-2 border-rule bg-surface p-2 shadow-[var(--shadow-hard-sm)]">
                <textarea
                  ref={askRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends, Shift+Enter makes a new line — same as the
                    // Assistant's own composer.
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      ask();
                    }
                  }}
                  rows={2}
                  aria-label="Ask or tell it anything"
                  placeholder={
                    listening ? "Listening…" : "Spent $40 at Superstore…"
                  }
                  className="max-h-28 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
                />
                {canDictate && (
                  <button
                    type="button"
                    onClick={toggleDictation}
                    aria-label={listening ? "Stop listening" : "Talk to it"}
                    aria-pressed={listening}
                    className={cn(
                      "press-hard tap-reach flex size-9 shrink-0 items-center justify-center border-2 border-rule",
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
                  onClick={ask}
                  disabled={!text.trim()}
                  aria-label="Send to the assistant"
                  className="press-hard tap-reach flex size-9 shrink-0 items-center justify-center border-2 border-rule bg-primary text-primary-foreground disabled:pointer-events-none disabled:opacity-40"
                >
                  <ArrowUp className="size-4" strokeWidth={3} />
                </button>
              </div>

              {notice ? (
                <p className="mt-2 border-2 border-destructive px-2 py-1.5 text-xs text-destructive">
                  {notice}
                </p>
              ) : (
                <Micro className="mt-2 block text-muted-foreground">
                  Goes to the assistant, which can log, add and change things
                </Micro>
              )}
            </div>
          )}

          {/* ---------------- The exact forms ---------------- */}
          {modes.length > 0 && (
            <div className="p-3">
              <Micro className="mb-2 block text-muted-foreground">
                Or fill it in yourself
              </Micro>
              <Segmented
                options={modes}
                value={mode ?? ""}
                // A segment's own cell is 36px tall, under the app's 44px tap
                // floor (.tap-target / .tap-reach in globals.css). These four
                // are the primary control on a sheet used one-handed, so they
                // get the floor as an invisible reach — vertical only, so two
                // neighbouring chips can never steal each other's taps. The
                // tighter horizontal padding and the no-wrap are what keep
                // "SHOPPING" on one line on a 320px phone, where it used to
                // break in half and make the strip two rows tall.
                optionClassName="tap-reach px-1 whitespace-nowrap"
                // Tapping the open one closes it again, so the sheet can be
                // shrunk back to just the text box without closing it.
                onChange={(value) => setMode(value === "" || value === mode ? null : value)}
              />
              {loadingData && !mode && (
                <Micro className="mt-2 block text-muted-foreground">
                  Getting your accounts and lists ready…
                </Micro>
              )}
            </div>
          )}

          <AnimatePresence initial={false} mode="wait">
            {mode && (
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={MECHANICAL}
                className="border-t-2 border-rule"
              >
                {renderMode()}
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>

      {/* The receipt review screen, opened after the sheet has closed. It is
          the Money screen's own dialog; nothing here re-implements it. */}
      {reviewingReceipt && money && (
        <ReceiptReviewDialog
          /* Keyed on the receipt so moving to the next one in the queue
             REMOUNTS the review screen. Without this React reuses the open
             dialog, and only the photo (which is fetched when the id changes)
             would follow the new receipt — the merchant, date and line items
             on screen would still be the previous receipt's, and approving
             would save them against this one's id. */
          key={reviewingReceipt.id}
          receipt={reviewingReceipt}
          accounts={money.accounts}
          categories={money.categories}
          initialAccountId={money.defaultAccountId}
          onClose={() => {
            // Closing is "not now", and it means it for the whole batch —
            // otherwise dismissing eight gallery photos would cost eight taps.
            // Nothing is lost: every one of them is still sitting on the Money
            // screen's review list, which is what the toast says.
            const waiting = receiptQueue.length - 1;
            setReceiptQueue([]);
            if (waiting > 0) {
              toast.success(
                waiting === 1
                  ? "1 more receipt is waiting on the Money screen"
                  : `${waiting} more receipts are waiting on the Money screen`
              );
            }
          }}
          /* Dealt with, one way or the other, so the next photo in the batch
             gets its turn. */
          onDiscarded={() => setReceiptQueue((prev) => prev.slice(1))}
          onApproved={() => {
            setReceiptQueue((prev) => prev.slice(1));
            handleSaved();
          }}
        />
      )}
    </>
  );
}

/**
 * The module was switched off (or its data failed to come back) between the
 * sheet opening and this form being picked. Rare, but silence here would look
 * like a broken button.
 */
function ModuleGone({ what }: { what: string }) {
  return (
    <p className="hatch px-3 py-6 text-center text-sm text-muted-foreground">
      {what} isn&rsquo;t switched on for this account.
    </p>
  );
}
