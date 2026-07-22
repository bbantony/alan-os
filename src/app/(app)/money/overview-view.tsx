"use client";

import { useState } from "react";
import { Send, Trash2, Wallet } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { formatInAppTimezone } from "@/lib/time";
import { formatCents } from "@/lib/finance/money";
import { getFinanceIcon } from "@/lib/finance/icon-registry";
import { ACCOUNT_TYPE_LABELS } from "@/lib/finance/types";
import type { Account, Category, Transaction } from "@/lib/finance/types";
import { deleteTransaction } from "./actions";
import { AccountForm } from "./account-form";
import { RemittanceForm } from "./remittance-form";

export function OverviewView({
  accounts,
  transactions,
  categories,
  remittance,
  onAccountsChanged,
  onTransactionDeleted,
}: {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  remittance: { cadTotalCents: number; inrTotalCents: number };
  onAccountsChanged: (updater: (prev: Account[]) => Account[]) => void;
  onTransactionDeleted: (id: string) => void;
}) {
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showRemittanceForm, setShowRemittanceForm] = useState(false);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  async function handleDeleteTransaction(id: string) {
    onTransactionDeleted(id);
    await deleteTransaction({ id });
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounts</h2>
          <button onClick={() => setShowAccountForm(true)} className="tap-press text-xs font-medium text-primary">
            + Add account
          </button>
        </div>

        {accounts.length === 0 ? (
          <EmptyState
            title="No accounts yet"
            description="Add your chequing, credit card, or cash accounts to start logging."
            icon={<Wallet className="size-8" />}
          />
        ) : (
          <div className="space-y-2">
            {accounts.map((a) => {
              const utilization =
                a.type === "credit_card" && a.credit_limit_cents
                  ? Math.min(100, Math.round((a.current_balance_cents / a.credit_limit_cents) * 100))
                  : null;
              return (
                <div key={a.id} className="rounded-xl border border-border bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.institution} · {ACCOUNT_TYPE_LABELS[a.type]}
                      </p>
                    </div>
                    <div className="tabular text-right text-sm font-semibold">
                      {formatCents(a.current_balance_cents, a.currency)}
                      {a.type === "credit_card" && a.credit_limit_cents && (
                        <p className="text-xs font-normal text-muted-foreground">
                          of {formatCents(a.credit_limit_cents, a.currency)} limit
                        </p>
                      )}
                    </div>
                  </div>
                  {utilization !== null && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          utilization > 80 ? "bg-destructive" : utilization > 50 ? "bg-accent" : "bg-primary"
                        )}
                        style={{ width: `${utilization}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Send className="size-3.5 text-primary" />
            Remittances this year
          </p>
          <button onClick={() => setShowRemittanceForm(true)} className="tap-press text-xs font-medium text-primary">
            + Send
          </button>
        </div>
        <p className="tabular text-sm text-muted-foreground">
          {formatCents(remittance.cadTotalCents, "CAD")} sent · {formatCents(remittance.inrTotalCents, "INR")} received
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Recent transactions
        </h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
        ) : (
          <ul className="space-y-1">
            {transactions.map((t) => {
              const category = categoryById.get(t.category_id);
              const Icon = getFinanceIcon(category?.icon ?? "");
              const isIncome = category?.kind === "income";
              return (
                <li key={t.id} className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2">
                  <div
                    className="flex size-8 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${category?.color ?? "#5B5C51"}22` }}
                  >
                    <Icon className="size-4" style={{ color: category?.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{t.merchant || category?.name || "Transaction"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatInAppTimezone(t.txn_date, { month: "short", day: "numeric" })}
                      {category && ` · ${category.name}`}
                    </p>
                  </div>
                  <span className={cn("tabular shrink-0 text-sm font-medium", isIncome && "text-primary")}>
                    {isIncome ? "+" : "-"}
                    {formatCents(t.amount_cents, t.currency)}
                  </span>
                  <button
                    onClick={() => handleDeleteTransaction(t.id)}
                    className="tap-press shrink-0 text-muted-foreground/40 hover:text-destructive"
                    aria-label="Delete transaction"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showAccountForm && (
        <AccountForm
          onClose={() => setShowAccountForm(false)}
          onCreated={(account) => {
            onAccountsChanged((prev) => [...prev, account]);
            setShowAccountForm(false);
          }}
        />
      )}

      {showRemittanceForm && accounts.length > 0 && (
        <RemittanceForm
          accounts={accounts}
          onClose={() => setShowRemittanceForm(false)}
          onLogged={(updatedAccount) => {
            onAccountsChanged((prev) => prev.map((a) => (a.id === updatedAccount.id ? updatedAccount : a)));
            setShowRemittanceForm(false);
          }}
        />
      )}
    </div>
  );
}
