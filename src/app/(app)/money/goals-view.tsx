"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { formatCents, dollarsToCents } from "@/lib/finance/money";
import { getFinanceIcon } from "@/lib/finance/icon-registry";
import type { SavingsGoal } from "@/lib/finance/types";
import { addToGoal, createSavingsGoal, deleteSavingsGoal } from "./actions";

function ProgressRing({ percent }: { percent: number }) {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, percent) / 100) * circumference;
  return (
    <svg width={60} height={60} viewBox="0 0 60 60" className="-rotate-90">
      <circle cx={30} cy={30} r={radius} fill="none" stroke="currentColor" strokeWidth={5} className="text-muted" />
      <circle
        cx={30}
        cy={30}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="text-primary transition-all"
      />
    </svg>
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
    setSaving(true);
    await createSavingsGoal({
      name: name.trim(),
      targetCents: dollarsToCents(Number(target)),
      deadline: deadline || null,
      icon: "PiggyBank",
    });
    setSaving(false);
    setShowForm(false);
    setName("");
    setTarget("");
    setDeadline("");
    onChanged((prev) => [
      {
        id: crypto.randomUUID(),
        user_id: "",
        name: name.trim(),
        target_cents: dollarsToCents(Number(target)),
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
    onChanged((prev) =>
      prev.map((g) =>
        g.id === id
          ? { ...g, saved_cents: g.saved_cents + amountCents, is_done: g.saved_cents + amountCents >= g.target_cents }
          : g
      )
    );
    setAddingTo(null);
    setAddAmount("");
    await addToGoal({ id, amountCents });
  }

  async function handleDelete(id: string) {
    onChanged((prev) => prev.filter((g) => g.id !== id));
    await deleteSavingsGoal({ id });
  }

  return (
    <div className="space-y-4">
      <Button type="button" className="w-full gap-1.5" onClick={() => setShowForm(true)}>
        <Plus className="size-4" />
        New goal
      </Button>

      {goals.length === 0 ? (
        <EmptyState title="No savings goals yet" description="Give a goal a name and target to track progress." icon={<Plus className="size-8" />} />
      ) : (
        <ul className="space-y-2">
          {goals.map((g) => {
            const Icon = getFinanceIcon(g.icon);
            const pct = g.target_cents > 0 ? Math.round((g.saved_cents / g.target_cents) * 100) : 0;
            return (
              <li key={g.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
                <div className="relative flex shrink-0 items-center justify-center">
                  <ProgressRing percent={pct} />
                  <Icon className="absolute size-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {g.name} {g.is_done && "🎉"}
                  </p>
                  <p className="tabular text-xs text-muted-foreground">
                    {formatCents(g.saved_cents)} of {formatCents(g.target_cents)} ({pct}%)
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button onClick={() => setAddingTo(g)} className="tap-press text-xs font-medium text-primary">
                    Add
                  </button>
                  <button onClick={() => handleDelete(g.id)} className="tap-press text-muted-foreground/40 hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showForm && (
        <Dialog open onOpenChange={(next) => !next && setShowForm(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New goal</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goal name" autoFocus />
              <Input type="number" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target amount" />
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              <Button type="button" className="w-full" disabled={saving || !name.trim() || !target} onClick={handleCreate}>
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
              <DialogTitle>Add to &ldquo;{addingTo.name}&rdquo;</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input type="number" inputMode="decimal" value={addAmount} onChange={(e) => setAddAmount(e.target.value)} placeholder="Amount" autoFocus />
              <Button type="button" className="w-full" disabled={!addAmount} onClick={handleAddToGoal}>
                Add
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
