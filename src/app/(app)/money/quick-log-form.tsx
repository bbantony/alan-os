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

/** Spent / received / moved between accounts. One screen, three shapes. */
type TxnKind = "spent" | "received" | "moved";

const KIND_LABELS: Record<TxnKind, string> = {
  spent: "Spent",
  received: "Received",
  moved: "Moved",
};
import { guessCategoryForMerchant, type CategoryGuess } from "@/lib/finance/categorise";
import { logExpense, logTransfer, type MerchantMemory } from "./actions";

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
  initialAccountId = null,
  onClose,
  onLogged,
}: {
  accounts: Account[];
  categories: Category[];
  recentMerchants: MerchantMemory[];
  /**
   * The "Default account" money preference, validated server-side against the
   * live account list before it gets here. Null means first in the list.
   */
  initialAccountId?: string | null;
  onClose: () => void;
  onLogged: (txn: Transaction, updatedAccount: Account) => void;
}) {
  const [step, setStep] = useState<"amount" | "details">("amount");
  const [digits, setDigits] = useState(""); // raw digits typed, interpreted as cents
  /**
   * What kind of thing this is. One screen for all of them was the point —
   * Alan asked for "one fast screen for every kind" rather than hunting for
   * the right form. `spent` and `received` were always here as an
   * income toggle; `moved` is new (migration 0037).
   */
  const [kind, setKind] = useState<TxnKind>("spent");
  const isIncome = kind === "received";
  const isTransfer = kind === "moved";
  const [categoryId, setCategoryId] = useState<string | null>(null);
  // Re-validated against the live list, like every other money form — the
  // preference can name an account deleted since it was saved.
  const seededAccountId =
    accounts.find((a) => a.id === initialAccountId)?.id ?? accounts[0]?.id ?? "";
  const [accountId, setAccountId] = useState(seededAccountId);
  // For "Moved": any account other than the from-side, so the default is never
  // a same-account transfer (which the server rejects). Matters now that the
  // from-side can start as any account via the default-account preference.
  const [toAccountId, setToAccountId] = useState(
    accounts.find((a) => a.id !== seededAccountId)?.id ?? accounts[0]?.id ?? ""
  );
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayInAppTimezone());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Why the category is what it is, when the app chose it rather than you.
   *
   * Null once you pick one yourself — from that moment the choice is yours and
   * the app must stop explaining a decision it is no longer making.
   */
  const [autoGuess, setAutoGuess] = useState<CategoryGuess | null>(null);

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
    // The remembered category only comes along if its kind agrees with the
    // Spent/Received toggle. The optimistic balance move on this screen goes
    // by the toggle while the server goes by the category itself — a
    // remembered income category quietly filled in on a "Spent" entry would
    // make the number on screen disagree with the saved one. A mismatched
    // memory fills nothing (and clears any earlier guess, which was for
    // whatever was typed before, not this merchant).
    const remembered = categories.find((c) => c.id === m.categoryId);
    if (remembered && remembered.kind === (isIncome ? "income" : "expense")) {
      setCategoryId(m.categoryId);
      setAutoGuess({ categoryId: m.categoryId, source: "learned", count: m.count });
    } else if (autoGuess !== null) {
      setCategoryId(null);
      setAutoGuess(null);
    }
  }

  /**
   * Fills the category in as the merchant is typed.
   *
   * Only ever fills a category the person has NOT chosen themselves, or one
   * this same guesser filled a keystroke ago — so typing "Sup" then "Superstore"
   * refines the guess, but a category you tapped is never quietly replaced.
   */
  function handleMerchantChange(next: string) {
    setMerchant(next);
    if (categoryId !== null && autoGuess === null) return;

    const guess = guessCategoryForMerchant(
      next,
      recentMerchants,
      categories,
      isIncome ? "income" : "expense"
    );
    if (guess) {
      setCategoryId(guess.categoryId);
      setAutoGuess(guess);
    } else if (autoGuess !== null) {
      // The guess that was there no longer applies to what's now typed.
      setCategoryId(null);
      setAutoGuess(null);
    }
  }

  function chooseCategory(id: string) {
    setCategoryId(id);
    setAutoGuess(null);
  }

  async function handleSave() {
    if (amountCents <= 0 || !accountId) return;

    // A transfer has no merchant and no category — it is two accounts and an
    // amount — so it takes its own path and closes rather than trying to
    // hand back one optimistic transaction for what is actually two rows.
    if (isTransfer) {
      if (toAccountId === accountId) {
        setError("Pick two different accounts.");
        return;
      }
      setSaving(true);
      setError(null);
      const moved = await logTransfer({
        fromAccountId: accountId,
        toAccountId,
        amountCents,
        txnDate: date,
        note: note.trim() || null,
      });
      setSaving(false);
      if (moved.error) {
        setError(moved.error);
        return;
      }
      onClose();
      return;
    }

    if (!categoryId) return;
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      setError("That account doesn't exist any more — pick another one.");
      return;
    }
    setSaving(true);
    setError(null);

    const id = crypto.randomUUID();
    let result: Awaited<ReturnType<typeof logExpense>>;
    try {
      result = await logExpense({
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
    } catch {
      setError("Couldn't save — check your connection and try again.");
      return;
    } finally {
      setSaving(false);
    }
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
      // This form only logs ordinary expenses/income — never transfers.
      transfer_group_id: null,
      transfer_direction: null,
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
              {/* Was a two-way Income/Expense label and would have shown
                  "Expense" over a transfer. */}
              {KIND_LABELS[kind]}
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
            {/* Sits above the keypad, where the Expense/Income toggle used to
                be, because the kind changes what the SECOND step asks for: a
                transfer needs two accounts and no category, and discovering
                that after typing a merchant would be the wrong order. */}
            <div className="p-3">
              <Segmented
                options={[
                  { value: "spent", label: KIND_LABELS.spent },
                  { value: "received", label: KIND_LABELS.received },
                  { value: "moved", label: KIND_LABELS.moved, disabled: accounts.length < 2 },
                ]}
                value={kind}
                onChange={(v) => {
                  setKind(v as TxnKind);
                  // A category chosen for a purchase means nothing on a
                  // transfer, and an expense category is wrong on income.
                  setCategoryId(null);
                  setAutoGuess(null);
                }}
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

            <div className="flex flex-col gap-3 p-3">
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
            {isTransfer && (
              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">
                  Into which account
                </label>
                <Select
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="h-10 w-full border-2 border-rule bg-surface px-2 text-sm"
                >
                  {accounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </Select>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Moving money between your own accounts isn&rsquo;t spending, so this
                  won&rsquo;t count against any budget or show up in your reports.
                </p>
              </div>
            )}

            <div className={cn(isTransfer && "hidden")}>
              <label className="micro-sm mb-1.5 block text-muted-foreground">
                Category
                {/* Says WHY it filled itself in. A category that appears on its
                    own with no explanation reads as a bug the first time it
                    happens; one that says "you usually do" reads as the app
                    paying attention. Disappears the moment you choose your
                    own, because then it isn't the app's decision to explain. */}
                {autoGuess && (
                  <span className="ml-2 normal-case tracking-normal text-primary">
                    {autoGuess.source === "learned"
                      ? autoGuess.count && autoGuess.count > 1
                        ? `filled in — you've used this ${autoGuess.count} times`
                        : "filled in — you used this last time"
                      : "filled in — change it if that's wrong"}
                  </span>
                )}
              </label>
              <div className="grid grid-cols-4 gap-px border-2 border-rule bg-hairline">
                {visibleCategories.map((c) => {
                  const Icon = getFinanceIcon(c.icon);
                  const active = categoryId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => chooseCategory(c.id)}
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
              {accounts.length === 0 ? (
                // Says why Save is greyed out. Before, the picker was simply
                // empty and the button dead, with nothing explaining either.
                <p className="hatch border-2 border-rule px-3 py-2 text-xs text-muted-foreground">
                  You need an account first — close this and tap{" "}
                  <span className="font-semibold">New account</span> on the Overview tab.
                </p>
              ) : (
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.currency !== "CAD" ? ` (${a.currency})` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            {/* A transfer has no merchant — there is no shop, only two of your
                own accounts. */}
            <div className={cn(isTransfer && "hidden")}>
              <label className="micro-sm mb-1.5 block text-muted-foreground">
                Merchant (optional)
              </label>
              <div className="relative">
                <Input
                  value={merchant}
                  onChange={(e) => handleMerchantChange(e.target.value)}
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
                // A transfer needs two accounts and no category; everything
                // else needs a category and one account.
                disabled={
                  saving ||
                  !accountId ||
                  (isTransfer ? !toAccountId || toAccountId === accountId : !categoryId)
                }
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
