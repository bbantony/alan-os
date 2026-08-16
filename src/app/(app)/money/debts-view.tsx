"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Stat, StatStrip } from "@/components/ui/stat";
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

  if (debts.length === 0) {
    return (
      <>
        <EmptyState
          title="No debts tracked"
          description="Add a debt to see a payoff plan."
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus className="size-4" strokeWidth={3} />
              New debt
            </Button>
          }
        />
        {showForm && (
          <DebtForm
            onClose={() => setShowForm(false)}
            onSaved={(debt) => {
              setShowForm(false);
              onChanged((prev) => [...prev, debt]);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <StatStrip columns={2}>
        <Stat
          label="Total owed"
          value={formatCents(totalBalance)}
          tone="alert"
          size="lg"
          sub={`across ${debts.length} debt${debts.length > 1 ? "s" : ""}`}
        />
        <Stat
          label="Minimums"
          value={formatCents(totalMinPayment)}
          size="lg"
          sub="per month"
        />
      </StatStrip>

      <Panel>
        <PanelHead
          title="Debts"
          count={debts.length}
          action={
            <button
              type="button"
              onClick={() => setShowForm(true)}
              aria-label="New debt"
              className="tap-press flex size-7 items-center justify-center border-2 border-rule bg-surface transition-colors hover:bg-foreground hover:text-background"
            >
              <Plus className="size-4" strokeWidth={3} />
            </button>
          }
        />
        <ul>
          {debts.map((d, i) => (
            <li
              key={d.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                i > 0 && "border-t border-hairline"
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{d.name}</p>
                <p className="micro-sm mt-0.5 tabular text-muted-foreground">
                  {d.interest_rate_pct}% APR · {formatCents(d.min_payment_cents)}/mo min
                </p>
              </div>
              <span className="stat shrink-0 text-lg">{formatCents(d.balance_cents)}</span>
              <button
                type="button"
                onClick={() => handleDelete(d.id)}
                className="tap-press shrink-0 text-muted-foreground/50 transition-colors hover:text-destructive"
                aria-label={`Delete ${d.name}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      {/* ---------------- Payoff plan ---------------- */}
      <Panel>
        <PanelHead title="Payoff plan" />

        <div className="flex flex-col gap-3 p-3">
          {/* The two strategies were a pair of hand-rolled toggle buttons that
              predated the Segmented control. Same choice, now the app's one
              way of expressing a choice between two modes. */}
          <Segmented
            options={[
              { value: "avalanche", label: "Avalanche" },
              { value: "snowball", label: "Snowball" },
            ]}
            value={strategy}
            onChange={setStrategy}
          />
          <p className="micro-sm text-muted-foreground">
            {strategy === "avalanche"
              ? "Highest interest rate first — cheapest overall."
              : "Smallest balance first — quickest wins."}
          </p>

          <div>
            <label className="micro-sm mb-1.5 block text-muted-foreground">
              Extra per month (optional)
            </label>
            <Input
              type="number"
              inputMode="decimal"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        {result && (
          <>
            <div className="grid grid-cols-2 gap-px border-t-2 border-rule bg-hairline">
              <div className="bg-surface p-3">
                <p className="micro-sm text-muted-foreground">Debt-free in</p>
                <p className="stat mt-1 text-xl">
                  {result.monthsToPayoff >= 600
                    ? "600+ mo"
                    : `${Math.floor(result.monthsToPayoff / 12)}y ${result.monthsToPayoff % 12}m`}
                </p>
              </div>
              <div className="bg-surface p-3">
                <p className="micro-sm text-muted-foreground">Interest paid</p>
                <p className="stat mt-1 text-xl text-destructive">
                  {formatCents(result.totalInterestPaidCents)}
                </p>
              </div>
            </div>

            {result.payoffOrder.length > 0 && (
              <div className="border-t-2 border-rule">
                <p className="micro border-b border-hairline px-3 py-2 text-muted-foreground">
                  Order
                </p>
                <ol>
                  {result.payoffOrder.map((id, i) => (
                    <li
                      key={id}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 text-sm",
                        i > 0 && "border-t border-hairline"
                      )}
                    >
                      <span className="micro-sm flex size-5 shrink-0 items-center justify-center border border-rule tabular">
                        {i + 1}
                      </span>
                      <span className="min-w-0 truncate">{nameById.get(id) ?? "—"}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </Panel>

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
