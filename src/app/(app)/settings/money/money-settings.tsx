"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getFinanceIcon, AVAILABLE_FINANCE_ICON_NAMES } from "@/lib/finance/icon-registry";
import { CHART_CATEGORICAL_LIGHT } from "@/lib/finance/chart-colors";
import type { Category, CategoryKind } from "@/lib/finance/types";
import { archiveCategory, createCategory } from "@/app/(app)/money/actions";

export function MoneySettings({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(AVAILABLE_FINANCE_ICON_NAMES[0]);
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [isPending, startTransition] = useTransition();

  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const incomeCategories = categories.filter((c) => c.kind === "income");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setName("");
    const color = CHART_CATEGORICAL_LIGHT[categories.length % CHART_CATEGORICAL_LIGHT.length];
    startTransition(async () => {
      const result = await createCategory({ name: trimmed, icon, color, kind });
      if (result.category) {
        setCategories((prev) => [...prev, result.category!]);
      }
    });
  }

  function handleDelete(id: string) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    startTransition(async () => {
      await archiveCategory({ id });
    });
  }

  function renderList(list: Category[]) {
    return (
      <ul className="space-y-1.5">
        {list.map((cat) => {
          const Icon = getFinanceIcon(cat.icon);
          return (
            <li
              key={cat.id}
              className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <Icon className="size-4 shrink-0" style={{ color: cat.color }} />
              <span className="flex-1 text-sm font-medium">{cat.name}</span>
              <button
                onClick={() => handleDelete(cat.id)}
                className="tap-press shrink-0 text-muted-foreground/40 hover:text-destructive"
                aria-label={`Archive ${cat.name}`}
                disabled={isPending}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        These are the categories transactions and budgets get sorted into.
        Archiving one keeps past transactions intact but hides it going forward.
      </p>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expense</h2>
        {renderList(expenseCategories)}
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Income</h2>
        {renderList(incomeCategories)}
      </div>

      <form onSubmit={handleAdd} className="space-y-2 border-t border-border pt-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name…" />
        <div className="flex gap-2">
          <select
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="h-9 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm"
            aria-label="Icon"
          >
            {AVAILABLE_FINANCE_ICON_NAMES.map((iconName) => (
              <option key={iconName} value={iconName}>
                {iconName}
              </option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-lg border border-input">
            {(["expense", "income"] as CategoryKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "px-3 text-xs font-medium capitalize",
                  kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                )}
              >
                {k}
              </button>
            ))}
          </div>
          <Button type="submit" size="icon" disabled={!name.trim()}>
            <Plus className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
