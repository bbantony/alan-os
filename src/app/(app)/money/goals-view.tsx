"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Panel, PanelHead } from "@/components/ui/panel";
import { DateField } from "@/components/ui/date-field";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { formatCents, dollarsToCents } from "@/lib/finance/money";
import { getFinanceIcon } from "@/lib/finance/icon-registry";
import type { SavingsGoal } from "@/lib/finance/types";
import { addToGoal, createSavingsGoal, deleteSavingsGoal } from "./actions";
import { GoalHabitPanel } from "./goal-habit-panel";
import type { GoalPlan } from "./goal-actions";
import type { Account, Category } from "@/lib/finance/types";

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
  goalPlans,
  accounts,
  categories,
  defaultAccountId = null,
}: {
  goals: SavingsGoal[];
  onChanged: (updater: (prev: SavingsGoal[]) => SavingsGoal[]) => void;
  goalPlans: GoalPlan[];
  accounts: Account[];
  categories: Category[];
  /** The "Default account" money preference, already validated by the server.
      Seeds the goal-habit panel's account picker, same as quick-log. */
  defaultAccountId?: string | null;
}) {
  const [plans, setPlans] = useState(goalPlans);
  const [showForm, setShowForm] = useState(false);
  const [addingTo, setAddingTo] = useState<SavingsGoal | null>(null);
  const [addAmount, setAddAmount] = useState("");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<SavingsGoal | null>(null);

  async function handleCreate() {
    if (!name.trim() || !target) return;
    const trimmedName = name.trim();
    const targetCents = dollarsToCents(Number(target));
    setSaving(true);
    // The goal that goes on screen is the row the database actually created.
    // This used to be a locally-invented object with a made-up id, so the
    // first "add to goal" against a brand-new goal wrote nothing at all while
    // cheerfully reporting success — the money reappeared as missing on the
    // next page load.
    const result = await createSavingsGoal({
      name: trimmedName,
      targetCents,
      deadline: deadline || null,
      icon: "PiggyBank",
    });
    setSaving(false);
    if (result.error || !result.goal) {
      toast.error(result.error ?? "Couldn't create that goal.");
      return;
    }
    setShowForm(false);
    setName("");
    setTarget("");
    setDeadline("");
    toast.success(`"${trimmedName}" goal created`);
    const created = result.goal;
    onChanged((prev) => [created, ...prev]);
  }

  async function handleAddToGoal() {
    if (!addingTo || !addAmount) return;
    const amountCents = dollarsToCents(Number(addAmount));
    const id = addingTo.id;
    const goalName = addingTo.name;
    setAddingTo(null);
    setAddAmount("");

    const result = await addToGoal({ id, amountCents });
    if (result.error || result.savedCents === undefined) {
      toast.error(result.error ?? "Couldn't add that.");
      return;
    }
    // Reconciled against what was really banked rather than assumed — the
    // server is the one that knows the goal's true running total.
    const savedCents = result.savedCents;
    const isDone = result.isDone ?? false;
    onChanged((prev) =>
      prev.map((g) => (g.id === id ? { ...g, saved_cents: savedCents, is_done: isDone } : g))
    );
    toast.success(`${formatCents(amountCents)} added to "${goalName}"`);
  }

  async function handleDelete() {
    if (!confirmingDelete) return;
    const id = confirmingDelete.id;
    setConfirmingDelete(null);
    onChanged((prev) => prev.filter((g) => g.id !== id));
    await deleteSavingsGoal({ id });
    toast.success("Goal deleted");
  }

  return (
    <div className="flex flex-col gap-4">
      <GoalHabitPanel
        plans={plans}
        accounts={accounts}
        categories={categories}
        initialAccountId={defaultAccountId}
        onSetUp={(goalId) =>
          setPlans((prev) =>
            prev.map((p) => (p.goalId === goalId ? { ...p, alreadySetUp: true } : p))
          )
        }
      />

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
                className="tap-press tap-reach flex size-7 items-center justify-center border-2 border-rule bg-surface transition-colors hover:bg-foreground hover:text-background"
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
                      onClick={() => setConfirmingDelete(g)}
                      className="tap-press tap-target text-muted-foreground/50 transition-colors hover:text-destructive"
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
                <DateField
                  value={deadline}
                  onChange={setDeadline}
                  placeholder="No deadline"
                  aria-label="Deadline"
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

      <ConfirmDialog
        open={Boolean(confirmingDelete)}
        title={`Delete "${confirmingDelete?.name ?? "this goal"}"?`}
        description="This can't be undone."
        detail={
          confirmingDelete && confirmingDelete.saved_cents > 0
            ? `${formatCents(confirmingDelete.saved_cents)} of progress will be lost.`
            : undefined
        }
        confirmLabel="Delete goal"
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(null)}
      />
    </div>
  );
}
