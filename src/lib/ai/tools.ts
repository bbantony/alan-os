import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { todayInAppTimezone, addDaysToDateString, zonedTimeToUtc } from "@/lib/time";
import { balanceDeltaCents } from "@/lib/finance/balance";
import { formatCents } from "@/lib/finance/money";
import { toStoredKg } from "@/lib/workout/units";
import { currentPeriodBounds } from "@/lib/finance/period";
import type { ModuleId, ModuleAccess } from "@/lib/permissions";
import {
  TASK_HORIZONS,
  TASK_CATEGORY_LABELS,
  type TaskCategory,
  type TaskHorizon,
} from "@/lib/tasks/types";
import { friendlyDbError } from "@/lib/db-errors";
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

    // Winnipeg midnight, not UTC midnight — `${today}T00:00:00Z` counted
    // anything due between midnight and 6am local as already overdue.
    const [ty, tm, td] = today.split("-").map(Number);
    const todayStartUtc = zonedTimeToUtc({
      year: ty, month: tm, day: td, hour: 0, minute: 0, second: 0,
    }).toISOString();
    if (filter === "overdue") query = query.lt("due_at", todayStartUtc);
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
    //
    // This used to paste a literal `-05:00` onto the string. That is Central
    // DAYLIGHT time, so from November to March — five months a year — every
    // task the assistant created was due an hour earlier than asked for.
    // `zonedTimeToUtc` handles the switch, and it was already imported into
    // this file's own dependency. Never hardcode an offset for a named zone.
    const [hh, mm] = dueTime.split(":").map(Number);
    const [yy, mo, dd] = (dueDate ?? "").split("-").map(Number);
    const dueAt = dueDate
      ? zonedTimeToUtc({
          year: yy,
          month: mo,
          day: dd,
          hour: Number.isFinite(hh) ? hh : 9,
          minute: Number.isFinite(mm) ? mm : 0,
          second: 0,
        }).toISOString()
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
    if (error) return { error: friendlyDbError(error) ?? "That didn't save." };
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
        // Not spending — see migration 0037.
        .is("transfer_group_id", null)
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
      .is("transfer_group_id", null)
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

    // A named account that does not match is a QUESTION, not a fallback. This
    // used to silently drop the transaction onto accountList[0], so asking to
    // log something to "the visa" with no matching account put it on chequing
    // with a cheerful confirmation. Money on the wrong account is worse than
    // no money logged.
    const accountName = asString(args.account);
    let account = accountList[0];
    if (accountName) {
      const matched = matchByName(accountList, accountName, (a) => a.name);
      if (!matched) {
        return {
          error: `No account matching "${accountName}".`,
          available_accounts: accountList.map((a) => a.name),
        };
      }
      account = matched;
    }

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
    if (error) return { error: friendlyDbError(error) ?? "That didn't save." };

    // One statement in the database rather than read-add-write from here, so
    // two concurrent logs cannot each read the same starting balance and have
    // the second erase the first. See migration 0035.
    const delta = balanceDeltaCents(amountCents, isIncome, account.type as "chequing" | "credit_card" | "investment" | "cash");
    const { error: balanceError } = await ctx.supabase.rpc("adjust_account_balance", {
      p_account_id: account.id,
      p_delta_cents: delta,
    });
    if (balanceError) {
      // Told to the model so it tells the person, rather than confirming a
      // clean "logged it" over a balance that never moved.
      return {
        warning: "The transaction was saved but the account balance did not update.",
        logged: {
          amount: formatCents(amountCents, account.currency as "CAD" | "INR"),
          category: category.name,
          account: account.name,
        },
      };
    }

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
    if (error) return { error: friendlyDbError(error) ?? "That didn't save." };
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
// Writes that change or remove things
// ---------------------------------------------------------------------------
//
// Alan asked for an assistant he can "talk/write to directly and have it make
// changes for me in the app". Asked what it should be allowed to touch, he
// picked everything on the list: workouts, all of money, tasks/routines/
// shopping, and deleting and editing as well as adding.
//
// TWO THINGS THAT DID NOT CHANGE, because widening what it can do makes both
// matter more, not less:
//
//   - Every tool still runs on `ctx.supabase`, the person's own session. RLS
//     is still what stops it touching another account, not a prompt.
//   - Tools are still filtered by module before the model is shown them.
//
// AND ONE NEW RULE. Anything DESTRUCTIVE resolves its target with
// `matchOneStrictly` rather than `matchByName`. The loose matcher exists so
// "the visa" finds "Visa Infinite", which is right for reading and for adding.
// It is wrong for deleting: it returns a best guess where there was no clear
// winner, and the model has no way to know the difference. The strict matcher
// refuses and hands back the candidates instead, so the assistant asks rather
// than destroys.

