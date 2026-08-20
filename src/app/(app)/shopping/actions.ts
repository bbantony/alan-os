"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolvePreferences } from "@/lib/preferences";
import { normalizeItemName } from "@/lib/shopping/purchases";
import { todayInAppTimezone } from "@/lib/time";
import { getBudgets } from "@/app/(app)/money/actions";
import type {
  ShoppingCategoryItem,
  ShoppingCategoryRow,
  ShoppingItem,
  ShoppingUnit,
} from "@/lib/shopping/types";

// How long before a staple comes back onto the list.
//
// This was a hardcoded 14 days for everything — milk and washing-up liquid on
// the same timer. It's a setting now (Settings → Shopping), and the default
// lives in lib/preferences.ts so nothing moved for anyone who never changes it.
// Once an item has enough purchase history behind it (shopping_purchases,
// migration 0028) the interval is learned from that instead.
async function stapleDaysFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<number> {
  const { data } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  return resolvePreferences(data?.preferences).stapleResurfaceDays;
}

// Shopping <-> Finance hook (SPEC.md Part B4): "remaining budget for the
// relevant category visible while adding/checking off items" — the
// Groceries budget, since that's what an ordinary shopping trip maps to.
// Returns null if the owner hasn't set one up, rather than showing a
// misleading $0.
export interface GroceryBudgetSummary {
  remainingCents: number;
  amountCents: number;
  spentCents: number;
}

export async function getGroceryBudgetSummary(): Promise<GroceryBudgetSummary | null> {
  const budgets = await getBudgets();
  const grocery = budgets.find((b) => b.category_name.toLowerCase() === "groceries");
  if (!grocery) return null;
  return {
    remainingCents: Math.max(0, grocery.amount_cents - grocery.spent_cents),
    amountCents: grocery.amount_cents,
    spentCents: grocery.spent_cents,
  };
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function learnCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  itemName: string,
  categoryId: string
) {
  await supabase
    .from("shopping_category_items")
    .upsert(
      { user_id: userId, item_name: itemName.trim(), category_id: categoryId },
      { onConflict: "user_id,item_name" }
    );
}

export async function getShoppingCategories(): Promise<ShoppingCategoryRow[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("shopping_categories")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });
  return (data as ShoppingCategoryRow[]) ?? [];
}

export async function getKnownItems(): Promise<ShoppingCategoryItem[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("shopping_category_items")
    .select("*")
    .eq("user_id", user.id)
    .order("item_name", { ascending: true });
  return (data as ShoppingCategoryItem[]) ?? [];
}

export async function getShoppingItems(): Promise<ShoppingItem[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("shopping_items")
    .select("*")
    .eq("user_id", user.id)
    .eq("on_list", true)
    .order("checked", { ascending: true })
    .order("name", { ascending: true });
  return (data as ShoppingItem[]) ?? [];
}

export async function getStapleSuggestions(): Promise<ShoppingItem[]> {
  const { supabase, user } = await requireUser();
  const days = await stapleDaysFor(supabase, user.id);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("shopping_items")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_staple", true)
    .eq("on_list", false)
    .or(`last_purchased_at.is.null,last_purchased_at.lt.${cutoff}`)
    .order("last_purchased_at", { ascending: true, nullsFirst: true })
    .limit(6);
  return (data as ShoppingItem[]) ?? [];
}

export async function addShoppingItem(input: {
  id: string;
  name: string;
  categoryId: string;
  isStaple: boolean;
  quantity?: number | null;
  quantityUnit?: ShoppingUnit | null;
  learnCategory?: boolean;
}) {
  const { supabase, user } = await requireUser();
  await supabase.from("shopping_items").insert({
    id: input.id,
    user_id: user.id,
    name: input.name,
    category_id: input.categoryId,
    is_staple: input.isStaple,
    quantity: input.quantity ?? null,
    quantity_unit: input.quantityUnit ?? null,
    checked: false,
    on_list: true,
  });

  if (input.learnCategory) {
    await learnCategory(supabase, user.id, input.name, input.categoryId);
  }
}

export async function setChecked(input: { id: string; checked: boolean }) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("shopping_items")
    .update({ checked: input.checked })
    .eq("id", input.id)
    .eq("user_id", user.id);
}

export async function setStaple(input: { id: string; isStaple: boolean }) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("shopping_items")
    .update({ is_staple: input.isStaple })
    .eq("id", input.id)
    .eq("user_id", user.id);
}

