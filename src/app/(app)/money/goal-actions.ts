"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { todayInAppTimezone } from "@/lib/time";
import { goalPace } from "@/lib/finance/goal-pace";
import { firstOccurrenceOnOrAfter } from "@/lib/finance/recurring";
import type { RecurrenceFrequency } from "@/lib/finance/types";
import { friendlyDbError } from "@/lib/db-errors";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export interface GoalPlan {
  goalId: string;
  goalName: string;
  perWeekCents: number;
  perMonthCents: number;
  weeksLeft: number;
  overdue: boolean;
  reached: boolean;
  /** True once a repeating transfer already exists for this goal. */
  alreadySetUp: boolean;
}

/**
 * What each goal with a deadline needs per week, and whether it's already
 * being handled.
 *
 * `alreadySetUp` is matched by the repeating transaction's name rather than a
 * foreign key. That's deliberate: a transfer set up for a goal is an ordinary
 * repeating payment afterwards — you can edit it, pause it, or delete the goal
 * and keep saving — and a hard link would make the app police a relationship
 * the person is entitled to break.
 */
export async function getGoalPlans(): Promise<GoalPlan[]> {
  const { supabase, user } = await requireUser();

  const [{ data: goals }, { data: recurring }, { data: profile }] = await Promise.all([
    supabase
      .from("savings_goals")
      .select("id, name, target_cents, saved_cents, deadline, is_done")
      .eq("user_id", user.id)
      .eq("is_done", false),
    supabase.from("recurring_transactions").select("name").eq("user_id", user.id),
    supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle(),
  ]);

  const today = todayInAppTimezone((profile?.timezone as string) || undefined);
  const existingNames = new Set(
    ((recurring as { name: string }[]) ?? []).map((r) => r.name.trim().toLowerCase())
  );

  return ((goals as {
    id: string;
    name: string;
    target_cents: number;
    saved_cents: number;
    deadline: string | null;
  }[]) ?? [])
    .map((goal) => {
      const pace = goalPace({
        targetCents: goal.target_cents,
        savedCents: goal.saved_cents,
        deadline: goal.deadline,
        today,
      });
      if (!pace) return null;
      return {
        goalId: goal.id,
        goalName: goal.name,
        perWeekCents: pace.perWeekCents,
        perMonthCents: pace.perMonthCents,
        weeksLeft: pace.weeksLeft,
        overdue: pace.overdue,
        reached: pace.reached,
        alreadySetUp: existingNames.has(transferName(goal.name).trim().toLowerCase()),
      };
    })
    .filter((p): p is GoalPlan => p !== null);
}

function transferName(goalName: string): string {
  return `${goalName} savings`;
}

/**
 * Sets up the repeating transfer and the weekly check for a goal — from a tap,
 * never on its own.
 *
 * Two things get created because a number on a screen isn't a habit: the
 * transfer is what actually moves the money, and the routine is what puts it in
 * front of you every week so a bounced transfer doesn't go unnoticed for a
 * month.
 *
 * The transfer is filed under an expense category because from the current
 * account's point of view the money has left. That's the same call
 * `logRemittance` makes for money sent to India.
 */
export async function setUpGoalHabit(input: {
  goalId: string;
  amountCents: number;
  frequency: RecurrenceFrequency;
  accountId: string;
  categoryId: string;
  addRoutine: boolean;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (input.amountCents <= 0) return { error: "That amount doesn't look right." };

  const { data: goal } = await supabase
    .from("savings_goals")
    .select("id, name")
    .eq("id", input.goalId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!goal) return { error: "Couldn't find that goal." };

  const { data: account } = await supabase
    .from("accounts")
    .select("id, currency")
    .eq("id", input.accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) return { error: "Couldn't find that account." };

  const today = todayInAppTimezone();
  const { error: recurringError } = await supabase.from("recurring_transactions").insert({
    user_id: user.id,
    account_id: input.accountId,
    category_id: input.categoryId,
    name: transferName(goal.name as string),
    amount_cents: input.amountCents,
    currency: account.currency,
    merchant: null,
    note: `Towards "${goal.name}"`,
    frequency: input.frequency,
    anchor_date: today,
    next_date: firstOccurrenceOnOrAfter(input.frequency, today, today),
    auto_post: true,
  });
  if (recurringError) return { error: friendlyDbError(recurringError) ?? "That didn't save. Try again." };

  if (input.addRoutine) {
    const { data: routine } = await supabase
      .from("routines")
      .insert({
        user_id: user.id,
        title: `Check "${goal.name}" is on track`,
        icon: "PiggyBank",
        category: "personal",
        // Weekly on today's weekday, whatever the transfer's own cadence — the
        // check is a glance, and a weekly glance is the right amount of
        // attention for something that moves once a month.
        rrule: "RRULE:FREQ=WEEKLY",
      })
      .select("id")
      .single();

    // Every routine has at least one step, even a single-habit one — the
    // shape migration 0020 settled on.
    if (routine) {
      await supabase
        .from("routine_steps")
        .insert({ routine_id: routine.id, title: `Check "${goal.name}"`, sort_order: 0 });
    }
  }

  revalidatePath("/money");
  revalidatePath("/plan");
  revalidatePath("/today");
  return {};
}
