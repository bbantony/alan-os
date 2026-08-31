"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
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
  const [confirmingDelete, setConfirmingDelete] = useState<BudgetWithProgress | null>(null);

  // The safe-to-spend headline moved up into the page-level vitals strip
  // (money-shell.tsx) so it stays visible on every tab. Repeating it here as
  // well would be the same number twice on one screen.
  const budgetedCategoryIds = new Set(budgets.map((b) => b.category_id));

  async function handleDelete() {
    if (!confirmingDelete) return;
    const id = confirmingDelete.id;
    setConfirmingDelete(null);
    onChanged((prev) => prev.filter((b) => b.id !== id));
    await deleteBudget({ id });
    toast.success("Budget deleted");
  }

  return (
    <div className="flex flex-col gap-4">
      {budgets.length === 0 ? (
        <EmptyState
          title="No budgets yet"
          description="Set one per category to see your safe-to-spend number."
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus className="size-4" strokeWidth={3} />
              New budget
            </Button>
          }
        />
      ) : (
        <Panel>
          <PanelHead
            title="Budgets"
            count={budgets.length}
            action={
              <button
                type="button"
                onClick={() => setShowForm(true)}
                aria-label="New budget"
                className="tap-press tap-reach flex size-7 items-center justify-center border-2 border-rule bg-surface transition-colors hover:bg-foreground hover:text-background"
              >
                <Plus className="size-4" strokeWidth={3} />
              </button>
            }
          />
          <ul>
            {budgets.map((b, i) => {
              const pct =
                b.amount_cents > 0 ? Math.round((b.spent_cents / b.amount_cents) * 100) : 0;
              const over = pct > 100;
              const close = pct > 80 && !over;
              const remaining = b.amount_cents - b.spent_cents;
              return (
                <li
                  key={b.id}
                  className={cn("px-3 py-3", i > 0 && "border-t border-hairline")}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {b.category_name}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      {over && <Tag tone="alert" filled>Over</Tag>}
                      {close && <Tag tone="warn">Close</Tag>}
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(b)}
                        className="tap-press tap-target text-muted-foreground/50 transition-colors hover:text-destructive"
                        aria-label={`Delete ${b.category_name} budget`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>

                  {/* Spent / limit as a real pair of figures rather than a
                      cramped "$x / $y" caption, with what's actually left —
                      the number you make a decision on — given its own place. */}
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="stat text-xl">{formatCents(b.spent_cents)}</span>
                    <span className="micro-sm tabular text-muted-foreground">
                      of {formatCents(b.amount_cents)}
                    </span>
                  </div>

                  <div className="h-2 border border-rule">
                    <div
                      className={cn(
                        "h-full",
                        over ? "bg-destructive" : close ? "bg-warn" : "bg-primary"
                      )}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>

                  <p
                    className={cn(
                      "micro-sm mt-1.5 tabular",
                      remaining < 0 ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {remaining < 0
                      ? `${formatCents(Math.abs(remaining))} over`
                      : `${formatCents(remaining)} left`}
                    {" · "}
                    {pct}%
                  </p>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {showForm && (
        <BudgetForm
          categories={categories.filter(
            (c) => c.kind === "expense" && !budgetedCategoryIds.has(c.id)
          )}
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

      <ConfirmDialog
        open={Boolean(confirmingDelete)}
        title={`Delete the ${confirmingDelete?.category_name ?? ""} budget?`}
        description="Spending already logged in that category is kept — only the limit goes."
        confirmLabel="Delete budget"
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(null)}
      />
    </div>
  );
}
