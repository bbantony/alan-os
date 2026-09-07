"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";

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
import type { ModuleAccess } from "@/lib/permissions";
import type { UsageSummary } from "@/lib/ai/usage";
import type { Receipt } from "@/lib/finance/types";
import { getCaptureData, type CaptureData } from "@/app/(app)/capture-actions";
import {
  AssistantChat,
  assistantAnswerInFlight,
  stopAssistantDictation,
} from "@/app/(app)/assistant/assistant-chat";
import { useAssistantDockLive } from "./assistant-dock";
import { QuickLogForm } from "@/app/(app)/money/quick-log-form";
import { ReceiptScanButton } from "@/app/(app)/money/receipt-scan-button";
import { ReceiptReviewDialog } from "@/app/(app)/money/receipt-review-dialog";
import { CaptureTaskForm } from "./capture-task-form";
import { CaptureShoppingForm } from "./capture-shopping-form";

/**
 * The capture sheet: the one control on every screen that takes a thought out
 * of your head and puts it in the app, WITHOUT going anywhere.
 *
 * As of 6 Sep 2026 that "without going anywhere" is finally true of the box at
 * the top too. It used to hand what you typed to /assistant in the query
 * string and navigate there — one tap to capture, and a page change to read
 * the answer. Now the assistant IS this sheet: the real chat component is
 * mounted below, so you ask, read the reply, and ask again over whatever
 * screen you were already on. Nothing here navigates any more.
 *
 * What this replaces, and why. The old "+" was a menu of doors: five rows that
 * each navigated somewhere else, so the fastest possible expense was tap, wait
 * for a page, then start typing. A menu of links behind a button is just the
 * nav bar again with an extra tap in front of it. Everything here happens in
 * place instead — the sheet is the form.
 *
 * The order of the sheet is the order of intent:
 *
 *   1. A conversation you can type or talk into, focused the moment it opens.
 *      Most captures are a sentence ("spent 40 at Superstore"), and the
 *      assistant already knows how to turn a sentence into the right row in
 *      the right table. It remembers, too: the sheet opens on the thread you
 *      were last in, from any screen in the app.
 *   2. Then the exact forms, for when you'd rather tap than talk: an expense,
 *      a task, a shopping item, a receipt photo. Picking one opens it here.
 *
 * BOTH jobs have to survive on a phone with the keyboard up, which is why the
 * chat opens COMPACT — one line saying which chat you're in, the box, and the
 * running cost. The four chips stay on screen where they have always been, and
 * the transcript opens out on a tap or the moment you ask something. A sheet
 * where logging an expense costs tap-dismiss-scroll-tap-scroll is not a
 * capture sheet any more.
 *
 * THE CHAT IS NOT A COPY. It is assistant-chat.tsx, the same component the
 * /assistant screen renders, in its `sheet` frame — one implementation, two
 * places, so the two can never drift apart. It also owns the box, the
 * microphone and the send button, which is why none of those live here any
 * more: this component used to keep a second textarea and a second dictation
 * session, and two of either being alive at once is how speech ends up in the
 * wrong box.
 *
 * AND IT IS LEFT OUT WHENEVER THE REAL CHAT IS ALREADY ON SCREEN. That is two
 * cases now, not one:
 *
 *   - /assistant, which is the chat.
 *   - Any screen wide enough for the assistant dock (7 Sep 2026), which puts
 *     the chat permanently down the right-hand side.
 *
 * Mounting a second one here put two composers, two microphones and two
 * independent copies of one conversation on the same screen — with dictation
 * started on the page still typing into the box hidden behind this sheet. In
 * both cases this sheet is the forms and nothing else, and the real chat is
 * behind it or beside it.
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
  const pathname = usePathname();
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
  /**
   * The last AI spend figure the chat saw.
   *
   * The chat is unmounted when the sheet closes, so it is re-seeded from
   * `getCaptureData` on the next open — and that copy is only as fresh as the
   * last fetch. Questions asked in between would make the caption read low
   * until something else invalidated the cache. Remembering the newest figure
   * here, in a component that lives as long as the tab, costs one small state.
   *
   * STATE, not a ref: this value is rendered (it seeds the chat's cost line),
   * and a ref read during render is both a React rule violation and a real
   * bug — a ref changing does not re-render, so the caption could sit on a
   * stale figure until something unrelated redrew the sheet.
   */
  const [latestUsage, setLatestUsage] = useState<UsageSummary | null>(null);
  const [data, setData] = useState<CaptureData | null>(null);
  const [loadingData, setLoadingData] = useState(false);
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
  /**
   * The chat's composer, so the cursor can start there when the sheet opens.
   *
   * Owned here and handed DOWN rather than owned by the chat, because
   * `initialFocus` is a prop of the dialog and the dialog is this component's.
   * It is the chat's only textarea — this sheet no longer has one of its own.
   */
  const askRef = useRef<HTMLTextAreaElement>(null);
  /**
   * Whether anything was asked while this sheet was open.
   *
   * The Assistant can CHANGE things, and the answer is written to the database
   * — so the screen underneath, and the /assistant page held in the router's
   * client cache, are both potentially one exchange out of date. Browser-Back
   * to /assistant was serving a transcript that predated a question asked
   * here, invisible until a hard reload. One `router.refresh()` on close fixes
   * both, and costs nothing when nothing was asked.
   */
  const askedSomethingRef = useRef(false);

  const canAsk = moduleAccess.tasks;
  /**
   * ONE chat, ever. Two screens already have the real one mounted underneath
   * this sheet, and on both of them this sheet's chat is left out entirely —
   * see the note at the top of this file and the header of assistant-chat.tsx.
   * The forms still work in both cases, which is the only reason the "+" still
   * opens at all.
   *
   *   onAssistant   the page IS the chat.
   *   dockLive      the screen is wide enough that the chat is docked down the
   *                 right-hand side. That test lives in assistant-dock.tsx, in
   *                 one function called by both files, so this sheet and the
   *                 dock can never both decide they own the chat.
   *
   * A CONDITION, not a CSS class: a chat hidden with `hidden` is still mounted,
   * still owns a textarea and still catches dictation, which is the whole bug.
   */
  const onAssistant = pathname === "/assistant" || pathname.startsWith("/assistant/");
  const dockLive = useAssistantDockLive(moduleAccess);
  const showChat = canAsk && !onAssistant && !dockLive;
  // Typed to allow "" so the strip can render with NOTHING chosen — the sheet
  // opens on the text box, and a form that is already open under it would be
  // making a choice on your behalf.
  const modes: SegmentedOption<CaptureMode | "">[] = [
    ...(moduleAccess.money ? [{ value: "expense" as const, label: "Expense" }] : []),
    ...(moduleAccess.tasks ? [{ value: "task" as const, label: "Task" }] : []),
    ...(moduleAccess.shopping ? [{ value: "shopping" as const, label: "Shopping" }] : []),
    ...(moduleAccess.money ? [{ value: "receipt" as const, label: "Receipt" }] : []),
  ];

  // Nothing to ask and nothing to fill in — including on /assistant, where the
  // sheet is the forms and nothing else.
  if (!showChat && modes.length === 0) return null;

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
      // The microphone stops when this sheet opens. On /assistant the box
      // being dictated into belongs to the page's chat, which this sheet is
      // now covering — and speech carrying on into a composer nobody can see
      // is how you come back later to half a sentence you had forgotten
      // about. Nothing is thrown away: the words already transcribed stay in
      // that box, and the mic button there stops looking like it is
      // listening. Anywhere else there is no live session and this does
      // nothing, because the only other chat is the one inside this sheet.
      stopAssistantDictation();
      // Lazily, on the tap — not when the app shell mounts. The text box needs
      // none of this and is usable while it's still in the air.
      void loadData();
      return;
    }
    // The chat unmounts with the sheet, which is what stops its microphone and
    // what makes the next open read the thread back from the database rather
    // than from a copy this component was holding. An answer still in the air
    // is NOT lost with it — assistant-chat.tsx parks it outside React, so
    // reopening the sheet shows the question, the "Looking…" and then the
    // reply. This says so out loud, because the alternative is asking (and
    // paying) twice.
    // `showChat` matters: on /assistant an answer in flight belongs to the
    // page's chat, which is still on screen and saying so itself.
    if (showChat && assistantAnswerInFlight()) {
      toast("Still thinking — open this again in a moment to read the answer.");
    }
    setMode(null);
    // Something was asked in here, so what's underneath — and the /assistant
    // page sitting in the router's cache — may be a step behind.
    if (askedSomethingRef.current) {
      askedSomethingRef.current = false;
      router.refresh();
    }
  }

  function closeSheet() {
    handleOpenChange(false);
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
        className={cn(
          "press-hard tap-target fixed bottom-24 z-40 flex size-14 items-center justify-center border-2 border-rule bg-primary text-primary-foreground md:bottom-8",
          // Out from under the dock. This button is fixed to the bottom-right
          // of the VIEWPORT, and the dock's composer — its send button and its
          // microphone — is in exactly that corner, so left at `right-4` the
          // "+" sits on top of the two controls it must never cover. It steps
          // left by the dock's own width (--dock-w in globals.css, shared so
          // the two cannot drift) plus the gap it already had.
          dockLive ? "right-[calc(var(--dock-w)_+_1rem)]" : "right-4"
        )}
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <Plus className="size-6" strokeWidth={3} />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          side="bottom"
          showCloseButton={false}
          // The box is what the sheet is FOR, so the cursor starts in it —
          // unless there is no box here, which is the case on /assistant.
          initialFocus={showChat ? askRef : undefined}
          className="gap-0 p-0"
        >
          {/* ---------------- Header ---------------- */}
          <div className="flex items-start justify-between gap-3 border-b-2 border-rule px-3 py-2.5">
            <div className="min-w-0">
              <DialogTitle>Add</DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                {/* It can honestly say "without leaving this screen" about the
                    whole sheet: the chat below stays here now instead of
                    sending you to /assistant with your sentence in the URL.
                    On /assistant itself there is no chat here — the real one
                    is on the screen behind this. */}
                {showChat
                  ? "Ask it, tell it, or fill one in — without leaving this screen."
                  : onAssistant
                    ? "Fill one in — the chat is on the screen behind this."
                    : dockLive
                      ? "Fill one in — the assistant is docked beside this."
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

          {/* ---------------- The assistant, in full ---------------- */}
          {/* The real chat, not a shortcut to it. `configured` and the running
              cost ride down on the same lazy first-open fetch as the forms
              (capture-actions.ts); until that lands the chat is handed
              `undefined`, which means "assume it works" — the box has to be
              typeable the instant the sheet opens, and if the key really is
              missing the server says so in the conversation itself. */}
          {showChat && (
            <AssistantChat
              variant="sheet"
              moduleAccess={moduleAccess}
              inputRef={askRef}
              configured={data?.assistant?.configured}
              initialUsage={latestUsage ?? data?.assistant?.usage ?? null}
              timeZone={data?.assistant?.timeZone}
              onUsage={(usage) => {
                setLatestUsage(usage);
                // A reply came back, so something was asked in here. What is
                // on the screens outside this sheet may now be stale.
                askedSomethingRef.current = true;
              }}
            />
          )}

          {/* ---------------- The exact forms ---------------- */}
          {modes.length > 0 && (
            <div className="p-3">
              <Micro className="mb-2 block text-muted-foreground">
                {/* "Or" only makes sense when there is something above it to
                    be an alternative to. */}
                {showChat ? "Or fill it in yourself" : "What are you adding?"}
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