export async function setItemCategory(input: { id: string; name: string; categoryId: string }) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("shopping_items")
    .update({ category_id: input.categoryId })
    .eq("id", input.id)
    .eq("user_id", user.id);

  await learnCategory(supabase, user.id, input.name, input.categoryId);
}

export async function deleteShoppingItem(input: { id: string }) {
  const { supabase, user } = await requireUser();
  await supabase.from("shopping_items").delete().eq("id", input.id).eq("user_id", user.id);
}

export async function addFromSuggestion(input: { id: string }) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("shopping_items")
    .update({ on_list: true, checked: false })
    .eq("id", input.id)
    .eq("user_id", user.id);
}

export async function finishTrip(): Promise<{ staples: number; oneOff: number }> {
  const { supabase, user } = await requireUser();
  const now = new Date().toISOString();

  const { data: checkedItems } = await supabase
    .from("shopping_items")
    .select("id, name, is_staple")
    .eq("user_id", user.id)
    .eq("on_list", true)
    .eq("checked", true);

  if (!checkedItems || checkedItems.length === 0) return { staples: 0, oneOff: 0 };

  const items = checkedItems as { id: string; name: string; is_staple: boolean }[];
  const stapleIds = items.filter((i) => i.is_staple).map((i) => i.id);
  const nonStapleIds = items.filter((i) => !i.is_staple).map((i) => i.id);

  // Every finished trip is now recorded, item by item, BEFORE the one-off items
  // are deleted below — they're real purchases and their history is what makes
  // a re-added item's consumption rate correct rather than starting from
  // scratch. No price: a hand-ticked trip doesn't know one. Receipts do, and
  // fill it in separately (money/receipt-actions.ts).
  const purchasedOn = todayInAppTimezone();
  await supabase.from("shopping_purchases").insert(
    items.map((item) => ({
      user_id: user.id,
      item_name: item.name,
      normalized_name: normalizeItemName(item.name),
      shopping_item_id: item.id,
      purchased_on: purchasedOn,
      source: "trip",
    }))
  );

  if (stapleIds.length > 0) {
    await supabase
      .from("shopping_items")
      .update({ on_list: false, checked: false, last_purchased_at: now })
      .in("id", stapleIds);
  }

  if (nonStapleIds.length > 0) {
    await supabase.from("shopping_items").delete().in("id", nonStapleIds);
  }

  return { staples: stapleIds.length, oneOff: nonStapleIds.length };
}

export async function createShoppingCategory(input: { name: string; icon: string }) {
  const { supabase, user } = await requireUser();
  const { data: existing } = await supabase
    .from("shopping_categories")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSort = (existing?.[0]?.sort_order ?? -1) + 1;

  await supabase.from("shopping_categories").insert({
    user_id: user.id,
    name: input.name,
    icon: input.icon,
    sort_order: nextSort,
  });
  revalidatePath("/settings/shopping");
}

export async function renameShoppingCategory(input: { id: string; name: string }) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("shopping_categories")
    .update({ name: input.name })
    .eq("id", input.id)
    .eq("user_id", user.id);
  revalidatePath("/settings/shopping");
}

export async function deleteShoppingCategory(input: { id: string }) {
  const { supabase, user } = await requireUser();

  const { data: fallback } = await supabase
    .from("shopping_categories")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_protected", true)
    .single();

  if (!fallback || fallback.id === input.id) return;

  await supabase
    .from("shopping_items")
    .update({ category_id: fallback.id })
    .eq("category_id", input.id)
    .eq("user_id", user.id);

  await supabase
    .from("shopping_category_items")
    .update({ category_id: fallback.id })
    .eq("category_id", input.id)
    .eq("user_id", user.id);

  await supabase
    .from("shopping_categories")
    .delete()
    .eq("id", input.id)
    .eq("user_id", user.id)
    .eq("is_protected", false);

  revalidatePath("/settings/shopping");
}

export async function addKnownItem(input: { categoryId: string; itemName: string }) {
  const { supabase, user } = await requireUser();
  await learnCategory(supabase, user.id, input.itemName, input.categoryId);
  revalidatePath("/settings/shopping");
}

export async function removeKnownItem(input: { id: string }) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("shopping_category_items")
    .delete()
    .eq("id", input.id)
    .eq("user_id", user.id);
  revalidatePath("/settings/shopping");
}