/**
 * Exactly one match, or an explanation. Never a best guess.
 *
 * `null` name-match semantics differ from `matchByName` on purpose — see the
 * note above. Use this for anything the person cannot trivially undo.
 */
function matchOneStrictly<T>(
  candidates: T[],
  needle: string,
  getName: (t: T) => string
): { match: T } | { error: string; candidates?: string[] } {
  const key = needle.trim().toLowerCase();
  if (!key) return { error: "Which one?" };

  const exact = candidates.filter((c) => getName(c).toLowerCase() === key);
  if (exact.length === 1) return { match: exact[0] };
  if (exact.length > 1) {
    return { error: `More than one is called "${needle}".`, candidates: exact.map(getName) };
  }

  const partial = candidates.filter((c) => getName(c).toLowerCase().includes(key));
  if (partial.length === 1) return { match: partial[0] };
  if (partial.length === 0) {
    return { error: `Nothing matching "${needle}".`, candidates: candidates.slice(0, 12).map(getName) };
  }
  return {
    error: `"${needle}" could mean more than one thing — say which.`,
    candidates: partial.slice(0, 12).map(getName),
  };
}

/** The account's display unit, needed to read a spoken weight correctly. */
async function weightUnitFor(ctx: ToolContext): Promise<"kg" | "lbs"> {
  const { data } = await ctx.supabase
    .from("profiles")
    .select("weight_unit")
    .eq("id", ctx.userId)
    .maybeSingle();
  return (data?.weight_unit as "kg" | "lbs") ?? "lbs";
}

const updateTask: AiTool = {
  name: "update_task",
  description:
    "Change or delete an existing task: rename it, move its due date, change when it sits in the list, or remove it. Find it by what the person called it.",
  module: "tasks",
  writes: true,
  parameters: obj(
    {
      title: str("The task's current title, or close to it."),
      action: {
        type: "STRING",
        description: "What to do to it.",
        enum: ["rename", "reschedule", "move", "delete"],
      },
      new_title: str("The new title. Only for rename."),
      due_date: str("New due date as YYYY-MM-DD. Only for reschedule."),
      due_time: str("New time as HH:mm, 24-hour. Only with due_date."),
      horizon: {
        type: "STRING",
        description: "Where it should sit in the list. Only for move.",
        enum: ["now", "today", "this_week", "this_month", "someday"],
      },
    },
    ["title", "action"]
  ),
  async run(ctx, args) {
    const needle = asString(args.title);
    const action = asString(args.action);
    if (!needle) return { error: "Which task?" };

    const { data: open } = await ctx.supabase
      .from("tasks")
      .select("id, title, due_at, horizon")
      .eq("user_id", ctx.userId)
      .is("completed_at", null)
      .limit(200);

    const found = matchOneStrictly(
      (open as { id: string; title: string }[]) ?? [],
      needle,
      (t) => t.title
    );
    if ("error" in found) return found;
    const task = found.match;

    if (action === "delete") {
      const { error } = await ctx.supabase
        .from("tasks")
        .delete()
        .eq("id", task.id)
        .eq("user_id", ctx.userId);
      if (error) return { error: friendlyDbError(error) ?? "Couldn't delete that." };
      return { deleted: task.title };
    }

    const patch: Record<string, unknown> = {};
    if (action === "rename") {
      const nextTitle = asString(args.new_title);
      if (!nextTitle) return { error: "Rename it to what?" };
      patch.title = nextTitle;
    } else if (action === "reschedule") {
      const dueDate = asString(args.due_date);
      if (!dueDate) return { error: "Move it to which date?" };
      const dueTime = asString(args.due_time) ?? "09:00";
      const [hh, mm] = dueTime.split(":").map(Number);
      const [yy, mo, dd] = dueDate.split("-").map(Number);
      // zonedTimeToUtc, never a hardcoded offset — see createTask above.
      patch.due_at = zonedTimeToUtc({
        year: yy,
        month: mo,
        day: dd,
        hour: Number.isFinite(hh) ? hh : 9,
        minute: Number.isFinite(mm) ? mm : 0,
        second: 0,
      }).toISOString();
    } else if (action === "move") {
      const horizon = asString(args.horizon);
      if (!TASK_HORIZONS.includes(horizon as TaskHorizon)) {
        return { error: `Not a place a task can sit. Use one of: ${TASK_HORIZONS.join(", ")}.` };
      }
      patch.horizon = horizon;
    } else {
      return { error: "Say whether to rename, reschedule, move or delete it." };
    }

    const { error } = await ctx.supabase
      .from("tasks")
      .update(patch)
      .eq("id", task.id)
      .eq("user_id", ctx.userId);
    if (error) return { error: friendlyDbError(error) ?? "Couldn't change that." };
    return { updated: task.title, changed: patch };
  },
};

