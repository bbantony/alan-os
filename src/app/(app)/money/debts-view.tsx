"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { formatCents, dollarsToCents } from "@/lib/finance/money";
import { projectPayoff, type DebtInput } from "@/lib/finance/debt-payoff";
import type { Debt } from "@/lib/finance/types";
import { deleteDebt } from "./actions";
import { DebtForm } from "./debt-form";

export function DebtsView({
  debts,
  onChanged,
}: {
  debts: Debt[];
  onChanged: (updater: (prev: Debt[]) => Debt[]) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [extra, setExtra] = useState("");
  const [strategy, setStrategy] = useState<"avalanche" | "snowball">("avalanche");

  const totalBalance = debts.reduce((sum, d) => sum + d.balance_cents, 0);
  const totalMinPayment = debts.reduce((sum, d) => sum + d.min_payment_cents, 0);

  const projection = useMemo(() => {
    if (debts.length === 0) return null;
    const inputs: DebtInput[] = debts.map((d) => ({
      id: d.id,
      balanceCents: d.balance_cents,
      aprPct: d.interest_rate_pct,
      minPaymentCents: d.min_payment_cents,
    }));
    return projectPayoff(inputs, dollarsToCents(Number(extra) || 0));
  }, [debts, extra]);

  const result = projection ? projection[strategy] : null;
  const nameById = new Map(debts.map((d) => [d.id, d.name]));

  async function handleDelete(id: string) {
    onChanged((prev) => prev.filter((d) => d.id !== id));
    await deleteDebt({ id });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-xs font-medium text-muted-foreground">Total debt</p>
        <p className="tabular font-heading text-2xl font-semibold">{formatCents(totalBalance)}</p>
        {totalMinPayment > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">{formatCents(totalMinPayment)}/mo in minimums</p>
        )}
      </div>

      <Button type="button" className="w-full gap-1.5" onClick={() => setShowForm(true)}>
        <Plus className="size-4" />
        New debt
      </Button>

      {debts.length === 0 ? (
        <EmptyState title="No debts tracked" description="Add a debt to see a payoff plan." />
      ) : (
        <>
          <ul className="space-y-2">
            {debts.map((d) => (
              <li key={d.id} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{d.name}</p>
                    <p className="tabular text-xs text-muted-foreground">
                      {formatCents(d.balance_cents)} · {d.interest_rate_pct}% APR · {formatCents(d.min_payment_cents)}/mo min
                    </p>
                  </div>
                  <button onClick={() => handleDelete(d.id)} className="tap-press text-muted-foreground/40 hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="rounded-xl border border-border bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold">Payoff plan</h3>
            <div className="mb-3 flex gap-2">
              <button
                onClick={() => setStrategy("avalanche")}
                className={cn(
                  "tap-press flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium",
                  strategy === "avalanche" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                )}
              >
                Avalanche (highest APR first)
              </button>
              <button
                onClick={() => setStrategy("snowball")}
                className={cn(
                  "tap-press flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium",
                  strategy === "snowball" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                )}
              >
                Snowball (smallest balance first)
              </button>
            </div>
            <Input
              type="number"
              inputMode="decimal"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="Extra $/month toward payoff (optional)"
              className="mb-3"
            />
            {result && (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Time to debt-free</span>
                  <span className="tabular text-sm font-semibold">
                    {result.monthsToPayoff >= 600
                      ? "600+ months"
                      : `${Math.floor(result.monthsToPayoff / 12)}y ${result.monthsToPayoff % 12}m`}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Total interest paid</span>
                  <span className="tabular text-sm font-semibold">{formatCents(result.totalInterestPaidCents)}</span>
                </div>
                {result.payoffOrder.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Payoff order</span>
                    <ol className="mt-1 space-y-0.5 text-xs">
                      {result.payoffOrder.map((id, i) => (
                        <li key={id}>
                          {i + 1}. {nameById.get(id) ?? "—"}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {showForm && (
        <DebtForm
          onClose={() => setShowForm(false)}
          onSaved={(debt) => {
            setShowForm(false);
            onChanged((prev) => [...prev, debt]);
          }}
        />
      )}
    </div>
  );
}
