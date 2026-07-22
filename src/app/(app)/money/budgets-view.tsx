"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/finance/money";
import type { Category } from "@/lib/finance/types";
import type { BudgetWithProgress } from "./actions";
import { deleteBudget, getBudgets } from "./actions";
import { BudgetForm } from "./budget-form";

export function BudgetsView({
  budgets,
  categories,
  onChanged,
}: {
  budgets: BudgetWithProgress[];
  categories: Category[];
  onChanged: (updater: (prev: BudgetWithProgress[]) => BudgetWithProgress[]) => void;
}) {
  const [showForm, setShowForm] = useState(false);

  const safeToSpend = useMemo(
    () => budgets.reduce((sum, b) => sum + Math.max(0, b.amount_cents - b.spent_cents), 0),
    [budgets]
  );
  const overCount = budgets.filter((b) => b.spent_cents > b.amount_cents).length;
  const budgetedCategoryIds = new Set(budgets.map((b) => b.category_id));

  async function handleDelete(id: string) {
    onChanged((prev) => prev.filter((b) => b.id !== id));
    await deleteBudget({ id });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="text-xs font-medium text-muted-foreground">Safe to spend</p>
        <p className="tabular font-heading text-2xl font-semibold text-primary">{formatCents(safeToSpend)}</p>
        {overCount > 0 && (
          <p className="mt-1 text-xs text-destructive">
            {overCount} budget{overCount > 1 ? "s" : ""} over limit
          </p>
        )}
      </div>

      <Button type="button" className="w-full gap-1.5" onClick={() => setShowForm(true)}>
        <Plus className="size-4" />
        New budget
      </Button>

      {budgets.length === 0 ? (
        <EmptyState title="No budgets yet" description="Set one per category to see your safe-to-spend number." />
      ) : (
        <ul className="space-y-2">
          {budgets.map((b) => {
            const pct = b.amount_cents > 0 ? Math.round((b.spent_cents / b.amount_cents) * 100) : 0;
            const barColor = pct > 100 ? "bg-destructive" : pct > 80 ? "bg-accent" : "bg-primary";
            return (
              <li key={b.id} className="rounded-xl border border-border bg-surface p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium">{b.category_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular text-xs text-muted-foreground">
                      {formatCents(b.spent_cents)} / {formatCents(b.amount_cents)}
                    </span>
                    <button
                      onClick={() => handleDelete(b.id)}
                      className="tap-press text-muted-foreground/40 hover:text-destructive"
                      aria-label="Delete budget"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", barColor)} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showForm && (
        <BudgetForm
          categories={categories.filter((c) => c.kind === "expense" && !budgetedCategoryIds.has(c.id))}
          onClose={() => setShowForm(false)}
          onSaved={async () => {
            setShowForm(false);
            // A new budget's spent-so-far needs a real period-aware query
            // against transactions — refetch rather than guess it optimistically.
            const fresh = await getBudgets();
            onChanged(() => fresh);
          }}
        />
      )}
    </div>
  );
}
