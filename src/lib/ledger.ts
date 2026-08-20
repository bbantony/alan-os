import "server-only";

import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/finance/money";
import { formatDuration, formatPace } from "@/lib/workout/format";

// One timeline across every module.
//
// The app has been six good modules that barely speak to each other. Each holds
// timestamped rows about the same life and none of them can see the others, so
// "what did Tuesday actually look like" was a question the app couldn't answer
// despite holding every piece of the answer.
//
// WHY A TYPESCRIPT UNION AND NOT A POSTGRES VIEW. A view over six tables would
// be faster at scale and is the textbook answer. It's the wrong one here: every
// query below inherits Row Level Security automatically because it goes through
// the user's own client, where a view needs its own security-invoker care to
// avoid becoming a hole; it needs no migration, so the shape can change as
// modules do; and the data is small enough that the performance difference is
// unmeasurable. If this ever gets slow, that's the moment to make it a view —
// not before.
//
// Nothing here writes. The ledger is a reading of what the modules already did.

export type LedgerKind = "money" | "training" | "task" | "routine" | "shopping" | "check";

export interface LedgerEvent {
  /** ISO instant, or a date at midnight for rows that only know a day. */
  at: string;
  /** YYYY-MM-DD, for grouping — some rows genuinely have no time of day. */
  date: string;
  kind: LedgerKind;
  title: string;
  detail?: string;
  /** Positive = money in, negative = money out. Only on `money` events. */
  amountCents?: number;
  currency?: "CAD" | "INR";
  /** Where tapping it goes. Every event links back to what produced it. */
  href: string;
  /** Marks a record, a first, or anything worth a flag in the timeline. */
  highlight?: boolean;
}

function dayStart(date: string): string {
  return `${date}T00:00:00.000Z`;
}

/**
 * Every event between two dates, newest first.
 *
 * `from` and `to` are plain YYYY-MM-DD and inclusive, because that's how every
 * module stores the dates people actually reason about (`txn_date`,
 * `workout_date`, `purchased_on`).
 */
