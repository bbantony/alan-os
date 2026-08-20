"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/**
 * Everything you've ever logged, as one JSON file.
 *
 * There has been no way to get data out of this app at all. That matters more
 * than it sounds: an app holding your bank balances, your training history and
 * your whole task list, with no export, is one you can't leave and can't back
 * up independently of one Supabase project.
 *
 * Every query is owner-scoped by RLS, so this can only ever return your own
 * rows — there is no admin path here even for the owner account.
 */
export async function exportEverything(): Promise<{ json?: string; error?: string }> {
  const { supabase, user } = await requireUser();

  // Named explicitly rather than discovered, so a future table has to be
  // deliberately added here — an export that silently misses new data is worse
  // than one that's honest about what it covers.
  const tables = [
    "profiles",
    "accounts",
    "categories",
    "transactions",
    "budgets",
    "savings_goals",
    "debts",
    "receipts",
    "recurring_transactions",
    "reconciliations",
    "tasks",
    "routines",
    "routine_steps",
    "routine_completions",
    "reminders",
    "day_plans",
    "shopping_items",
    "shopping_categories",
    "shopping_category_items",
    "shopping_purchases",
    "exercises",
    "workouts",
    "workout_sets",
    "runs",
    "prs",
    "workout_templates",
    "insights",
    "ai_usage",
  ] as const;

  const payload: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email },
  };

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select("*");
    // A table that errors is recorded as such rather than silently omitted —
    // an export with a quiet hole in it is a backup you'd trust wrongly.
    payload[table] = error ? { error: error.message } : (data ?? []);
  }

  return { json: JSON.stringify(payload, null, 2) };
}

export type WipeableModule = "money" | "plan" | "shopping" | "workout" | "ai";

export const WIPE_LABELS: Record<WipeableModule, string> = {
  money: "Money",
  plan: "Plan (tasks and routines)",
  shopping: "Shopping",
  workout: "Workout",
  ai: "AI history",
};

/**
 * Deletes one module's data and nothing else.
 *
 * Order matters where a foreign key doesn't cascade. Where one does — sets and
 * runs hang off workouts, steps and completions off routines — deleting the
 * parent is enough and deleting children first would just be slower.
 *
 * Categories and accounts are deliberately kept when wiping Money: they're
 * setup, not history, and someone clearing a year of transactions to start
 * fresh almost never means "and re-enter my thirteen categories". Say so on
 * screen rather than guessing silently.
 */
export async function wipeModule(input: {
  module: WipeableModule;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const own = (table: string) => supabase.from(table).delete().eq("user_id", user.id);

  switch (input.module) {
    case "money":
      await own("reconciliations");
      await own("recurring_transactions");
      await own("transactions");
      await own("receipts");
      await own("budgets");
      await own("savings_goals");
      await own("debts");
      break;
    case "plan":
      await own("reminders");
      await own("routine_completions");
      await own("routines");
      await own("tasks");
      await own("day_plans");
      break;
    case "shopping":
      await own("shopping_purchases");
      await own("shopping_items");
      break;
    case "workout":
      await own("workout_drafts");
      await own("prs");
      await own("workouts");
      await own("workout_templates");
      break;
    case "ai":
      await own("insights");
      await own("ai_usage");
      break;
  }

  revalidatePath("/", "layout");
  return {};
}