const manageShoppingItem: AiTool = {
  name: "manage_shopping_item",
  description:
    "Tick something off the shopping list, or take it off the list entirely. Use add_shopping_items to put things on.",
  module: "shopping",
  writes: true,
  parameters: obj(
    {
      name: str("The item, or close to it."),
      action: {
        type: "STRING",
        description: "Tick it off as bought, or remove it from the list.",
        enum: ["check_off", "uncheck", "remove"],
      },
    },
    ["name", "action"]
  ),
  async run(ctx, args) {
    const needle = asString(args.name);
    const action = asString(args.action) ?? "check_off";
    if (!needle) return { error: "Which item?" };

    const { data: items } = await ctx.supabase
      .from("shopping_items")
      .select("id, name, checked")
      .eq("user_id", ctx.userId)
      .eq("on_list", true)
      .limit(200);

    const found = matchOneStrictly(
      (items as { id: string; name: string }[]) ?? [],
      needle,
      (i) => i.name
    );
    if ("error" in found) return found;

    const patch =
      action === "remove"
        ? { on_list: false }
        : { checked: action !== "uncheck" };
    const { error } = await ctx.supabase
      .from("shopping_items")
      .update(patch)
      .eq("id", found.match.id)
      .eq("user_id", ctx.userId);
    if (error) return { error: friendlyDbError(error) ?? "Couldn't change that." };
    return { item: found.match.name, action };
  },
};

const logWorkout: AiTool = {
  name: "log_workout",
  description:
    "Record a training session that has already happened — exercises with their sets, or a run. Only use when the person says what they actually did.",
  module: "workout",
  writes: true,
  parameters: obj(
    {
      date: str("Date as YYYY-MM-DD. Defaults to today."),
      notes: str("Anything they said about how it went."),
      exercises: {
        type: "ARRAY",
        description:
          "The lifts. Each needs a name and its sets. Weights are in the person's own unit — do not convert.",
        items: obj(
          {
            name: str("Exercise name, e.g. Bench Press."),
            sets: {
              type: "ARRAY",
              description: "One entry per set.",
              items: obj({
                reps: num("How many reps."),
                weight: num("Weight per set, in their display unit. 0 for bodyweight."),
              }),
            },
          },
          ["name", "sets"]
        ),
      },
    },
    ["exercises"]
  ),
  async run(ctx, args) {
    const rawExercises = Array.isArray(args.exercises) ? args.exercises : [];
    if (rawExercises.length === 0) return { error: "What did you do?" };

    const unit = await weightUnitFor(ctx);
    const workoutDate = asString(args.date) ?? todayInAppTimezone();

    // The exercise library is per-account since 0008 (`user_id` NOT NULL, and
    // `created_by` dropped in the same migration), so this is a plain
    // own-rows read. An unknown name is matched loosely first and only
    // created if it really isn't there — otherwise "bench" and "Bench Press"
    // become two exercises and the history splits in half.
    const { data: library } = await ctx.supabase
      .from("exercises")
      .select("id, name")
      .eq("user_id", ctx.userId)
      .limit(500);
    const known = (library as { id: string; name: string }[]) ?? [];

    const { data: workout, error: workoutError } = await ctx.supabase
      .from("workouts")
      .insert({
        user_id: ctx.userId,
        workout_date: workoutDate,
        type: "resistance",
        notes: asString(args.notes),
      })
      .select("id")
      .single();
    if (workoutError || !workout) {
      return { error: friendlyDbError(workoutError) ?? "Couldn't save that session." };
    }

    const logged: { exercise: string; sets: number }[] = [];
    for (const rawEx of rawExercises) {
      const ex = rawEx as { name?: unknown; sets?: unknown };
      const name = asString(ex.name);
      if (!name) continue;
      const sets = Array.isArray(ex.sets) ? ex.sets : [];
      if (sets.length === 0) continue;

      let exerciseId = matchByName(known, name, (e) => e.name)?.id;
      if (!exerciseId) {
        const { data: created } = await ctx.supabase
          .from("exercises")
          .insert({ user_id: ctx.userId, name, muscle_group: "other", equipment: "other" })
          .select("id, name")
          .single();
        if (!created) continue;
        exerciseId = created.id as string;
        known.push({ id: created.id as string, name: created.name as string });
      }

      const rows = sets.map((rawSet, i) => {
        const set = rawSet as { reps?: unknown; weight?: unknown };
        const weight = asNumber(set.weight) ?? 0;
        return {
          workout_id: workout.id,
          exercise_id: exerciseId,
          set_number: i + 1,
          reps: Math.max(0, Math.round(asNumber(set.reps) ?? 0)),
          // Stored in kg always; the model was told to speak in the person's
          // own unit and NOT to convert, so the conversion happens here where
          // the unit is actually known.
          weight_kg: toStoredKg(weight, unit),
        };
      });
      const { error: setError } = await ctx.supabase.from("workout_sets").insert(rows);
      if (!setError) logged.push({ exercise: name, sets: rows.length });
    }

    if (logged.length === 0) {
      // Don't leave an empty session behind.
      await ctx.supabase.from("workouts").delete().eq("id", workout.id).eq("user_id", ctx.userId);
      return { error: "None of those exercises had any sets on them." };
    }

    return { logged: { date: workoutDate, exercises: logged } };
  },
};

