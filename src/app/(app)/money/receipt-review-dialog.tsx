"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { formatCents, dollarsToCents } from "@/lib/finance/money";
import type { Account, Category, Receipt, ReceiptLineItem, Transaction } from "@/lib/finance/types";
import { approveReceipt, discardReceipt } from "./receipt-actions";

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
          {!aiFilledSomething && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              This one needs to be typed in by hand — add each item below.
            </p>
          )}

          <div className="flex gap-2">
            <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Merchant" className="flex-1" />
            <Input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} className="w-36" />
          </div>

          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <ul className="space-y-2">
            {items.map((item, i) => (
              <li key={i} className="rounded-xl border border-border bg-surface p-2.5">
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
                <select
                  value={item.category_id ?? ""}
                  onChange={(e) => updateItem(i, { category_id: e.target.value || null })}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs"
                >
                  <option value="">Pick a category…</option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>

          <button onClick={addItem} className="tap-press flex items-center gap-1.5 text-xs font-medium text-primary">
            <Plus className="size-3.5" />
            Add item
          </button>

          <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-sm font-medium">Total</span>
            <span className="tabular text-lg font-semibold">{formatCents(total)}</span>
          </div>

          <div className="flex gap-2 rounded-lg border border-border p-0.5">
            <button
              onClick={() => setSplitByCategory(false)}
              className={cn(
                "tap-press flex-1 rounded-md px-2 py-1.5 text-xs font-medium",
                !splitByCategory ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              Save as one transaction
            </button>
            <button
              onClick={() => setSplitByCategory(true)}
              className={cn(
                "tap-press flex-1 rounded-md px-2 py-1.5 text-xs font-medium",
                splitByCategory ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              Split by category
            </button>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

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
