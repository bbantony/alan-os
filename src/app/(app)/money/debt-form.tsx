"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { DateField } from "@/components/ui/date-field";
import { dollarsToCents } from "@/lib/finance/money";
import type { Debt } from "@/lib/finance/types";
import { createDebt } from "./actions";

export function DebtForm({ onClose, onSaved }: { onClose: () => void; onSaved: (debt: Debt) => void }) {
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [apr, setApr] = useState("");
  const [minPayment, setMinPayment] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim() || !balance || !minPayment) return;
    setSaving(true);
    setError(null);
    const balanceCents = dollarsToCents(Number(balance));
    const minPaymentCents = dollarsToCents(Number(minPayment));
    const interestRatePct = Number(apr) || 0;
    const result = await createDebt({
      name: name.trim(),
      balanceCents,
      interestRatePct,
      minPaymentCents,
      targetPayoffDate: targetDate || null,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success(`${name.trim()} added`);
    onSaved({
      id: crypto.randomUUID(),
      user_id: "",
      account_id: null,
      name: name.trim(),
      balance_cents: balanceCents,
      interest_rate_pct: interestRatePct,
      min_payment_cents: minPaymentCents,
      target_payoff_date: targetDate || null,
      created_at: new Date().toISOString(),
    });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New debt</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Student loan)" autoFocus />
          <Input type="number" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="Current balance" />
          <div className="flex gap-2">
            <Input type="number" inputMode="decimal" value={apr} onChange={(e) => setApr(e.target.value)} placeholder="APR %" className="flex-1" />
            <Input
              type="number"
              inputMode="decimal"
              value={minPayment}
              onChange={(e) => setMinPayment(e.target.value)}
              placeholder="Min payment"
              className="flex-1"
            />
          </div>
          <div>
            <label className="micro-sm mb-1.5 block text-muted-foreground">Target payoff date (optional)</label>
            <DateField value={targetDate} onChange={setTargetDate} placeholder="No target date" aria-label="Target payoff date" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="button" className="w-full" disabled={saving || !name.trim() || !balance || !minPayment} onClick={handleSubmit}>
            {saving ? "Saving…" : "Add debt"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