const manageBudget: AiTool = {
  name: "manage_budget",
  description:
    "Set or change a monthly spending limit for a category. Use get_money_overview first to see what already exists.",
  module: "money",
  writes: true,
  parameters: obj(
    {
      category: str("Category name, e.g. Groceries."),
      amount: num("The limit in dollars. Omit to remove the budget."),
      period: {
        type: "STRING",
        description: "How often it resets. Defaults to monthly.",
        enum: ["weekly", "biweekly", "monthly"],
      },
      remove: { type: "BOOLEAN", description: "True to switch the budget off." },
    },
    ["category"]
  ),
  async run(ctx, args) {
    const categoryName = asString(args.category);
    if (!categoryName) return { error: "A budget for what?" };

    const { data: categories } = await ctx.supabase
      .from("categories")
      .select("id, name, kind")
      .eq("user_id", ctx.userId)
      .eq("kind", "expense")
      .eq("is_archived", false);
    const list = (categories as { id: string; name: string }[]) ?? [];

    const found = matchOneStrictly(list, categoryName, (c) => c.name);
    if ("error" in found) return found;

    if (args.remove === true) {
      const { error } = await ctx.supabase
        .from("budgets")
        .update({ is_active: false })
        .eq("user_id", ctx.userId)
        .eq("category_id", found.match.id);
      if (error) return { error: friendlyDbError(error) ?? "Couldn't change that." };
      return { removed: found.match.name };
    }

    const amount = asNumber(args.amount);
    if (!amount || amount <= 0) return { error: "How much a month?" };
    const amountCents = Math.round(amount * 100);
    const period = asString(args.period) ?? "monthly";

    // `unique (user_id, category_id)` on budgets (0016), so this is an upsert
    // rather than a create — asking for a budget that exists means change it.
    const { error } = await ctx.supabase.from("budgets").upsert(
      {
        user_id: ctx.userId,
        category_id: found.match.id,
        amount_cents: amountCents,
        period,
        anchor_date: todayInAppTimezone(),
        is_active: true,
      },
      { onConflict: "user_id,category_id" }
    );
    if (error) return { error: friendlyDbError(error) ?? "Couldn't save that budget." };
    return {
      budget: { category: found.match.name, limit: formatCents(amountCents), period },
    };
  },
};

