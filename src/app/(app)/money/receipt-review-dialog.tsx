"use client";

import { useEffect, useState } from "react";
import { ImageOff, Plus, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { DateField } from "@/components/ui/date-field";
import { cn } from "@/lib/utils";
import { todayInAppTimezone } from "@/lib/time";
import { formatCents, dollarsToCents } from "@/lib/finance/money";
import type { Account, Category, Receipt, ReceiptLineItem, Transaction } from "@/lib/finance/types";
import { approveReceipt, discardReceipt, getReceiptPhotoUrl } from "./receipt-actions";
import { flagDearItems, type PriceFlag } from "@/app/(app)/shopping/price-actions";

export function ReceiptReviewDialog({
  receipt,
  accounts,
  categories,
  initialAccountId = null,
  onClose,
  onDiscarded,
  onApproved,
}: {
  receipt: Receipt;
  accounts: Account[];
  categories: Category[];
  /** The "Default account" money preference, already validated by the server.
      Null means first in the list, same as quick-log. */
  initialAccountId?: string | null;
  onClose: () => void;
  onDiscarded: (receiptId: string) => void;
  /** `updatedBalanceCents` is null when the balance move failed — the receipt
      is still approved and the transactions still saved, so the caller should
      leave the displayed balance alone rather than write a wrong number. */
  onApproved: (
    receiptId: string,
    transactions: Transaction[],
    accountId: string,
    updatedBalanceCents: number | null
  ) => void;
}) {
  const [merchant, setMerchant] = useState(receipt.merchant_guess ?? "");
  // todayInAppTimezone, not toISOString(): the UTC date is already TOMORROW
  // after 6pm in Winnipeg, so an evening receipt pre-filled the wrong day and
  // could file the spend into the wrong budget period.
  const [txnDate, setTxnDate] = useState(
    receipt.txn_date_guess ?? todayInAppTimezone()
  );
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.id === initialAccountId)?.id ?? accounts[0]?.id ?? ""
  );
  const [items, setItems] = useState<ReceiptLineItem[]>(
    receipt.line_items.length > 0
      ? receipt.line_items
      : [{ raw_name: "", clean_name: "", price_cents: 0, category_id: null, approved: true }]
  );
  const [splitByCategory, setSplitByCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoState, setPhotoState] = useState<"loading" | "ready" | "failed">("loading");
  const [photoExpanded, setPhotoExpanded] = useState(false);
  const [priceFlags, setPriceFlags] = useState<PriceFlag[]>([]);

  // "That's dearer than you usually pay", from your own purchase history.
  // Debounced and re-run as items change, because the AI's first guess at a
  // name or price is often edited before approval and the flag should follow.
  useEffect(() => {
    const named = items
      .map((it, index) => ({ index, name: it.clean_name || it.raw_name, priceCents: it.price_cents }))
      .filter((it) => it.name.trim() && it.priceCents > 0);
    let cancelled = false;
    // Everything goes through the timer, including the empty case — setting
    // state synchronously in an effect body causes a cascading render, and the
    // linter is right to object.
    const timer = setTimeout(() => {
      if (named.length === 0) {
        setPriceFlags([]);
        return;
      }
      flagDearItems({ items: named }).then((flags) => {
        if (cancelled) return;
        // flagDearItems indexes into the filtered list, so map back to the
        // real row indices before rendering.
        setPriceFlags(flags.map((f) => ({ ...f, index: named[f.index].index })));
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [items]);

  // The bucket is private, so the photo needs a signed link fetched on open.
  useEffect(() => {
    let cancelled = false;
    getReceiptPhotoUrl({ id: receipt.id }).then((url) => {
      if (cancelled) return;
      setPhotoUrl(url);
      setPhotoState(url ? "ready" : "failed");
    });
    return () => {
      cancelled = true;
    };
  }, [receipt.id]);

  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const total = items.reduce((sum, li) => sum + li.price_cents, 0);
  const aiFilledSomething = receipt.line_items.length > 0;

  function updateItem(index: number, patch: Partial<ReceiptLineItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { raw_name: "", clean_name: "", price_cents: 0, category_id: null, approved: true }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleApprove() {
    setSaving(true);
    setError(null);
    const result = await approveReceipt({
      id: receipt.id,
      accountId,
      merchant: merchant.trim() || null,
      txnDate,
      lineItems: items.filter((li) => li.clean_name.trim() && li.price_cents > 0),
      splitByCategory,
    });
    setSaving(false);
    if (result.error || !result.transactions) {
      setError(result.error ?? "Something went wrong saving this receipt.");
      return;
    }
    // A missing balance is a WARNING, not a failure — the receipt IS approved
    // and the transactions ARE saved. Treating it as a failure kept the dialog
    // open and made a second tap answer "already approved".
    if (result.warning) toast.warning(result.warning);
    else toast.success("Receipt approved");
    onApproved(
      receipt.id,
      result.transactions,
      accountId,
      result.updatedAccountBalanceCents ?? null
    );
  }

  async function handleDiscard() {
    setSaving(true);
    await discardReceipt({ id: receipt.id });
    setSaving(false);
    toast.success("Receipt discarded");
    onDiscarded(receipt.id);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review receipt</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* The photo itself. It was uploaded and then never shown, which
              made hand-entry a job of holding the paper receipt in one hand
              while typing with the other — the photo you'd just taken was
              sitting in storage the whole time. Tap to enlarge, since a
              thumbnail is enough to check against but not to read from. */}
          {photoState !== "failed" && (
            <button
              type="button"
              onClick={() => photoUrl && setPhotoExpanded((v) => !v)}
              className="tap-press block w-full overflow-hidden border-2 border-rule bg-muted"
              aria-label={photoExpanded ? "Shrink receipt photo" : "Enlarge receipt photo"}
            >
              {photoState === "loading" ? (
                <span className="micro-sm flex h-24 items-center justify-center text-muted-foreground">
                  Loading photo…
                </span>
              ) : (
                // A plain <img>: this is a short-lived signed URL to a private
                // bucket, so next/image's optimiser can't cache or re-serve it
                // usefully, and the photo was already shrunk in the browser
                // before upload.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl!}
                  alt="The receipt you photographed"
                  className={cn(
                    "w-full bg-surface object-contain transition-[max-height] duration-150",
                    photoExpanded ? "max-h-[60vh]" : "max-h-40"
                  )}
                />
              )}
            </button>
          )}

          {photoState === "failed" && (
            <p className="hatch flex items-center gap-2 border-2 border-rule px-3 py-2 text-xs text-muted-foreground">
              <ImageOff className="size-3.5 shrink-0" />
              The photo couldn&rsquo;t be loaded — the details below still save fine.
            </p>
          )}

          {!aiFilledSomething && (
            <p className="hatch border-2 border-rule px-3 py-2 text-xs text-muted-foreground">
              This one needs to be typed in by hand — add each item below.
            </p>
          )}

          <div className="flex gap-2">
            <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Merchant" className="flex-1" />
            <DateField value={txnDate} onChange={setTxnDate} clearable={false} aria-label="Date" className="w-40" />
          </div>

          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>

          <ul className="space-y-2">
            {items.map((item, i) => (
              <li key={i} className="border-2 border-rule bg-surface p-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <Input
                    value={item.clean_name}
                    onChange={(e) => updateItem(i, { clean_name: e.target.value })}
                    placeholder="Item name"
                    className="h-8 flex-1 text-sm"
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={item.price_cents === 0 ? "" : (item.price_cents / 100).toString()}
                    onChange={(e) => updateItem(i, { price_cents: dollarsToCents(Number(e.target.value) || 0) })}
                    placeholder="0.00"
                    className="h-8 w-20 text-sm"
                  />
                  <button
                    onClick={() => removeItem(i)}
                    className="tap-press tap-target shrink-0 text-muted-foreground/40 hover:text-destructive"
                    aria-label="Remove item"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                {priceFlags.find((f) => f.index === i) && (
                  <p className="mb-2 flex items-center gap-1.5 border-2 border-warn px-2 py-1">
                    <TrendingUp className="size-3 shrink-0 text-warn" strokeWidth={2.5} />
                    <span className="micro-sm">
                      {priceFlags.find((f) => f.index === i)!.percent}% more than usual — you
                      normally pay{" "}
                      {formatCents(priceFlags.find((f) => f.index === i)!.typicalCents)}
                    </span>
                  </p>
                )}
                <Select
                  value={item.category_id ?? ""}
                  onChange={(e) => updateItem(i, { category_id: e.target.value || null })}
                  className="h-8 text-xs"
                >
                  <option value="">Pick a category…</option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>

          <button onClick={addItem} className="tap-press tap-target flex items-center gap-1.5 text-xs font-medium text-primary">
            <Plus className="size-3.5" />
            Add item
          </button>

          {/* The running total is the one figure that decides whether this
              receipt is right, so it gets the emphasised block. */}
          <div className="flex items-center justify-between border-2 border-rule bg-foreground px-3 py-2.5 text-background">
            <span className="micro-sm text-background/60">Total</span>
            <span className="stat text-2xl">{formatCents(total)}</span>
          </div>

          {/* Was a hand-rolled two-button toggle predating the Segmented
              control; same choice, now expressed the app's one way. */}
          <Segmented
            options={[
              { value: "one", label: "One transaction" },
              { value: "split", label: "Split by category" },
            ]}
            value={splitByCategory ? "split" : "one"}
            onChange={(v) => setSplitByCategory(v === "split")}
          />

          {error && (
            <p className="border-2 border-destructive px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={saving} onClick={handleDiscard}>
              Discard
            </Button>
            <Button type="button" className="flex-1" disabled={saving || !accountId} onClick={handleApprove}>
              {saving ? "Saving…" : "Approve"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
