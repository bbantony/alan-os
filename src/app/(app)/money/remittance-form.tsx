"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { todayInAppTimezone } from "@/lib/time";
import { dollarsToCents } from "@/lib/finance/money";
import { balanceDeltaCents } from "@/lib/finance/balance";
import type { Account } from "@/lib/finance/types";
import { getFxRate, logRemittance } from "./actions";

export function RemittanceForm({
  accounts,
  onClose,
  onLogged,
}: {
  accounts: Account[];
  onClose: () => void;
  onLogged: (updatedAccount: Account) => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [cad, setCad] = useState("");
  const [inr, setInr] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayInAppTimezone());
  const [fetchingRate, setFetchingRate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFetchRate() {
    if (!cad) return;
    setFetchingRate(true);
    const rate = await getFxRate("CAD", "INR"); // 1 CAD = rate INR
    setFetchingRate(false);
    if (rate) {
      setInr((Number(cad) * rate).toFixed(2));
    } else {
      setError("Couldn't fetch today's rate — enter the INR amount manually.");
    }
  }

  async function handleSubmit() {
    const cadCents = dollarsToCents(Number(cad) || 0);
    const inrCents = dollarsToCents(Number(inr) || 0);
    if (cadCents <= 0 || inrCents <= 0 || !accountId) return;
    setSaving(true);
    setError(null);

    const account = accounts.find((a) => a.id === accountId)!;
    const result = await logRemittance({
      id: crypto.randomUUID(),
      accountId,
      cadCents,
      inrCents,
      note: note.trim() || null,
      txnDate: date,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const delta = balanceDeltaCents(cadCents, false, account.type);
    onLogged({ ...account, current_balance_cents: account.current_balance_cents + delta });
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send money home</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
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
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">CAD sent</label>
            <Input type="number" inputMode="decimal" value={cad} onChange={(e) => setCad(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground">
              INR received
              <button
                type="button"
                onClick={handleFetchRate}
                disabled={!cad || fetchingRate}
                className="tap-press text-primary disabled:opacity-50"
              >
                {fetchingRate ? "Fetching…" : "Use today's rate"}
              </button>
            </label>
            <Input type="number" inputMode="decimal" value={inr} onChange={(e) => setInr(e.target.value)} placeholder="0.00" />
          </div>
          {Number(cad) > 0 && Number(inr) > 0 && (
            <p className="text-xs text-muted-foreground">1 CAD ≈ {(Number(inr) / Number(cad)).toFixed(2)} INR</p>
          )}
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="button" className="w-full" disabled={saving || !cad || !inr} onClick={handleSubmit}>
            {saving ? "Saving…" : "Log remittance"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