const manageGoal: AiTool = {
  name: "manage_goal",
  description:
    "Create a savings goal, or put money towards one that already exists.",
  module: "money",
  writes: true,
  parameters: obj(
    {
      name: str("What the goal is called, e.g. Trip to India."),
      action: {
        type: "STRING",
        description: "Make a new goal, or add money to an existing one.",
        enum: ["create", "add_money"],
      },
      amount: num("For create, the target in dollars. For add_money, how much to put in."),
      deadline: str("Target date as YYYY-MM-DD. Only for create, and optional."),
    },
    ["name", "action", "amount"]
  ),
  async run(ctx, args) {
    const name = asString(args.name);
    const action = asString(args.action);
    const amount = asNumber(args.amount);
    if (!name) return { error: "A goal for what?" };
    if (!amount || amount <= 0) return { error: "How much?" };
    const cents = Math.round(amount * 100);

    if (action === "create") {
      const { error } = await ctx.supabase.from("savings_goals").insert({
        user_id: ctx.userId,
        name,
        target_cents: cents,
        deadline: asString(args.deadline),
      });
      if (error) return { error: friendlyDbError(error) ?? "Couldn't create that goal." };
      return { created: { name, target: formatCents(cents) } };
    }

    const { data: goals } = await ctx.supabase
      .from("savings_goals")
      .select("id, name, saved_cents, target_cents")
      .eq("user_id", ctx.userId)
      .eq("is_done", false);
    const found = matchOneStrictly(
      (goals as { id: string; name: string; saved_cents: number; target_cents: number }[]) ?? [],
      name,
      (g) => g.name
    );
    if ("error" in found) return found;

    const nextSaved = found.match.saved_cents + cents;
    const { error } = await ctx.supabase
      .from("savings_goals")
      .update({ saved_cents: nextSaved, is_done: nextSaved >= found.match.target_cents })
      .eq("id", found.match.id)
      .eq("user_id", ctx.userId);
    if (error) return { error: friendlyDbError(error) ?? "Couldn't add that." };
    return {
      goal: found.match.name,
      added: formatCents(cents),
      saved: formatCents(nextSaved),
      target: formatCents(found.match.target_cents),
      done: nextSaved >= found.match.target_cents,
    };
  },
};

