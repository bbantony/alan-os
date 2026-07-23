"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { dollarsToCents } from "@/lib/finance/money";
import { ACCOUNT_TYPE_LABELS, type Account, type AccountType, type CurrencyCode } from "@/lib/finance/types";
import { createAccount } from "./actions";

const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[];

export function AccountForm({ onClose, onCreated }: { onClose: () => void; onCreated: (account: Account) => void }) {
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [type, setType] = useState<AccountType>("chequing");
  const [currency, setCurrency] = useState<CurrencyCode>("CAD");
  const [balance, setBalance] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim() || !institution.trim()) return;
    setSaving(true);
    setError(null);
    const balanceCents = dollarsToCents(Number(balance) || 0);
    const result = await createAccount({
      name: name.trim(),
      institution: institution.trim(),
      type,
      currency,
      currentBalanceCents: balanceCents,
      isDebt: type === "credit_card",
      creditLimitCents: type === "credit_card" && creditLimit ? dollarsToCents(Number(creditLimit)) : null,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success(`${name.trim()} added`);
    onCreated({
      id: crypto.randomUUID(),
      user_id: "",
      name: name.trim(),
      institution: institution.trim(),
      type,
      currency,
      current_balance_cents: balanceCents,
      is_debt: type === "credit_card",
      credit_limit_cents: type === "credit_card" && creditLimit ? dollarsToCents(Number(creditLimit)) : null,
      sort_order: 0,
      created_at: new Date().toISOString(),
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Scene+ Visa)" autoFocus />
          <Input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Institution (e.g. Scotiabank)" />
          <div className="flex gap-2">
            <Select value={type} onChange={(e) => setType(e.target.value as AccountType)} className="flex-1">
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)} className="w-24">
              <option value="CAD">CAD</option>
              <option value="INR">INR</option>
            </Select>
          </div>
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
          <Button type="button" className="w-full" disabled={saving || !name.trim()} onClick={handleSubmit}>
            {saving ? "Saving…" : "Add account"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
