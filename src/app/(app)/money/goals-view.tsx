"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { EmptyState } from "@/components/empty-state";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { formatCents, dollarsToCents } from "@/lib/finance/money";
import { getFinanceIcon } from "@/lib/finance/icon-registry";
import type { SavingsGoal } from "@/lib/finance/types";
import { addToGoal, createSavingsGoal, deleteSavingsGoal } from "./actions";

/**
 * A squared progress dial.
 *
 * This replaces an SVG ring with a round stroke-linecap, which was the single
 * softest element left anywhere in the app. Ten cells that fill carry the same
 * information and, unlike an arc, can be read precisely at a glance — you can
 * count them.
 */
function ProgressBlocks({ percent }: { percent: number }) {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * 10);
  return (
    <div
      className="grid w-14 shrink-0 grid-cols-5 gap-px border-2 border-rule bg-hairline"
      role="img"
      aria-label={`${Math.round(percent)} percent saved`}
    >
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={cn("block h-2.5", i < filled ? "bg-primary" : "bg-surface")} />
      ))}
    </div>
  );
}

export function GoalsView({
  goals,
  onChanged,
}: {
  goals: SavingsGoal[];
  onChanged: (updater: (prev: SavingsGoal[]) => SavingsGoal[]) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [addingTo, setAddingTo] = useState<SavingsGoal | null>(null);
  const [addAmount, setAddAmount] = useState("");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim() || !target) return;
    const trimmedName = name.trim();
    const targetCents = dollarsToCents(Number(target));
    setSaving(true);
    await createSavingsGoal({
      name: trimmedName,
      targetCents,
      deadline: deadline || null,
      icon: "PiggyBank",
    });
    setSaving(false);
    setShowForm(false);
    setName("");
    setTarget("");
    setDeadline("");
    toast.success(`"${trimmedName}" goal created`);
    onChanged((prev) => [
      {
        id: crypto.randomUUID(),
        user_id: "",
        name: trimmedName,
        target_cents: targetCents,
        saved_cents: 0,
        deadline: deadline || null,
        icon: "PiggyBank",
        is_done: false,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);
  }

  async function handleAddToGoal() {
    if (!addingTo || !addAmount) return;
    const amountCents = dollarsToCents(Number(addAmount));
    const id = addingTo.id;
    const goalName = addingTo.name;
    onChanged((prev) =>
      prev.map((g) =>
        g.id === id
          ? {
              ...g,
              saved_cents: g.saved_cents + amountCents,
              is_done: g.saved_cents + amountCents >= g.target_cents,
            }
          : g
      )
    );
    setAddingTo(null);
    setAddAmount("");
    toast.success(`${formatCents(amountCents)} added to "${goalName}"`);
    await addToGoal({ id, amountCents });
  }

  async function handleDelete(id: string) {
    onChanged((prev) => prev.filter((g) => g.id !== id));
    await deleteSavingsGoal({ id });
  }

  return (
    <div className="flex flex-col gap-4">
      {goals.length === 0 ? (
        <EmptyState
          title="No savings goals yet"
          description="Give a goal a name and target to track progress."
          action={
            <Button onClick={() => setShowForm(true)}>
              <Plus className="size-4" strokeWidth={3} />
              New goal
            </Button>
          }
        />
      ) : (
        <Panel>
          <PanelHead
            title="Savings goals"
            count={goals.length}
            action={
              <button
                type="button"
                onClick={() => setShowForm(true)}
                aria-label="New goal"
                className="tap-press flex size-7 items-center justify-center border-2 border-rule bg-surface transition-colors hover:bg-foreground hover:text-background"
              >
                <Plus className="size-4" strokeWidth={3} />
              </button>
            }
          />
          <ul>
            {goals.map((g, i) => {
              const Icon = getFinanceIcon(g.icon);
              const pct =
                g.target_cents > 0 ? Math.round((g.saved_cents / g.target_cents) * 100) : 0;
              return (
                <li
                  key={g.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3",
                    i > 0 && "border-t border-hairline"
                  )}
                >
                  <ProgressBlocks percent={pct} />

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{g.name}</span>
                      {g.is_done && (
                        <Tag tone="ok" filled>
                          Done
                        </Tag>
                      )}
                    </p>
                    <p className="mt-1 flex items-baseline gap-1.5">
                      <span className="stat text-lg">{formatCents(g.saved_cents)}</span>
                      <span className="micro-sm tabular text-muted-foreground">
                        of {formatCents(g.target_cents)} · {pct}%
                      </span>
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAddingTo(g)}
                      className="micro-sm tap-press border-2 border-rule bg-surface px-2 py-1 transition-colors hover:bg-foreground hover:text-background"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(g.id)}
                      className="tap-press text-muted-foreground/50 transition-colors hover:text-destructive"
                      aria-label={`Delete ${g.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {showForm && (
        <Dialog open onOpenChange={(next) => !next && setShowForm(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New goal</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="What are you saving for?"
                  autoFocus
                />
              </div>
              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">Target</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">
                  Deadline (optional)
                </label>
                <Input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
              <Button
                type="button"
                block
                disabled={saving || !name.trim() || !target}
                onClick={handleCreate}
              >
                {saving ? "Saving…" : "Create goal"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {addingTo && (
        <Dialog open onOpenChange={(next) => !next && setAddingTo(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to {addingTo.name}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">Amount</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <Button type="button" block disabled={!addAmount} onClick={handleAddToGoal}>
                Add
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
