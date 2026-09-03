export type AccountType = "chequing" | "credit_card" | "investment" | "cash";
export type CurrencyCode = "CAD" | "INR";
export type CategoryKind = "expense" | "income";
export type BudgetPeriod = "weekly" | "biweekly" | "monthly";
export type TransactionSource = "manual" | "receipt" | "csv" | "quick_capture" | "recurring";
export type RecurrenceFrequency = "weekly" | "biweekly" | "monthly" | "yearly";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  chequing: "Chequing",
  credit_card: "Credit Card",
  investment: "Investment",
  cash: "Cash",
};

export const BUDGET_PERIOD_LABELS: Record<BudgetPeriod, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
};

export interface Account {
  id: string;
  user_id: string;
  name: string;
  institution: string;
  type: AccountType;
  currency: CurrencyCode;
  current_balance_cents: number;
  is_debt: boolean;
  credit_limit_cents: number | null;
  sort_order: number;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  kind: CategoryKind;
  is_archived: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string;
  amount_cents: number;
  currency: CurrencyCode;
  fx_rate_to_cad: number | null;
  merchant: string | null;
  note: string | null;
  txn_date: string;
  source: TransactionSource;
  receipt_id: string | null;
  /** Set on both legs of a transfer between own accounts (migration 0037); null on ordinary rows. */
  transfer_group_id: string | null;
  /** 'out' on the sending leg, 'in' on the receiving leg (migration 0038); null on ordinary rows and pre-0038 transfer legs. */
  transfer_direction: "in" | "out" | null;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  amount_cents: number;
  period: BudgetPeriod;
  anchor_date: string;
  is_active: boolean;
  created_at: string;
}

export interface SavingsGoal {
  id: string;
  user_id: string;
  name: string;
  target_cents: number;
  saved_cents: number;
  deadline: string | null;
  icon: string;
  is_done: boolean;
  created_at: string;
}

export type ReceiptStatus = "pending_review" | "approved" | "discarded";

export interface ReceiptLineItem {
  raw_name: string;
  clean_name: string;
  price_cents: number;
  category_id: string | null;
  approved: boolean;
}

export interface Receipt {
  id: string;
  user_id: string;
  storage_path: string;
  merchant_guess: string | null;
  total_cents_guess: number | null;
  txn_date_guess: string | null;
  line_items: ReceiptLineItem[];
  status: ReceiptStatus;
  created_at: string;
}

// A template that posts real transactions on a schedule. Whether a posting is
// income or expense comes from its category's `kind` at post time, never from
// a flag here — one source of truth, so the two can't disagree.
export interface RecurringTransaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string;
  name: string;
  amount_cents: number;
  currency: CurrencyCode;
  merchant: string | null;
  note: string | null;
  frequency: RecurrenceFrequency;
  anchor_date: string;
  next_date: string;
  last_posted_date: string | null;
  end_date: string | null;
  auto_post: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Debt {
  id: string;
  user_id: string;
  account_id: string | null;
  name: string;
  balance_cents: number;
  interest_rate_pct: number;
  min_payment_cents: number;
  target_payoff_date: string | null;
  created_at: string;
}
