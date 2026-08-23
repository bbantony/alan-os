import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { todayInAppTimezone, addDaysToDateString } from "@/lib/time";
import { balanceDeltaCents } from "@/lib/finance/balance";
import { formatCents } from "@/lib/finance/money";
import { currentPeriodBounds } from "@/lib/finance/period";
import type { ModuleId, ModuleAccess } from "@/lib/permissions";
import {
  TASK_HORIZONS,
  TASK_CATEGORY_LABELS,
  type TaskCategory,
  type TaskHorizon,
} from "@/lib/tasks/types";
import type { FunctionDeclaration, ToolParameterSchema } from "./gemini";

/**
 * What the assistant can actually do.
 *
 * THE SECURITY MODEL, because this is the part worth being careful about.
 * Every tool runs against `ctx.supabase` — the *user's own* server client,
 * carrying their session. Row Level Security is therefore still doing the
 * work: a tool cannot read or write another account's data even if the model
 * asks it to, because the database refuses, not because a prompt says not to.
 * No tool anywhere in this file uses a service-role client, and none should.
 *
 * On top of that, tools are filtered by `module` before the model is ever
 * shown them: an account without Money access is not told that a
 * `log_expense` tool exists. Prompt injection can't reach a tool that was
 * never in the request.
 *
 * WRITES ARE NARROW ON PURPOSE. The assistant can add a task, tick one off,
 * log an expense, and add to the shopping list — the small, reversible,
 * everyday things. It cannot delete anything, cannot move money between
 * accounts, and cannot touch budgets, goals, debts or recurring rules. Those
 * are decisions, and decisions stay on the screens that were built for them.
 */

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
}

export interface AiTool {
  name: string;
  description: string;
  /** null = available to everyone; otherwise gated on module access. */
  module: ModuleId | null;
  parameters: ToolParameterSchema;
  /** Writes are surfaced to the person afterwards as "what I changed". */
  writes: boolean;
  run: (ctx: ToolContext, args: Record<string, unknown>) => Promise<unknown>;
}

const str = (description: string): ToolParameterSchema => ({ type: "STRING", description });
const num = (description: string): ToolParameterSchema => ({ type: "NUMBER", description });

function obj(
  properties: Record<string, ToolParameterSchema>,
  required: string[] = []
): ToolParameterSchema {
  return { type: "OBJECT", properties, required };
}