const updateTransaction: AiTool = {
  name: "update_transaction",
  description:
    "Fix or remove something already logged — put it in a different category, correct the amount, or delete it. Use list_transactions first to find it.",
  module: "money",
  writes: true,
  parameters: obj(
    {
      merchant: str("Where it was spent, as logged."),
      date: str("The date it is logged under, YYYY-MM-DD. Narrows it down."),
      action: {
        type: "STRING",
        description: "What to do to it.",
        enum: ["recategorise", "fix_amount", "delete"],
      },
      category: str("New category name. Only for recategorise."),
      amount: num("The correct amount in dollars. Only for fix_amount."),
    },
    ["merchant", "action"]
  ),
  async run(ctx, args) {
    const merchant = asString(args.merchant);
    const action = asString(args.action);
    if (!merchant) return { error: "Which transaction?" };

    let query = ctx.supabase
      .from("transactions")
      .select("id, merchant, amount_cents, currency, txn_date, account_id, category_id")
      .eq("user_id", ctx.userId)
      .order("txn_date", { ascending: false })
      .limit(50);
    const onDate = asString(args.date);
    if (onDate) query = query.eq("txn_date", onDate);

    const { data } = await query;
    const rows = (data as {
      id: string;
      merchant: string | null;
      amount_cents: number;
      currency: string;
      txn_date: string;
      account_id: string;
      category_id: string;
    }[]) ?? [];

    const found = matchOneStrictly(
      rows.filter((r) => r.merchant),
      merchant,
      (r) => r.merchant ?? ""
    );
    if ("error" in found) {
      return {
        ...found,
        hint: "Give the date as well if there is more than one.",
      };
    }
    const txn = found.match;
    const describe = `${txn.merchant} ${formatCents(txn.amount_cents, txn.currency as "CAD" | "INR")} on ${txn.txn_date}`;

    if (action === "delete") {
      const { error: delError } = await ctx.supabase
        .from("transactions")
        .delete()
        .eq("id", txn.id)
        .eq("user_id", ctx.userId);
      if (delError) return { error: friendlyDbError(delError) ?? "Couldn't delete that." };

      // Reverse its effect on the balance, reading the direction from the
      // CATEGORY rather than trusting anything passed in — same rule
      // deleteTransaction in money/actions.ts follows.
      const { data: account } = await ctx.supabase
        .from("accounts")
        .select("id, type")
        .eq("id", txn.account_id)
        .maybeSingle();
      const { data: category } = await ctx.supabase
        .from("categories")
        .select("kind")
        .eq("id", txn.category_id)
        .maybeSingle();
      if (account) {
        const delta = balanceDeltaCents(
          txn.amount_cents,
          category?.kind === "income",
          account.type as "chequing" | "credit_card" | "investment" | "cash"
        );
        await ctx.supabase.rpc("adjust_account_balance", {
          p_account_id: account.id,
          p_delta_cents: -delta,
        });
      }
      return { deleted: describe };
    }

    if (action === "recategorise") {
      const categoryName = asString(args.category);
      if (!categoryName) return { error: "Into which category?" };
      const { data: categories } = await ctx.supabase
        .from("categories")
        .select("id, name")
        .eq("user_id", ctx.userId)
        .eq("is_archived", false);
      const cat = matchOneStrictly(
        (categories as { id: string; name: string }[]) ?? [],
        categoryName,
        (c) => c.name
      );
      if ("error" in cat) return cat;
      const { error } = await ctx.supabase
        .from("transactions")
        .update({ category_id: cat.match.id })
        .eq("id", txn.id)
        .eq("user_id", ctx.userId);
      if (error) return { error: friendlyDbError(error) ?? "Couldn't move that." };
      return { moved: describe, into: cat.match.name };
    }

    if (action === "fix_amount") {
      const amount = asNumber(args.amount);
      if (!amount || amount <= 0) return { error: "What should it be?" };
      const nextCents = Math.round(amount * 100);
      const { error } = await ctx.supabase
        .from("transactions")
        .update({ amount_cents: nextCents })
        .eq("id", txn.id)
        .eq("user_id", ctx.userId);
      if (error) return { error: friendlyDbError(error) ?? "Couldn't change that." };

      // The balance has to move by the DIFFERENCE, in the same direction the
      // original went.
      const { data: account } = await ctx.supabase
        .from("accounts")
        .select("id, type")
        .eq("id", txn.account_id)
        .maybeSingle();
      const { data: category } = await ctx.supabase
        .from("categories")
        .select("kind")
        .eq("id", txn.category_id)
        .maybeSingle();
      if (account) {
        const isIncome = category?.kind === "income";
        const accountType = account.type as "chequing" | "credit_card" | "investment" | "cash";
        const before = balanceDeltaCents(txn.amount_cents, isIncome, accountType);
        const after = balanceDeltaCents(nextCents, isIncome, accountType);
        await ctx.supabase.rpc("adjust_account_balance", {
          p_account_id: account.id,
          p_delta_cents: after - before,
        });
      }
      return {
        corrected: describe,
        now: formatCents(nextCents, txn.currency as "CAD" | "INR"),
      };
    }

    return { error: "Say whether to recategorise it, fix the amount, or delete it." };
  },
};

const completeRoutine: AiTool = {
  name: "complete_routine",
  description: "Tick a repeating routine off for today. Use list_routines to see them.",
  module: "tasks",
  writes: true,
  parameters: obj({ title: str("The routine's name, or close to it.") }, ["title"]),
  async run(ctx, args) {
    const needle = asString(args.title);
    if (!needle) return { error: "Which routine?" };

    const { data: routines } = await ctx.supabase
      .from("routines")
      .select("id, title")
      .eq("user_id", ctx.userId)
      .eq("active", true);
    const found = matchOneStrictly(
      (routines as { id: string; title: string }[]) ?? [],
      needle,
      (r) => r.title
    );
    if ("error" in found) return found;

    const today = todayInAppTimezone();
    const { data: steps } = await ctx.supabase
      .from("routine_steps")
      .select("id")
      .eq("routine_id", found.match.id);

    const { error } = await ctx.supabase.from("routine_completions").upsert(
      {
        routine_id: found.match.id,
        user_id: ctx.userId,
        completed_date: today,
        steps_done: ((steps as { id: string }[]) ?? []).map((s) => s.id),
      },
      { onConflict: "user_id,routine_id,completed_date" }
    );
    if (error) return { error: friendlyDbError(error) ?? "Couldn't tick that off." };
    return { completed: found.match.title, date: today };
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
  // Added when Alan asked for an assistant that can actually change things.
  updateTask,
  completeRoutine,
  manageShoppingItem,
  logWorkout,
  manageBudget,
  manageGoal,
  updateTransaction,
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
