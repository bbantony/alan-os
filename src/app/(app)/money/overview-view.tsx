"use client";

import { useState } from "react";
import { Pencil, Plus, Send, Trash2, Upload, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Panel, PanelHead, PanelEmpty, PanelRow } from "@/components/ui/panel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Micro } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { formatInAppTimezone } from "@/lib/time";
import { formatCents } from "@/lib/finance/money";
import { getFinanceIcon } from "@/lib/finance/icon-registry";
import { ACCOUNT_TYPE_LABELS } from "@/lib/finance/types";
import type {
  Account,
  Category,
  Receipt,
  RecurringTransaction,
  Transaction,
} from "@/lib/finance/types";
import { deleteAccount, deleteTransaction, getAccountTransactionCount } from "./actions";
import { AccountForm } from "./account-form";
import { RecurringView } from "./recurring-view";
import { RemittanceForm } from "./remittance-form";
import { ReceiptScanButton } from "./receipt-scan-button";
import { ReceiptReviewDialog } from "./receipt-review-dialog";

export function OverviewView({
  accounts,
  transactions,
  categories,
  remittance,
  receipts,
  recurring,
  onAccountsChanged,
  onTransactionDeleted,
  onReceiptsChanged,
  onTransactionsAdded,
  onRecurringChanged,
}: {
  accounts: Account[];
  transactions: Transaction[];
  categories: Category[];
  remittance: { cadTotalCents: number; inrTotalCents: number };
  receipts: Receipt[];
  recurring: RecurringTransaction[];
  onAccountsChanged: (updater: (prev: Account[]) => Account[]) => void;
  onTransactionDeleted: (id: string) => void;
  onReceiptsChanged: (updater: (prev: Receipt[]) => Receipt[]) => void;
  onTransactionsAdded: (transactions: Transaction[]) => void;
  onRecurringChanged: (updater: (prev: RecurringTransaction[]) => RecurringTransaction[]) => void;
}) {
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [showRemittanceForm, setShowRemittanceForm] = useState(false);
  const [reviewingReceipt, setReviewingReceipt] = useState<Receipt | null>(null);
  // Both destructive actions now ask first. `deletingAccount` carries the
  // number of transactions that would go with it — `transactions.account_id`
  // is ON DELETE CASCADE, so deleting an account really does take its whole
  // history, and that has to be said out loud before it happens.
  const [confirmingTransaction, setConfirmingTransaction] = useState<Transaction | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<{ account: Account; txnCount: number } | null>(null);
  const [pending, setPending] = useState(false);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  // A remittance is money leaving a Canadian account, and `logRemittance`
  // writes the transaction in CAD — so only CAD accounts may be picked. It
  // used to offer every account, which would have logged a CAD amount against
  // an Indian one.
  const cadAccounts = accounts.filter((a) => a.currency === "CAD");

  async function askToDeleteAccount(account: Account) {
    const txnCount = await getAccountTransactionCount({ id: account.id });
    setDeletingAccount({ account, txnCount });
  }

  async function handleDeleteAccount() {
    if (!deletingAccount) return;
    const { account } = deletingAccount;
    setPending(true);
    const result = await deleteAccount({ id: account.id });
    setPending(false);
    setDeletingAccount(null);
    if (result.error) {
      toast.error("Couldn't delete that account.");
      return;
    }
    onAccountsChanged((prev) => prev.filter((a) => a.id !== account.id));
    toast.success(`${account.name} deleted`);
  }

  async function handleDeleteTransaction() {
    if (!confirmingTransaction) return;
    const id = confirmingTransaction.id;
    setConfirmingTransaction(null);
    onTransactionDeleted(id);
    await deleteTransaction({ id });
    toast.success("Transaction deleted");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------- Receipts awaiting review ---------------- */}
      <Panel>
        <PanelHead
          title="Receipts"
          count={receipts.length > 0 ? receipts.length : undefined}
          action={
            <ReceiptScanButton
              onUploaded={(receipt) => onReceiptsChanged((prev) => [receipt, ...prev])}
            />
          }
        />
        {receipts.length === 0 ? (
          <PanelEmpty>Scan a receipt to log it in seconds.</PanelEmpty>
        ) : (
          <ul>
            {receipts.map((r, i) => (
              <li key={r.id} className={cn(i > 0 && "border-t border-hairline")}>
                <button
                  type="button"
                  onClick={() => setReviewingReceipt(r)}
                  className="tap-press flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {r.merchant_guess || "Receipt awaiting review"}
                  </span>
                  <span className="micro-sm shrink-0 tabular text-muted-foreground">
                    {r.total_cents_guess ? formatCents(r.total_cents_guess) : "Tap to enter"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ---------------- Accounts ----------------

          The empty state carries its own "Add account" button. It didn't
          before, and the `+` that adds one lives inside the panel header
          below — which only renders once an account already exists. So a new
          account holder had no way in at all: the quick-log's account picker
          was empty, Save stayed disabled, and Money was a locked door. Every
          other empty state in this module (budgets, goals, debts) already
          passed an action; this one was simply missed. */}
      {accounts.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Add your chequing, credit card, or cash accounts to start logging."
          icon={<Wallet className="size-8" />}
          action={
            <Button onClick={() => setShowAccountForm(true)}>
              <Plus className="size-4" strokeWidth={3} />
              New account
            </Button>
          }
        />
      ) : (
        <Panel>
          <PanelHead
            title="Accounts"
            count={accounts.length}
            action={
              <button
                type="button"
                onClick={() => setShowAccountForm(true)}
                aria-label="Add account"
                className="tap-press flex size-7 items-center justify-center border-2 border-rule bg-surface transition-colors hover:bg-foreground hover:text-background"
              >
                <Plus className="size-4" strokeWidth={3} />
              </button>
            }
          />
          <ul>
            {accounts.map((a, i) => {
              const utilization =
                a.type === "credit_card" && a.credit_limit_cents
                  ? Math.min(
                      100,
                      Math.round((a.current_balance_cents / a.credit_limit_cents) * 100)
                    )
                  : null;
              return (
                <li
                  key={a.id}
                  className={cn("px-3 py-2.5", i > 0 && "border-t border-hairline")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{a.name}</p>
                      <p className="micro-sm mt-0.5 truncate text-muted-foreground">
                        {a.institution} · {ACCOUNT_TYPE_LABELS[a.type]}
                        {a.currency !== "CAD" && ` · ${a.currency}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-start gap-2">
                      <div className="text-right">
                        <p className="stat text-lg">
                          {formatCents(a.current_balance_cents, a.currency)}
                        </p>
                        {a.type === "credit_card" && a.credit_limit_cents && (
                          <p className="micro-sm mt-0.5 text-muted-foreground">
                            of {formatCents(a.credit_limit_cents, a.currency)}
                          </p>
                        )}
                      </div>
                      {/* Editing an account is new — a mistyped opening
                          balance used to be permanent. Both controls are
                          always visible rather than appearing on hover,
                          which on a phone means never. */}
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingAccount(a)}
                          aria-label={`Edit ${a.name}`}
                          className="tap-press text-muted-foreground/60 transition-colors hover:text-foreground"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => askToDeleteAccount(a)}
                          aria-label={`Delete ${a.name}`}
                          className="tap-press text-muted-foreground/60 transition-colors hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Credit utilisation. Squared and framed, and colour-coded
                      from the semantic tokens rather than the theme accent —
                      "you are close to your limit" has to mean the same thing
                      in every palette. */}
                  {utilization !== null && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-2 flex-1 border border-rule">
                        <div
                          className={cn(
                            "h-full",
                            utilization > 80
                              ? "bg-destructive"
                              : utilization > 50
                                ? "bg-warn"
                                : "bg-primary"
                          )}
                          style={{ width: `${utilization}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          "micro-sm w-9 shrink-0 text-right tabular",
                          utilization > 80 ? "text-destructive" : "text-muted-foreground"
                        )}
                      >
                        {utilization}%
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {/* ---------------- Repeating ---------------- */}
      <RecurringView
        recurring={recurring}
        accounts={accounts}
        categories={categories}
        onChanged={onRecurringChanged}
      />

      {/* Importing a bank statement is a Money job, not a Settings job — the
          wizard itself still lives under Settings, but it was unfindable from
          the screen where you'd go looking for it. */}
      {accounts.length > 0 && (
        <Panel>
          <PanelRow href="/settings/money" last>
            <span className="flex items-center gap-3">
              <Upload className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">Import from your bank</span>
                <Micro className="block truncate">Upload a CSV export and file it all at once</Micro>
              </span>
            </span>
          </PanelRow>
        </Panel>
      )}

      {/* ---------------- Remittances ---------------- */}
      <Panel>
        <PanelHead
          title="Remittances this year"
          action={
            // Was silently inert with no accounts: the button opened a form
            // gated on `accounts.length > 0`, so tapping it did nothing at all
            // and said nothing about why.
            <button
              type="button"
              onClick={() => setShowRemittanceForm(true)}
              disabled={cadAccounts.length === 0}
              title={cadAccounts.length === 0 ? "Add a Canadian account first" : undefined}
              className="micro-sm tap-press flex items-center gap-1 border-2 border-rule bg-surface px-2 py-1 transition-colors hover:bg-foreground hover:text-background disabled:pointer-events-none disabled:opacity-40"
            >
              <Send className="size-3" strokeWidth={2.5} />
              Send
            </button>
          }
        />
        <div className="grid grid-cols-2 gap-px bg-hairline">
          <div className="bg-surface p-3">
            <p className="micro-sm text-muted-foreground">Sent</p>
            <p className="stat mt-1 text-xl">
              {formatCents(remittance.cadTotalCents, "CAD")}
            </p>
          </div>
          <div className="bg-surface p-3">
            <p className="micro-sm text-muted-foreground">Received</p>
            <p className="stat mt-1 text-xl">
              {formatCents(remittance.inrTotalCents, "INR")}
            </p>
          </div>
        </div>
      </Panel>

      {/* ---------------- Recent transactions ---------------- */}
      <Panel>
        <PanelHead
          title="Recent"
          count={transactions.length > 0 ? transactions.length : undefined}
        />
        {transactions.length === 0 ? (
          <PanelEmpty>Nothing logged yet.</PanelEmpty>
        ) : (
          <ul>
            {transactions.map((t, i) => {
              const category = categoryById.get(t.category_id);
              const Icon = getFinanceIcon(category?.icon ?? "");
              const isIncome = category?.kind === "income";
              return (
                <li
                  key={t.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5",
                    i > 0 && "border-t border-hairline"
                  )}
                >
                  {/* The category colour is user-chosen data, so it stays a
                      literal — but it's now a framed square swatch rather than
                      a soft tinted circle, so it sits inside the language. */}
                  <span
                    className="flex size-8 shrink-0 items-center justify-center border-2 border-rule"
                    style={{ backgroundColor: category?.color ?? undefined }}
                  >
                    <Icon className="size-4 text-white mix-blend-difference" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {t.merchant || category?.name || "Transaction"}
                    </p>
                    <p className="micro-sm mt-0.5 truncate text-muted-foreground">
                      {formatInAppTimezone(t.txn_date, { month: "short", day: "numeric" })}
                      {category && ` · ${category.name}`}
                    </p>
                  </div>

                  <span
                    className={cn("shrink-0 text-sm font-bold tabular", isIncome && "text-ok")}
                  >
                    {isIncome ? "+" : "−"}
                    {formatCents(t.amount_cents, t.currency)}
                  </span>

                  <button
                    type="button"
                    onClick={() => setConfirmingTransaction(t)}
                    className="tap-press shrink-0 text-muted-foreground/50 transition-colors hover:text-destructive"
                    aria-label="Delete transaction"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {showAccountForm && (
        <AccountForm
          onClose={() => setShowAccountForm(false)}
          onSaved={(account) => {
            onAccountsChanged((prev) => [...prev, account]);
            setShowAccountForm(false);
          }}
        />
      )}

      {editingAccount && (
        <AccountForm
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSaved={(account) => {
            onAccountsChanged((prev) => prev.map((a) => (a.id === account.id ? account : a)));
            setEditingAccount(null);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deletingAccount)}
        title={`Delete ${deletingAccount?.account.name ?? "this account"}?`}
        description="This can't be undone."
        detail={
          deletingAccount && deletingAccount.txnCount > 0
            ? `${deletingAccount.txnCount} transaction${
                deletingAccount.txnCount === 1 ? "" : "s"
              } logged against it will be deleted too.`
            : undefined
        }
        confirmLabel="Delete account"
        pending={pending}
        onConfirm={handleDeleteAccount}
        onCancel={() => setDeletingAccount(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmingTransaction)}
        title="Delete this transaction?"
        description={
          confirmingTransaction
            ? `${confirmingTransaction.merchant || categoryById.get(confirmingTransaction.category_id)?.name || "Transaction"} — ${formatCents(
                confirmingTransaction.amount_cents,
                confirmingTransaction.currency
              )}. The account balance goes back up by the same amount.`
            : undefined
        }
        onConfirm={handleDeleteTransaction}
        onCancel={() => setConfirmingTransaction(null)}
      />

      {showRemittanceForm && cadAccounts.length > 0 && (
        <RemittanceForm
          accounts={cadAccounts}
          onClose={() => setShowRemittanceForm(false)}
          onLogged={(updatedAccount) => {
            onAccountsChanged((prev) =>
              prev.map((a) => (a.id === updatedAccount.id ? updatedAccount : a))
            );
            setShowRemittanceForm(false);
          }}
        />
      )}

      {reviewingReceipt && (
        <ReceiptReviewDialog
          receipt={reviewingReceipt}
          accounts={accounts}
          categories={categories}
          onClose={() => setReviewingReceipt(null)}
          onDiscarded={(receiptId) => {
            onReceiptsChanged((prev) => prev.filter((r) => r.id !== receiptId));
            setReviewingReceipt(null);
          }}
          onApproved={(receiptId, transactions, accountId, updatedBalanceCents) => {
            onReceiptsChanged((prev) => prev.filter((r) => r.id !== receiptId));
            onAccountsChanged((prev) =>
              prev.map((a) =>
                a.id === accountId ? { ...a, current_balance_cents: updatedBalanceCents } : a
              )
            );
            onTransactionsAdded(transactions);
            setReviewingReceipt(null);
          }}
        />
      )}
    </div>
  );
}
