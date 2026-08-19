"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { dollarsToCents } from "@/lib/finance/money";
import { ACCOUNT_TYPE_LABELS, type Account, type AccountType, type CurrencyCode } from "@/lib/finance/types";
import { createAccount, updateAccount } from "./actions";

const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[];

/**
 * Add an account, or correct one.
 *
 * Editing is new. There was previously no way to change an account after
 * creating it — a mistyped opening balance was permanent, and `updateAccount`
 * existed in actions.ts but was called from nowhere. Type and currency stay
 * fixed once set, because changing either would silently reinterpret every
 * transaction already logged against the account.
 */
export function AccountForm({
  account,
  onClose,
  onSaved,
}: {
  /** Omit to create a new account; pass one to edit it. */
  account?: Account;
  onClose: () => void;
  onSaved: (account: Account) => void;
}) {
  const isEdit = Boolean(account);
  const [name, setName] = useState(account?.name ?? "");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "chequing");
  const [currency, setCurrency] = useState<CurrencyCode>(account?.currency ?? "CAD");
  const [balance, setBalance] = useState(
    account ? (account.current_balance_cents / 100).toString() : ""
  );
  const [creditLimit, setCreditLimit] = useState(
    account?.credit_limit_cents ? (account.credit_limit_cents / 100).toString() : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim() || !institution.trim()) return;
    setSaving(true);
    setError(null);

    const balanceCents = dollarsToCents(Number(balance) || 0);
    const creditLimitCents =
      type === "credit_card" && creditLimit ? dollarsToCents(Number(creditLimit)) : null;

    // The saved account comes back from the database rather than being
    // guessed here. The old version invented `id: crypto.randomUUID()` for the
    // copy it handed back, so the account on screen matched no real row and
    // the very next expense logged against it failed with "couldn't find that
    // account" until the page was reloaded.
    const result = isEdit
      ? await updateAccount({
          id: account!.id,
          name: name.trim(),
          institution: institution.trim(),
          balanceCents,
          creditLimitCents,
        })
      : await createAccount({
          name: name.trim(),
          institution: institution.trim(),
          type,
          currency,
          currentBalanceCents: balanceCents,
          isDebt: type === "credit_card",
          creditLimitCents,
        });

    setSaving(false);
    if (result.error || !result.account) {
      setError(result.error ?? "Something went wrong saving that account.");
      return;
    }

    toast.success(isEdit ? `${result.account.name} updated` : `${result.account.name} added`);
    onSaved(result.account);
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit account" : "New account"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. Scene+ Visa)"
            autoFocus
          />
          <Input
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="Institution (e.g. Scotiabank)"
          />
          <div className="flex gap-2">
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
              className="flex-1"
              disabled={isEdit}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
            <Select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="w-24"
              disabled={isEdit}
            >
              <option value="CAD">CAD</option>
              <option value="INR">INR</option>
            </Select>
          </div>
          {isEdit && (
            <p className="micro-sm text-muted-foreground">
              Type and currency can&rsquo;t be changed — they decide how every
              transaction already logged here is counted.
            </p>
          )}
          <Input
            type="number"
            inputMode="decimal"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder={type === "credit_card" ? "Current balance owed" : "Current balance"}
          />
          {type === "credit_card" && (
            <Input
              type="number"
              inputMode="decimal"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              placeholder="Credit limit"
            />
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            type="button"
            className="w-full"
            disabled={saving || !name.trim() || !institution.trim()}
            onClick={handleSubmit}
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add account"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
