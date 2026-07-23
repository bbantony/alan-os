"use client";

import { useMemo, useState } from "react";
import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { todayInAppTimezone } from "@/lib/time";
import { formatCents } from "@/lib/finance/money";
import { balanceDeltaCents } from "@/lib/finance/balance";
import { getFinanceIcon } from "@/lib/finance/icon-registry";
import type { Account, Category, Transaction } from "@/lib/finance/types";
import { logExpense, type MerchantMemory } from "./actions";

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

export function QuickLogForm({
  accounts,
  categories,
  recentMerchants,
  onClose,
  onLogged,
}: {
  accounts: Account[];
  categories: Category[];
  recentMerchants: MerchantMemory[];
  onClose: () => void;
  onLogged: (txn: Transaction, updatedAccount: Account) => void;
}) {
  const [step, setStep] = useState<"amount" | "details">("amount");
  const [digits, setDigits] = useState(""); // raw digits typed, interpreted as cents
  const [isIncome, setIsIncome] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayInAppTimezone());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = digits === "" ? 0 : parseInt(digits, 10);
  const visibleCategories = categories.filter((c) => c.kind === (isIncome ? "income" : "expense"));

  const merchantSuggestions = useMemo(() => {
    const key = merchant.trim().toLowerCase();
    if (!key) return [];
    return recentMerchants.filter((m) => m.merchant.toLowerCase().includes(key)).slice(0, 4);
  }, [merchant, recentMerchants]);

  function tapKey(key: string) {
    if (key === "") return;
    if (key === "back") {
      setDigits((prev) => prev.slice(0, -1));
      return;
    }
    setDigits((prev) => (prev.length >= 7 ? prev : prev + key));
  }

  function pickMerchantSuggestion(m: MerchantMemory) {
    setMerchant(m.merchant);
    setCategoryId(m.categoryId);
  }

  async function handleSave() {
    if (amountCents <= 0 || !categoryId || !accountId) return;
    setSaving(true);
    setError(null);

    const id = crypto.randomUUID();
    const account = accounts.find((a) => a.id === accountId)!;
    const result = await logExpense({
      id,
      accountId,
      categoryId,
      amountCents,
      currency: account.currency,
      merchant: merchant.trim() || null,
      note: note.trim() || null,
      txnDate: date,
      isIncome,
    });

    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }

    const optimisticTxn: Transaction = {
      id,
      user_id: "",
      account_id: accountId,
      category_id: categoryId,
      amount_cents: amountCents,
      currency: account.currency,
      fx_rate_to_cad: null,
      merchant: merchant.trim() || null,
      note: note.trim() || null,
      txn_date: date,
      source: "manual",
      receipt_id: null,
      created_at: new Date().toISOString(),
    };
    const delta = balanceDeltaCents(amountCents, isIncome, account.type);
    toast.success(`${formatCents(amountCents)} logged`);
    onLogged(optimisticTxn, { ...account, current_balance_cents: account.current_balance_cents + delta });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{step === "amount" ? "Log a transaction" : "Details"}</DialogTitle>
        </DialogHeader>

        {step === "amount" ? (
          <div className="space-y-4">
            <div className="flex justify-center gap-1 rounded-lg border border-border p-0.5">
              {(["expense", "income"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setIsIncome(k === "income")}
                  className={cn(
                    "tap-press flex-1 rounded-md px-3 py-1.5 text-xs font-semibold capitalize",
                    (k === "income") === isIncome ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="tabular text-center font-heading text-5xl font-semibold">
              {formatCents(amountCents)}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {KEYPAD.map((key, i) =>
                key === "" ? (
                  <div key={i} />
                ) : (
                  <button
                    key={i}
                    onClick={() => tapKey(key)}
                    className="tap-press flex h-14 items-center justify-center rounded-xl border border-border bg-surface text-xl font-medium hover:bg-muted"
                  >
                    {key === "back" ? <Delete className="size-5" /> : key}
                  </button>
                )
              )}
            </div>

            <Button type="button" className="w-full" disabled={amountCents <= 0} onClick={() => setStep("details")}>
              Next
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="tabular text-center text-2xl font-semibold">{formatCents(amountCents)}</div>

            <div className="grid grid-cols-4 gap-2">
              {visibleCategories.map((c) => {
                const Icon = getFinanceIcon(c.icon);
                const active = categoryId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCategoryId(c.id)}
                    className={cn(
                      "tap-press flex flex-col items-center gap-1 rounded-xl border p-2 text-center",
                      active ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
                    )}
                  >
                    <Icon className="size-5" style={{ color: active ? undefined : c.color }} />
                    <span className="text-[10px] leading-tight">{c.name}</span>
                  </button>
                );
              })}
            </div>

            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>

            <div className="relative">
              <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Merchant (optional)" />
              {merchantSuggestions.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-md">
                  {merchantSuggestions.map((m) => (
                    <li key={m.merchant}>
                      <button
                        onClick={() => pickMerchantSuggestion(m)}
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        {m.merchant}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep("amount")}>
                Back
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={saving || !categoryId || !accountId}
                onClick={handleSave}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
