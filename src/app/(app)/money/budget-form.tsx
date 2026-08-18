"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { DateField } from "@/components/ui/date-field";
import { todayInAppTimezone } from "@/lib/time";
import { dollarsToCents } from "@/lib/finance/money";
import { BUDGET_PERIOD_LABELS, type BudgetPeriod, type Category } from "@/lib/finance/types";
import { createBudget } from "./actions";

const PERIODS = Object.keys(BUDGET_PERIOD_LABELS) as BudgetPeriod[];

export function BudgetForm({
  categories,
  onClose,
  onSaved,
}: {
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<BudgetPeriod>("monthly");
  const [anchorDate, setAnchorDate] = useState(todayInAppTimezone());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!categoryId || !amount) return;
    setSaving(true);
    setError(null);
    const result = await createBudget({
      categoryId,
      amountCents: dollarsToCents(Number(amount)),
      period,
      anchorDate,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success("Budget created");
    onSaved();
  }

  if (categories.length === 0) {
    return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New budget</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Every category already has a budget, or you have no expense categories yet.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New budget</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
          <div className="flex gap-2">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as BudgetPeriod)} className="flex-1">
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {BUDGET_PERIOD_LABELS[p]}
                </option>
              ))}
            </Select>
            <DateField value={anchorDate} onChange={setAnchorDate} aria-label="Anchor date" clearable={false} className="flex-1" />
          </div>
          <p className="text-xs text-muted-foreground">
            The date sets which day the period resets on (e.g. your payday).
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="button" className="w-full" disabled={saving || !categoryId || !amount} onClick={handleSubmit}>
            {saving ? "Saving…" : "Create budget"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
