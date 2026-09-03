"use client";

import { useState } from "react";
import { Pause, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { Panel, PanelHead, PanelEmpty } from "@/components/ui/panel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DateField } from "@/components/ui/date-field";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { todayInAppTimezone } from "@/lib/time";
import { formatCents, dollarsToCents } from "@/lib/finance/money";
import { FREQUENCY_LABELS } from "@/lib/finance/recurring";
import type {
  Account,
  Category,
  RecurrenceFrequency,
  RecurringTransaction,
} from "@/lib/finance/types";
import {
  createRecurringTransaction,
  deleteRecurringTransaction,
  setRecurringActive,
} from "./recurring-actions";

const FREQUENCIES: RecurrenceFrequency[] = ["weekly", "biweekly", "monthly", "yearly"];

function formatDueDate(iso: string, today: string): string {
  if (iso === today) return "today";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const days = Math.round((date.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);
  if (days === 1) return "tomorrow";
  if (days > 1 && days <= 14) return `in ${days} days`;
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

/**
 * Rent, salary, the phone bill — the money that moves whether or not you
 * remember it.
 *
 * These post themselves the next time the app is opened after they come due,
 * dated to the day they were actually due rather than the day you happened to
 * look, and catching up on any that were missed. That's why the panel leads
 * with what's coming and when: the whole point is not having to think about it.
 */
export function RecurringView({
  recurring,
  accounts,
  categories,
  initialAccountId = null,
  onChanged,
}: {
  recurring: RecurringTransaction[];
  accounts: Account[];
  categories: Category[];
  /** The "Default account" money preference, already validated by the server.
      Null means first in the list, same as quick-log. */
  initialAccountId?: string | null;
  onChanged: (updater: (prev: RecurringTransaction[]) => RecurringTransaction[]) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<RecurringTransaction | null>(null);
  const today = todayInAppTimezone();

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  // Where the account picker starts: the default-account preference if it's
  // in the list, else first in the list — same rule as the quick-log keypad.
  const startingAccountId =
    accounts.find((a) => a.id === initialAccountId)?.id ?? accounts[0]?.id ?? "";

  // Form state.
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState(startingAccountId);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("monthly");
  const [anchorDate, setAnchorDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [merchant, setMerchant] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleCategories = categories.filter((c) => c.kind === kind);

  function openForm() {
    setName("");
    setAmount("");
    setKind("expense");
    setCategoryId("");
    setAccountId(startingAccountId);
    setFrequency("monthly");
    setAnchorDate(today);
    setEndDate("");
    setMerchant("");
    setError(null);
    setShowForm(true);
  }

  async function handleCreate() {
    const amountCents = dollarsToCents(Number(amount) || 0);
    if (!name.trim() || amountCents <= 0 || !categoryId || !accountId) return;
    setSaving(true);
    setError(null);
    const result = await createRecurringTransaction({
      accountId,
      categoryId,
      name: name.trim(),
      amountCents,
      merchant: merchant.trim() || null,
      note: null,
      frequency,
      anchorDate,
      endDate: endDate || null,
      autoPost: true,
    });
    setSaving(false);
    if (result.error || !result.recurring) {
      setError(result.error ?? "Couldn't save that.");
      return;
    }
    const created = result.recurring;
    onChanged((prev) => [...prev, created].sort((a, b) => a.next_date.localeCompare(b.next_date)));
    setShowForm(false);
    toast.success(`${created.name} set up`);
  }

  async function handleToggle(rule: RecurringTransaction) {
    const result = await setRecurringActive({ id: rule.id, active: !rule.active });
    if (result.error || !result.recurring) {
      toast.error("Couldn't update that.");
      return;
    }
    const updated = result.recurring;
    onChanged((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    toast.success(updated.active ? `${updated.name} resumed` : `${updated.name} paused`);
  }

  async function handleDelete() {
    if (!confirmingDelete) return;
    const id = confirmingDelete.id;
    setConfirmingDelete(null);
    onChanged((prev) => prev.filter((r) => r.id !== id));
    await deleteRecurringTransaction({ id });
    toast.success("Stopped");
  }

  return (
    <>
      <Panel>
        <PanelHead
          title="Repeating"
          count={recurring.length > 0 ? recurring.length : undefined}
          action={
            <button
              type="button"
              onClick={openForm}
              disabled={accounts.length === 0}
              aria-label="New repeating transaction"
              title={accounts.length === 0 ? "Add an account first" : undefined}
              className="tap-press tap-reach flex size-7 items-center justify-center border-2 border-rule bg-surface transition-colors hover:bg-foreground hover:text-background disabled:pointer-events-none disabled:opacity-40"
            >
              <Plus className="size-4" strokeWidth={3} />
            </button>
          }
        />

        {recurring.length === 0 ? (
          <PanelEmpty>
            Rent, salary, subscriptions — set one up and it logs itself on the day
            it&rsquo;s due.
          </PanelEmpty>
        ) : (
          <ul>
            {recurring.map((r, i) => {
              const category = categoryById.get(r.category_id);
              const account = accountById.get(r.account_id);
              const isIncome = category?.kind === "income";
              return (
                <li
                  key={r.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5",
                    i > 0 && "border-t border-hairline",
                    !r.active && "bg-muted/40"
                  )}
                >
                  <Repeat
                    className={cn(
                      "size-4 shrink-0",
                      r.active ? "text-muted-foreground" : "text-muted-foreground/40"
                    )}
                    strokeWidth={2.25}
                  />

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold">
                      {r.name}
                      {!r.active && <Tag>Paused</Tag>}
                    </p>
                    <p className="micro-sm mt-0.5 truncate text-muted-foreground">
                      {FREQUENCY_LABELS[r.frequency]}
                      {r.active && ` · next ${formatDueDate(r.next_date, today)}`}
                      {account && ` · ${account.name}`}
                    </p>
                  </div>

                  <span
                    className={cn("shrink-0 text-sm font-bold tabular", isIncome && "text-ok")}
                  >
                    {isIncome ? "+" : "−"}
                    {formatCents(r.amount_cents, r.currency)}
                  </span>

                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggle(r)}
                      aria-label={r.active ? `Pause ${r.name}` : `Resume ${r.name}`}
                      className="tap-press tap-target text-muted-foreground/60 transition-colors hover:text-foreground"
                    >
                      {r.active ? <Pause className="size-4" /> : <Play className="size-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(r)}
                      aria-label={`Stop ${r.name}`}
                      className="tap-press tap-target text-muted-foreground/60 transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {showForm && (
        <Dialog open onOpenChange={(next) => !next && setShowForm(false)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Something that repeats</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <Segmented
                options={[
                  { value: "expense", label: "Goes out" },
                  { value: "income", label: "Comes in" },
                ]}
                value={kind}
                onChange={(v) => {
                  setKind(v);
                  setCategoryId("");
                }}
              />

              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={kind === "income" ? "Salary" : "Rent"}
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="micro-sm mb-1.5 block text-muted-foreground">Amount</label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="flex-1">
                  <label className="micro-sm mb-1.5 block text-muted-foreground">How often</label>
                  <Select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {FREQUENCY_LABELS[f]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">Category</label>
                <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Pick a category…</option>
                  {visibleCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">
                  {kind === "income" ? "Lands in" : "Comes out of"}
                </label>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.currency !== "CAD" ? ` (${a.currency})` : ""}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">
                  Next one due
                </label>
                <DateField
                  value={anchorDate}
                  onChange={setAnchorDate}
                  clearable={false}
                  aria-label="Next one due"
                />
                <p className="micro-sm mt-1 text-muted-foreground">
                  {frequency === "monthly" || frequency === "yearly"
                    ? "Short months are handled — the 31st becomes the 28th in February, then goes back to the 31st."
                    : "It repeats from this date."}
                </p>
              </div>

              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">
                  Merchant (optional)
                </label>
                <Input
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  placeholder="Who it's paid to"
                />
              </div>

              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">
                  Stop after (optional)
                </label>
                <DateField
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="Keeps going forever"
                  aria-label="Stop after"
                />
              </div>

              {error && (
                <p className="border-2 border-destructive px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button
                type="button"
                block
                disabled={saving || !name.trim() || !amount || !categoryId || !accountId}
                onClick={handleCreate}
              >
                {saving ? "Saving…" : "Set it up"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDialog
        open={Boolean(confirmingDelete)}
        title={`Stop ${confirmingDelete?.name ?? "this"}?`}
        description="It stops posting from now on. Everything it has already logged stays where it is."
        confirmLabel="Stop it"
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(null)}
      />
    </>
  );
}
