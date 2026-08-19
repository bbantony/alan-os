"use client";

import { useEffect, useState } from "react";
import { ImageOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { DateField } from "@/components/ui/date-field";
import { cn } from "@/lib/utils";
import { formatCents, dollarsToCents } from "@/lib/finance/money";
import type { Account, Category, Receipt, ReceiptLineItem, Transaction } from "@/lib/finance/types";
import { approveReceipt, discardReceipt, getReceiptPhotoUrl } from "./receipt-actions";

export function ReceiptReviewDialog({
  receipt,
  accounts,
  categories,
  onClose,
  onDiscarded,
  onApproved,
}: {
  receipt: Receipt;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onDiscarded: (receiptId: string) => void;
  onApproved: (receiptId: string, transactions: Transaction[], accountId: string, updatedBalanceCents: number) => void;
}) {
  const [merchant, setMerchant] = useState(receipt.merchant_guess ?? "");
  const [txnDate, setTxnDate] = useState(receipt.txn_date_guess ?? new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
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
    if (result.error || !result.transactions || result.updatedAccountBalanceCents === undefined) {
      setError(result.error ?? "Something went wrong saving this receipt.");
      return;
    }
    toast.success("Receipt approved");
    onApproved(receipt.id, result.transactions, accountId, result.updatedAccountBalanceCents);
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
                    className="tap-press shrink-0 text-muted-foreground/40 hover:text-destructive"
                    aria-label="Remove item"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
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

          <button onClick={addItem} className="tap-press flex items-center gap-1.5 text-xs font-medium text-primary">
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
