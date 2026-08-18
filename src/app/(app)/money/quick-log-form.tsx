"use client";

import { useMemo, useState } from "react";
import { Delete, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toast";
import { DateField } from "@/components/ui/date-field";
import { cn } from "@/lib/utils";
import { todayInAppTimezone } from "@/lib/time";
import { formatCents } from "@/lib/finance/money";
import { balanceDeltaCents } from "@/lib/finance/balance";
import { getFinanceIcon } from "@/lib/finance/icon-registry";
import type { Account, Category, Transaction } from "@/lib/finance/types";
import { logExpense, type MerchantMemory } from "./actions";

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

/**
 * The ≤5-second expense logger.
 *
 * Redesigned around the one thing it exists to do: the amount is now a full-
 * bleed inverted block at the top, and the keypad is a single gapless grid of
 * ruled cells rather than twelve floating rounded buttons. Beyond the styling,
 * the keys got bigger (56px → 64px), which matters more here than anywhere
 * else in the app — this is the screen used one-handed, in a shop, in a hurry.
 */
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
  const visibleCategories = categories.filter(
    (c) => c.kind === (isIncome ? "income" : "expense")
  );

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
    onLogged(optimisticTxn, {
      ...account,
      current_balance_cents: account.current_balance_cents + delta,
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent showCloseButton={false} className="max-h-[90dvh] gap-0 overflow-y-auto p-0">
        {/* The amount, as the emphasised block. On the details step it shrinks
            but stays on screen — you should never lose sight of the figure
            you're categorising. */}
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-b-2 border-rule bg-foreground px-4 text-background",
            step === "amount" ? "py-5" : "py-3"
          )}
        >
          <div className="min-w-0">
            <p className="micro-sm text-background/60">
              {isIncome ? "Income" : "Expense"}
            </p>
            <p
              className={cn(
                "stat mt-1 truncate",
                step === "amount" ? "text-4xl" : "text-2xl"
              )}
            >
              {formatCents(amountCents)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap-press shrink-0 text-background/60 hover:text-background"
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </div>

        {step === "amount" ? (
          <>
            <div className="p-3">
              <Segmented
                options={[
                  { value: "expense", label: "Expense" },
                  { value: "income", label: "Income" },
                ]}
                value={isIncome ? "income" : "expense"}
                onChange={(v) => setIsIncome(v === "income")}
              />
            </div>

            {/* One gapless grid: the keypad reads as a single object rather
                than twelve separate buttons. */}
            <div className="grid grid-cols-3 gap-px border-y-2 border-rule bg-hairline">
              {KEYPAD.map((key, i) =>
                key === "" ? (
                  <div key={i} className="bg-surface" />
                ) : (
                  <button
                    key={i}
                    type="button"
                    onClick={() => tapKey(key)}
                    aria-label={key === "back" ? "Delete last digit" : key}
                    className="press flex h-16 items-center justify-center bg-surface font-heading text-2xl font-bold tabular transition-colors hover:bg-muted active:bg-foreground active:text-background"
                  >
                    {key === "back" ? <Delete className="size-5" strokeWidth={2.5} /> : key}
                  </button>
                )
              )}
            </div>

            <div className="p-3">
              <Button
                type="button"
                block
                size="lg"
                disabled={amountCents <= 0}
                onClick={() => setStep("details")}
              >
                Next
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            <div>
              <label className="micro-sm mb-1.5 block text-muted-foreground">Category</label>
              <div className="grid grid-cols-4 gap-px border-2 border-rule bg-hairline">
                {visibleCategories.map((c) => {
                  const Icon = getFinanceIcon(c.icon);
                  const active = categoryId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCategoryId(c.id)}
                      aria-pressed={active}
                      className={cn(
                        "tap-press flex flex-col items-center gap-1 p-2 text-center transition-colors",
                        active
                          ? "bg-foreground text-background"
                          : "bg-surface hover:bg-muted"
                      )}
                    >
                      <Icon
                        className="size-5"
                        style={{ color: active ? undefined : c.color }}
                      />
                      <span className="micro-sm w-full truncate text-[0.5625rem]">
                        {c.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="micro-sm mb-1.5 block text-muted-foreground">Account</label>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="micro-sm mb-1.5 block text-muted-foreground">
                Merchant (optional)
              </label>
              <div className="relative">
                <Input
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  placeholder="Where?"
                />
                {merchantSuggestions.length > 0 && (
                  <ul className="absolute z-10 w-full border-2 border-rule bg-surface shadow-[var(--shadow-hard-md)]">
                    {merchantSuggestions.map((m, i) => (
                      <li key={m.merchant} className={cn(i > 0 && "border-t border-hairline")}>
                        <button
                          type="button"
                          onClick={() => pickMerchantSuggestion(m)}
                          className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                        >
                          {m.merchant}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div>
              <label className="micro-sm mb-1.5 block text-muted-foreground">
                Note (optional)
              </label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything to remember?"
              />
            </div>

            <div>
              <label className="micro-sm mb-1.5 block text-muted-foreground">Date</label>
              <DateField value={date} onChange={setDate} clearable={false} aria-label="Date" />
            </div>

            {error && (
              <p className="border-2 border-destructive px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStep("amount")}
              >
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