const NO_ARGS: ToolParameterSchema = { type: "OBJECT", properties: {} };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Finds the row whose name the model referred to in plain language ("groceries",
// "the visa"). Case-insensitive contains, shortest match wins, so "Visa" doesn't
// beat "Visa Infinite" when the person said "visa infinite".
function matchByName<T>(candidates: T[], needle: string, getName: (t: T) => string): T | null {
  const key = needle.trim().toLowerCase();
  if (!key) return null;
  const exact = candidates.find((c) => getName(c).toLowerCase() === key);
  if (exact) return exact;
  const contains = candidates
    .filter((c) => getName(c).toLowerCase().includes(key) || key.includes(getName(c).toLowerCase()))
    .sort((a, b) => getName(a).length - getName(b).length);
  return contains[0] ?? null;
}

// ---------------------------------------------------------------------------
// Plan (tasks + routines)
// ---------------------------------------------------------------------------

const listTasks: AiTool = {
  name: "list_tasks",
  description:
    "List the person's open tasks. Use for anything about what they have to do, what's overdue, or what's on today.",
  module: "tasks",
  writes: false,
  parameters: obj({
    filter: {
      type: "STRING",
      description: "Which tasks to return.",
      enum: ["all", "overdue", "today", "this_week"],
    },
  }),
  async run(ctx, args) {
    const filter = asString(args.filter) ?? "all";
    const today = todayInAppTimezone();

    let query = ctx.supabase
      .from("tasks")
      .select("id, title, horizon, due_at, category, notes")
      .eq("user_id", ctx.userId)
      .is("completed_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(60);

    if (filter === "overdue") query = query.lt("due_at", `${today}T00:00:00Z`);
    if (filter === "today") query = query.in("horizon", ["now", "today"]);
    if (filter === "this_week") query = query.in("horizon", ["now", "today", "this_week"]);

    const { data } = await query;
    return { today, tasks: data ?? [] };
  },
};

const createTask: AiTool = {
  name: "create_task",
  description:
    "Add a task. Use when the person asks to remember, plan or be reminded of something to do.",
  module: "tasks",
  writes: true,
  parameters: obj(
    {
      title: str("What the task is, in the person's own words."),
      horizon: {
        type: "STRING",
        description: "When it sits in their list.",
        enum: ["now", "today", "this_week", "this_month", "someday"],
      },
      due_date: str("Due date as YYYY-MM-DD. Omit if there is no deadline."),
      due_time: str("Time of day as HH:mm, 24-hour. Only with a due_date."),
      notify_minutes_before: num(
        "Minutes before the due time to send a notification. 0 means at the due time. Omit for no notification."
      ),
      category: {
        type: "STRING",
        description: "Which part of life this belongs to.",
        enum: ["personal", "work", "errand", "pr_application", "french", "other"],
      },
    },
    ["title"]
  ),
  async run(ctx, args) {
    const title = asString(args.title);
    if (!title) return { error: "A task needs a title." };

    // Both of these are Postgres ENUMS, and an unknown value is not a soft
    // failure — the insert throws, and `error.message` is returned straight to
    // a screen Alan is looking at, so he'd read
    // `invalid input value for enum task_horizon: "week"`. The tool schema
    // above already lists the legal values, but a schema is a request, not a
    // guarantee: any model that is told about this tool second-hand (the daily
    // outlook builds its own prompt, and got this exactly wrong) can send
    // something else. Clamp here, where the write actually happens.
    const horizon = TASK_HORIZONS.includes(asString(args.horizon) as TaskHorizon)
      ? (asString(args.horizon) as TaskHorizon)
      : null;
    const categories = Object.keys(TASK_CATEGORY_LABELS) as TaskCategory[];
    const category = categories.includes(asString(args.category) as TaskCategory)
      ? (asString(args.category) as TaskCategory)
      : "personal";

    const dueDate = asString(args.due_date);
    const dueTime = asString(args.due_time) ?? "09:00";
    // Stored UTC, displayed in Winnipeg — the app's rule everywhere.
    const dueAt = dueDate
      ? new Date(`${dueDate}T${dueTime}:00-05:00`).toISOString()
      : null;

    const { data, error } = await ctx.supabase
      .from("tasks")
      .insert({
        user_id: ctx.userId,
        title,
        horizon: horizon ?? (dueDate ? "today" : "this_week"),
        category,
        due_at: dueAt,
        notify_offset_minutes: asNumber(args.notify_minutes_before),
      })
      .select("id, title, horizon, due_at")
      .single();
    if (error) return { error: error.message };
    return { created: data };
  },
};

const completeTask: AiTool = {
  name: "complete_task",
  description: "Tick a task off. Match it by what the person called it.",
  module: "tasks",
  writes: true,
  parameters: obj({ title: str("The task's title, or close to it.") }, ["title"]),
  async run(ctx, args) {
    const needle = asString(args.title);
    if (!needle) return { error: "Which task?" };

    const { data: open } = await ctx.supabase
      .from("tasks")
      .select("id, title")
      .eq("user_id", ctx.userId)
      .is("completed_at", null)
      .limit(100);

    const match = matchByName((open as { id: string; title: string }[]) ?? [], needle, (t) => t.title);
    if (!match) return { error: `Nothing open matching "${needle}".` };

    await ctx.supabase
      .from("tasks")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", match.id)
      .eq("user_id", ctx.userId);
    return { completed: match.title };
  },
};

const listRoutines: AiTool = {
  name: "list_routines",
  description: "List the person's repeating routines and whether each is done today.",
  module: "tasks",
  writes: false,
  parameters: NO_ARGS,
  async run(ctx) {
    const today = todayInAppTimezone();
    const { data: routines } = await ctx.supabase
      .from("routines")
      .select("id, title, rrule, time_of_day")
      .eq("user_id", ctx.userId)
      .eq("active", true);
    const { data: done } = await ctx.supabase
      .from("routine_completions")
      .select("routine_id")
      .eq("user_id", ctx.userId)
      .eq("completed_date", today);

    const doneIds = new Set(((done as { routine_id: string }[]) ?? []).map((d) => d.routine_id));
    return {
      today,
      routines: ((routines as { id: string; title: string }[]) ?? []).map((r) => ({
        ...r,
        done_today: doneIds.has(r.id),
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

const moneyOverview: AiTool = {
  name: "get_money_overview",
  description:
    "Accounts and balances, every budget with what's been spent against it, and the safe-to-spend total. Start here for any money question.",
  module: "money",
  writes: false,
  parameters: NO_ARGS,
  async run(ctx) {
    const today = todayInAppTimezone();
    const [{ data: accounts }, { data: budgets }, { data: categories }] = await Promise.all([
      ctx.supabase
        .from("accounts")
        .select("id, name, type, currency, current_balance_cents, is_debt, credit_limit_cents")
        .eq("user_id", ctx.userId),
      ctx.supabase.from("budgets").select("*").eq("user_id", ctx.userId).eq("is_active", true),
      ctx.supabase.from("categories").select("id, name, kind").eq("user_id", ctx.userId),
    ]);

    const categoryById = new Map(
      ((categories as { id: string; name: string }[]) ?? []).map((c) => [c.id, c.name])
    );

    const budgetRows = [];
    let safeToSpendCents = 0;
    for (const b of (budgets as {
      id: string;
      category_id: string;
      amount_cents: number;
      period: "weekly" | "biweekly" | "monthly";
      anchor_date: string;
    }[]) ?? []) {
      const { start, end } = currentPeriodBounds(b.period, b.anchor_date, today);
      const { data: spentRows } = await ctx.supabase
        .from("transactions")
        .select("amount_cents")
        .eq("user_id", ctx.userId)
        .eq("category_id", b.category_id)
        .eq("currency", "CAD")
        .gte("txn_date", start)
        .lt("txn_date", end);
      const spent = ((spentRows as { amount_cents: number }[]) ?? []).reduce(
        (sum, r) => sum + r.amount_cents,
        0
      );
      safeToSpendCents += b.amount_cents - spent;
      budgetRows.push({
        category: categoryById.get(b.category_id) ?? "Category",
        limit: formatCents(b.amount_cents),
        spent: formatCents(spent),
        left: formatCents(b.amount_cents - spent),
        period: b.period,
        period_start: start,
        period_end: end,
      });
    }

    return {
      today,
      note: "All amounts are Canadian dollars unless the account says otherwise.",
      accounts: ((accounts as { name: string; currency: string; current_balance_cents: number }[]) ?? []).map(
        (a) => ({ ...a, balance: formatCents(a.current_balance_cents, a.currency as "CAD" | "INR") })
      ),
      budgets: budgetRows,
      safe_to_spend: formatCents(safeToSpendCents),
    };
  },
};

const listTransactions: AiTool = {
  name: "list_transactions",
  description:
    "Individual transactions in a date range, newest first. Use for 'what did I spend at X', 'show me last week', or to check something specific.",
  module: "money",
  writes: false,
  parameters: obj({
    from_date: str("Start date, YYYY-MM-DD. Defaults to 30 days ago."),
    to_date: str("End date, YYYY-MM-DD, inclusive. Defaults to today."),
    merchant: str("Only transactions whose merchant contains this."),
    category: str("Only transactions in this category, by name."),
  }),
  async run(ctx, args) {
    const today = todayInAppTimezone();
    const from = asString(args.from_date) ?? addDaysToDateString(today, -30);
    const to = asString(args.to_date) ?? today;

    const { data: categories } = await ctx.supabase
      .from("categories")
      .select("id, name, kind")
      .eq("user_id", ctx.userId);
    const categoryList = (categories as { id: string; name: string; kind: string }[]) ?? [];

    let query = ctx.supabase
      .from("transactions")
      .select("amount_cents, currency, merchant, note, txn_date, category_id, source")
      .eq("user_id", ctx.userId)
      .gte("txn_date", from)
      .lte("txn_date", to)
      .order("txn_date", { ascending: false })
      .limit(100);

    const merchant = asString(args.merchant);
    if (merchant) query = query.ilike("merchant", `%${merchant}%`);

    const categoryName = asString(args.category);
    if (categoryName) {
      const match = matchByName(categoryList, categoryName, (c) => c.name);
      if (!match) return { error: `No category called "${categoryName}".` };
      query = query.eq("category_id", match.id);
    }

    const { data } = await query;
    const nameById = new Map(categoryList.map((c) => [c.id, c.name]));
    const rows = ((data as {
      amount_cents: number;
      currency: string;
      merchant: string | null;
      txn_date: string;
      category_id: string;
      source: string;
    }[]) ?? []).map((t) => ({
      date: t.txn_date,
      amount: formatCents(t.amount_cents, t.currency as "CAD" | "INR"),
      amount_cents: t.amount_cents,
      merchant: t.merchant,
      category: nameById.get(t.category_id),
      source: t.source,
    }));
    return { from, to, count: rows.length, transactions: rows };
  },
};

const spendingByCategory: AiTool = {
  name: "get_spending_by_category",
  description:
    "Total spending per category over a date range, biggest first. Use for summaries, comparisons between periods, and reports.",
  module: "money",
  writes: false,
  parameters: obj({
    from_date: str("Start date, YYYY-MM-DD. Defaults to the start of this month."),
    to_date: str("End date, YYYY-MM-DD, inclusive. Defaults to today."),
  }),
  async run(ctx, args) {
    const today = todayInAppTimezone();
    const from = asString(args.from_date) ?? `${today.slice(0, 7)}-01`;
    const to = asString(args.to_date) ?? today;

    const { data } = await ctx.supabase
      .from("transactions")
      .select("amount_cents, category_id, categories(name, kind)")
      .eq("user_id", ctx.userId)
      .eq("currency", "CAD")
      .gte("txn_date", from)
      .lte("txn_date", to);

    const totals = new Map<string, number>();
    let incomeCents = 0;
    for (const row of (data as unknown as {
      amount_cents: number;
      categories: { name: string; kind: string } | null;
    }[]) ?? []) {
      if (!row.categories) continue;
      if (row.categories.kind === "income") {
        incomeCents += row.amount_cents;
        continue;
      }
      totals.set(row.categories.name, (totals.get(row.categories.name) ?? 0) + row.amount_cents);
    }

    const categories = [...totals.entries()]
      .map(([name, cents]) => ({ category: name, total: formatCents(cents), total_cents: cents }))
      .sort((a, b) => b.total_cents - a.total_cents);
    const spentCents = categories.reduce((sum, c) => sum + c.total_cents, 0);

    return {
      from,
      to,
      total_spent: formatCents(spentCents),
      total_income: formatCents(incomeCents),
      net: formatCents(incomeCents - spentCents),
      categories,
    };
  },
};

const listRecurring: AiTool = {
  name: "list_recurring_money",
  description:
    "The person's repeating income and expenses (rent, salary, subscriptions) and when each is next due.",
  module: "money",
  writes: false,
  parameters: NO_ARGS,
  async run(ctx) {
    const { data } = await ctx.supabase
      .from("recurring_transactions")
      .select("name, amount_cents, currency, frequency, next_date, active, category_id")
      .eq("user_id", ctx.userId)
      .order("next_date", { ascending: true });
    return {
      recurring: ((data as { amount_cents: number; currency: string }[]) ?? []).map((r) => ({
        ...r,
        amount: formatCents(r.amount_cents, r.currency as "CAD" | "INR"),
      })),
    };
  },
};

const logExpense: AiTool = {
  name: "log_expense",
  description:
    "Log a single expense or income. Only use when the person clearly states an amount they have actually spent or received.",
  module: "money",
  writes: true,
  parameters: obj(
    {
      amount: num("The amount in dollars, e.g. 12.50."),
      category: str("Category name, e.g. Groceries."),
      account: str("Account name. Defaults to their first account."),
      merchant: str("Where it was spent."),
      date: str("Date as YYYY-MM-DD. Defaults to today."),
      is_income: { type: "BOOLEAN", description: "True if money came in rather than went out." },
    },
    ["amount", "category"]
  ),
  async run(ctx, args) {
    const amount = asNumber(args.amount);
    if (!amount || amount <= 0) return { error: "How much?" };
    const amountCents = Math.round(amount * 100);
    const isIncome = args.is_income === true;

    const [{ data: accounts }, { data: categories }] = await Promise.all([
      ctx.supabase
        .from("accounts")
        .select("id, name, type, currency, current_balance_cents")
        .eq("user_id", ctx.userId)
        .order("sort_order"),
      ctx.supabase
        .from("categories")
        .select("id, name, kind")
        .eq("user_id", ctx.userId)
        .eq("is_archived", false),
    ]);

    const accountList = (accounts as {
      id: string;
      name: string;
      type: string;
      currency: string;
      current_balance_cents: number;
    }[]) ?? [];
    if (accountList.length === 0) {
      return { error: "There are no accounts set up yet, so there's nowhere to log it." };
    }

    const accountName = asString(args.account);
    const account = accountName
      ? matchByName(accountList, accountName, (a) => a.name) ?? accountList[0]
      : accountList[0];

    const categoryList = ((categories as { id: string; name: string; kind: string }[]) ?? []).filter(
      (c) => c.kind === (isIncome ? "income" : "expense")
    );
    const categoryName = asString(args.category) ?? "";
    const category = matchByName(categoryList, categoryName, (c) => c.name);
    if (!category) {
      return {
        error: `No ${isIncome ? "income" : "expense"} category matching "${categoryName}".`,
        available_categories: categoryList.map((c) => c.name),
      };
    }

    const { error } = await ctx.supabase.from("transactions").insert({
      user_id: ctx.userId,
      account_id: account.id,
      category_id: category.id,
      amount_cents: amountCents,
      currency: account.currency,
      merchant: asString(args.merchant),
      txn_date: asString(args.date) ?? todayInAppTimezone(),
      source: "quick_capture",
    });
    if (error) return { error: error.message };

    const delta = balanceDeltaCents(amountCents, isIncome, account.type as "chequing" | "credit_card" | "investment" | "cash");
    await ctx.supabase
      .from("accounts")
      .update({ current_balance_cents: account.current_balance_cents + delta })
      .eq("id", account.id);

    return {
      logged: {
        amount: formatCents(amountCents, account.currency as "CAD" | "INR"),
        category: category.name,
        account: account.name,
      },
    };
  },
};

const reconciliationStatus: AiTool = {
  name: "get_reconciliation_status",
  description:
    "When each account was last checked against a real bank statement, and whether it matched. Use for 'are my numbers right', 'am I due a check', or anything about accuracy.",
  module: "money",
  writes: false,
  parameters: NO_ARGS,
  async run(ctx) {
    const { data } = await ctx.supabase
      .from("reconciliations")
      .select("statement_date, difference_cents, cleared_count, accounts(name)")
      .eq("user_id", ctx.userId)
      .order("statement_date", { ascending: false })
      .limit(12);

    const rows = (data as unknown as {
      statement_date: string;
      difference_cents: number;
      cleared_count: number;
      accounts: { name: string } | null;
    }[]) ?? [];

    return {
      today: todayInAppTimezone(),
      checks: rows.map((r) => ({
        account: r.accounts?.name ?? "Account",
        statement_date: r.statement_date,
        matched: r.difference_cents === 0,
        was_off_by: r.difference_cents === 0 ? null : formatCents(Math.abs(r.difference_cents)),
        confirmed_transactions: r.cleared_count,
      })),
      note:
        rows.length === 0
          ? "No account has ever been checked against a statement."
          : "A gap that keeps appearing usually means something regular isn't being logged.",
    };
  },
};

// ---------------------------------------------------------------------------
// Shopping
// ---------------------------------------------------------------------------

const listShopping: AiTool = {
  name: "list_shopping",
  description: "What's on the shopping list right now.",
  module: "shopping",
  writes: false,
  parameters: NO_ARGS,
  async run(ctx) {
    const { data } = await ctx.supabase
      .from("shopping_items")
      .select("name, checked, quantity, quantity_unit, is_staple")
      .eq("user_id", ctx.userId)
      .eq("on_list", true)
      .order("checked", { ascending: true });
    return { items: data ?? [] };
  },
};

const addShopping: AiTool = {
  name: "add_shopping_items",
  description: "Add one or more things to the shopping list.",
  module: "shopping",
  writes: true,
  parameters: obj(
    { items: { type: "ARRAY", description: "Item names to add.", items: { type: "STRING" } } },
    ["items"]
  ),
  async run(ctx, args) {
    const names = Array.isArray(args.items)
      ? args.items.map((i) => asString(i)).filter((n): n is string => Boolean(n))
      : [];
    if (names.length === 0) return { error: "Add what?" };

    // Onto whichever category exists first — the shopping module's own
    // category guesser needs its client-side learned corrections, which aren't
    // available here, so this keeps it simple rather than guessing badly.
    const { data: categories } = await ctx.supabase
      .from("shopping_categories")
      .select("id, name")
      .eq("user_id", ctx.userId)
      .order("sort_order")
      .limit(1);
    const categoryId = (categories as { id: string }[])?.[0]?.id;
    if (!categoryId) return { error: "No shopping categories are set up yet." };

    const { error } = await ctx.supabase.from("shopping_items").insert(
      names.map((name) => ({
        user_id: ctx.userId,
        name,
        category_id: categoryId,
        on_list: true,
        checked: false,
      }))
    );
    if (error) return { error: error.message };
    return { added: names };
  },
};

// ---------------------------------------------------------------------------
// Workout
// ---------------------------------------------------------------------------

const workoutSummary: AiTool = {
  name: "get_workout_summary",
  description: "Recent training: sessions logged, runs, and how far back they go.",
  module: "workout",
  writes: false,
  parameters: obj({ days: num("How many days back to look. Defaults to 30.") }),
  async run(ctx, args) {
    const days = asNumber(args.days) ?? 30;
    const since = addDaysToDateString(todayInAppTimezone(), -Math.abs(days));
    // Runs hang off a workout rather than standing alone (0005), so the join
    // is how a run's date is known at all.
    const { data: workouts } = await ctx.supabase
      .from("workouts")
      .select("id, workout_date, type, notes, runs(distance_km, duration_seconds)")
      .eq("user_id", ctx.userId)
      .gte("workout_date", since)
      .order("workout_date", { ascending: false });

    const rows = (workouts as unknown as {
      workout_date: string;
      type: string;
      runs: { distance_km: number; duration_seconds: number }[] | null;
    }[]) ?? [];
    const totalKm = rows.reduce(
      (sum, w) => sum + (w.runs ?? []).reduce((s, r) => s + Number(r.distance_km ?? 0), 0),
      0
    );
    return {
      since,
      sessions: rows.length,
      runs: rows.filter((w) => (w.runs ?? []).length > 0).length,
      total_km: Number(totalKm.toFixed(1)),
      recent_sessions: rows.slice(0, 10).map((w) => ({ date: w.workout_date, type: w.type })),
    };
  },
};

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const ALL_TOOLS: AiTool[] = [
  listTasks,
  createTask,
  completeTask,
  listRoutines,
  moneyOverview,
  listTransactions,
  spendingByCategory,
  listRecurring,
  reconciliationStatus,
  logExpense,
  listShopping,
  addShopping,
  workoutSummary,
];

/** Only the tools this account is allowed to use — see the note at the top. */
export function toolsFor(moduleAccess: ModuleAccess): AiTool[] {
  return ALL_TOOLS.filter((t) => t.module === null || moduleAccess[t.module]);
}

export function declarationsFor(tools: AiTool[]): FunctionDeclaration[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}
