"use client";

import { useState } from "react";
import { CalendarClock, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Micro, Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/finance/money";
import type { Account, Category, RecurrenceFrequency } from "@/lib/finance/types";
import { setUpGoalHabit, type GoalPlan } from "./goal-actions";

/**
 * A goal, turned into something that happens on its own.
 *
 * The gap this closes: a savings goal with a deadline has always shown a
 * progress ring and nothing else, so hitting it depended entirely on
 * remembering to tap "Add" often enough. The arithmetic was always available —
 * target, saved, deadline — and never done.
 *
 * One tap sets up the repeating transfer and, optionally, a weekly routine to
 * check it's actually going through. Per the boldness setting, nothing happens
 * until that tap.
 */
export function GoalHabitPanel({
  plans,
  accounts,
  categories,
  initialAccountId = null,
  onSetUp,
}: {
  plans: GoalPlan[];
  accounts: Account[];
  categories: Category[];
  /** The "Default account" money preference, already validated by the server.
      Null means first in the list, same as quick-log. */
  initialAccountId?: string | null;
  onSetUp: (goalId: string) => void;
}) {
  const outstanding = plans.filter((p) => !p.alreadySetUp && !p.reached);
  const [openId, setOpenId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("monthly");
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.id === initialAccountId)?.id ?? accounts[0]?.id ?? ""
  );
  const [categoryId, setCategoryId] = useState("");
  const [addRoutine, setAddRoutine] = useState(true);
  const [saving, setSaving] = useState(false);

  const expenseCategories = categories.filter((c) => c.kind === "expense");
  if (outstanding.length === 0 || accounts.length === 0) return null;

  const open = outstanding.find((p) => p.goalId === openId) ?? null;
  const amountCents =
    open === null ? 0 : frequency === "monthly" ? open.perMonthCents : open.perWeekCents;

  async function handleSetUp() {
    if (!open || !accountId || !categoryId) return;
    setSaving(true);
    const result = await setUpGoalHabit({
      goalId: open.goalId,
      amountCents,
      frequency,
      accountId,
      categoryId,
      addRoutine,
    });
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    onSetUp(open.goalId);
    setOpenId(null);
    toast.success(`${open.goalName} is now set up to save itself`);
  }

  return (
    <Panel>
      <PanelHead title="Make it happen on its own" />

      {outstanding.map((plan, i) => (
        <div key={plan.goalId} className={cn(i > 0 && "border-t border-hairline")}>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <CalendarClock className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{plan.goalName}</p>
              <Micro className="block">
                {plan.overdue
                  ? `Past its date — ${formatCents(plan.perWeekCents)} a week to finish`
                  : `${formatCents(plan.perWeekCents)} a week for ${plan.weeksLeft} week${
                      plan.weeksLeft === 1 ? "" : "s"
                    }`}
              </Micro>
            </div>
            {plan.overdue && <Tag tone="warn">Late</Tag>}
            <Button
              type="button"
              size="sm"
              variant={openId === plan.goalId ? "secondary" : "outline"}
              onClick={() => {
                setOpenId(openId === plan.goalId ? null : plan.goalId);
                setCategoryId(expenseCategories[0]?.id ?? "");
              }}
            >
              {openId === plan.goalId ? "Close" : "Set it up"}
            </Button>
          </div>

          {openId === plan.goalId && (
            <div className="flex flex-col gap-3 border-t border-hairline bg-muted/40 px-3 py-3">
              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">How often</label>
                <Select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
                >
                  <option value="weekly">
                    Every week — {formatCents(plan.perWeekCents)}
                  </option>
                  <option value="monthly">
                    Every month — {formatCents(plan.perMonthCents)}
                  </option>
                </Select>
              </div>

              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">Out of</label>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="micro-sm mb-1.5 block text-muted-foreground">Filed under</label>
                <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Pick a category…</option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Weekly check</span>
                  <Micro className="block">
                    A routine to glance at it, so a missed transfer doesn&rsquo;t go unnoticed
                    for a month.
                  </Micro>
                </span>
                <Switch checked={addRoutine} onCheckedChange={setAddRoutine} />
              </div>

              <Button
                type="button"
                block
                disabled={saving || !accountId || !categoryId}
                onClick={handleSetUp}
              >
                <Check className="size-4" strokeWidth={3} />
                {saving
                  ? "Setting up…"
                  : `Put ${formatCents(amountCents)} aside ${
                      frequency === "monthly" ? "monthly" : "weekly"
                    }`}
              </Button>
            </div>
          )}
        </div>
      ))}
    </Panel>
  );
}