export async function getLedger(from: string, to: string): Promise<LedgerEvent[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [
    { data: transactions },
    { data: workouts },
    { data: tasks },
    { data: routines },
    { data: purchases },
    { data: reconciliations },
  ] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, amount_cents, currency, merchant, txn_date, created_at, source, categories(name, kind)")
      .eq("user_id", user.id)
      .gte("txn_date", from)
      .lte("txn_date", to),
    supabase
      .from("workouts")
      .select(
        "id, workout_date, type, created_at, workout_sets(exercise_id), runs(distance_km, duration_seconds), prs(id)"
      )
      .eq("user_id", user.id)
      .gte("workout_date", from)
      .lte("workout_date", to),
    supabase
      .from("tasks")
      .select("id, title, completed_at, category")
      .eq("user_id", user.id)
      .not("completed_at", "is", null)
      .gte("completed_at", dayStart(from))
      .lte("completed_at", `${to}T23:59:59.999Z`),
    supabase
      .from("routine_completions")
      .select("id, completed_date, completed_at, routines(title)")
      .eq("user_id", user.id)
      .gte("completed_date", from)
      .lte("completed_date", to),
    supabase
      .from("shopping_purchases")
      .select("id, item_name, purchased_on, price_cents, merchant, source, created_at")
      .eq("user_id", user.id)
      .gte("purchased_on", from)
      .lte("purchased_on", to),
    supabase
      .from("reconciliations")
      .select("id, statement_date, difference_cents, created_at, accounts(name)")
      .eq("user_id", user.id)
      .gte("statement_date", from)
      .lte("statement_date", to),
  ]);

  const events: LedgerEvent[] = [];

  // ---- Money
  for (const t of (transactions as unknown as {
    id: string;
    amount_cents: number;
    currency: "CAD" | "INR";
    merchant: string | null;
    txn_date: string;
    created_at: string;
    source: string;
    categories: { name: string; kind: string } | null;
  }[]) ?? []) {
    const isIncome = t.categories?.kind === "income";
    events.push({
      // created_at is the only time-of-day money has; txn_date can be
      // back-dated, so the ordering uses whichever is on the right day.
      at: t.created_at.slice(0, 10) === t.txn_date ? t.created_at : dayStart(t.txn_date),
      date: t.txn_date,
      kind: "money",
      title: t.merchant || t.categories?.name || "Transaction",
      detail: t.categories?.name,
      amountCents: isIncome ? t.amount_cents : -t.amount_cents,
      currency: t.currency,
      href: "/money",
    });
  }

  // ---- Training
  for (const w of (workouts as unknown as {
    id: string;
    workout_date: string;
    type: string;
    created_at: string;
    workout_sets: { exercise_id: string }[] | null;
    runs: { distance_km: number; duration_seconds: number }[] | null;
    prs: { id: string }[] | null;
  }[]) ?? []) {
    const run = w.runs?.[0];
    const sets = w.workout_sets ?? [];
    const exercises = new Set(sets.map((s) => s.exercise_id)).size;
    events.push({
      at: w.created_at.slice(0, 10) === w.workout_date ? w.created_at : dayStart(w.workout_date),
      date: w.workout_date,
      kind: "training",
      title: run ? "Run" : "Trained",
      detail: run
        ? `${run.distance_km} km · ${formatDuration(run.duration_seconds)} · ${formatPace(
            run.distance_km,
            run.duration_seconds
          )}`
        : `${exercises} exercise${exercises === 1 ? "" : "s"} · ${sets.length} set${
            sets.length === 1 ? "" : "s"
          }`,
      href: "/workout",
      highlight: (w.prs ?? []).length > 0,
    });
  }

  // ---- Tasks
  for (const t of (tasks as { id: string; title: string; completed_at: string; category: string }[]) ?? []) {
    events.push({
      at: t.completed_at,
      date: t.completed_at.slice(0, 10),
      kind: "task",
      title: t.title,
      detail: "Done",
      href: "/plan",
    });
  }

  // ---- Routines
  for (const r of (routines as unknown as {
    id: string;
    completed_date: string;
    completed_at: string;
    routines: { title: string } | null;
  }[]) ?? []) {
    events.push({
      at: r.completed_at ?? dayStart(r.completed_date),
      date: r.completed_date,
      kind: "routine",
      title: r.routines?.title ?? "Routine",
      detail: "Kept up",
      href: "/plan",
    });
  }

  // ---- Shopping, collapsed into trips
  //
  // Fifteen separate "bought milk" lines would drown every other event on the
  // day. One trip per date-and-merchant is what a person remembers doing.
  const trips = new Map<string, { date: string; merchant: string | null; count: number; totalCents: number; at: string }>();
  for (const p of (purchases as {
    id: string;
    item_name: string;
    purchased_on: string;
    price_cents: number | null;
    merchant: string | null;
    created_at: string;
  }[]) ?? []) {
    const key = `${p.purchased_on}|${p.merchant ?? ""}`;
    const trip = trips.get(key) ?? {
      date: p.purchased_on,
      merchant: p.merchant,
      count: 0,
      totalCents: 0,
      at: p.created_at,
    };
    trip.count += 1;
    trip.totalCents += p.price_cents ?? 0;
    trips.set(key, trip);
  }
  for (const trip of trips.values()) {
    events.push({
      at: trip.at.slice(0, 10) === trip.date ? trip.at : dayStart(trip.date),
      date: trip.date,
      kind: "shopping",
      title: trip.merchant ? `Shopping · ${trip.merchant}` : "Shopping trip",
      detail: `${trip.count} item${trip.count === 1 ? "" : "s"}${
        trip.totalCents > 0 ? ` · ${formatCents(trip.totalCents)}` : ""
      }`,
      href: "/shopping",
    });
  }

  // ---- Reconciliations
  for (const r of (reconciliations as unknown as {
    id: string;
    statement_date: string;
    difference_cents: number;
    created_at: string;
    accounts: { name: string } | null;
  }[]) ?? []) {
    events.push({
      at: r.created_at,
      date: r.statement_date,
      kind: "check",
      title: `Checked ${r.accounts?.name ?? "an account"} against the bank`,
      detail:
        r.difference_cents === 0
          ? "Matched exactly"
          : `Off by ${formatCents(Math.abs(r.difference_cents))}`,
      href: "/money/reconcile",
    });
  }

  // Newest first. Ties broken by kind so a day's events land in a stable order
  // rather than shuffling between renders — two things logged in the same
  // second should not swap places when you refresh.
  const KIND_ORDER: LedgerKind[] = ["training", "routine", "task", "shopping", "money", "check"];
  return events.sort((a, b) => {
    if (a.at !== b.at) return b.at.localeCompare(a.at);
    return KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  });
}

export interface LedgerDaySummary {
  date: string;
  events: LedgerEvent[];
  spentCents: number;
  earnedCents: number;
  trained: boolean;
  tasksDone: number;
}

/** Groups a flat event list by day, newest day first. */
export function groupByDay(events: LedgerEvent[]): LedgerDaySummary[] {
  const days = new Map<string, LedgerDaySummary>();

  for (const event of events) {
    const day = days.get(event.date) ?? {
      date: event.date,
      events: [],
      spentCents: 0,
      earnedCents: 0,
      trained: false,
      tasksDone: 0,
    };
    day.events.push(event);
    // CAD only in the totals, for the same reason every other total in this app
    // is: adding rupees to dollars would overstate a day by roughly sixty times.
    if (event.kind === "money" && event.amountCents && event.currency !== "INR") {
      if (event.amountCents < 0) day.spentCents += -event.amountCents;
      else day.earnedCents += event.amountCents;
    }
    if (event.kind === "training") day.trained = true;
    if (event.kind === "task") day.tasksDone += 1;
    days.set(event.date, day);
  }

  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}
