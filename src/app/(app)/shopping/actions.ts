"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ShoppingCategory, ShoppingItem, ShoppingUnit } from "@/lib/shopping/types";

const STAPLE_RESURFACE_DAYS = 14;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
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
  const cutoff = new Date(Date.now() - STAPLE_RESURFACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
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
  category: ShoppingCategory;
  isStaple: boolean;
  quantity?: number | null;
  quantityUnit?: ShoppingUnit | null;
}) {
  const { supabase, user } = await requireUser();
  await supabase.from("shopping_items").insert({
    id: input.id,
    user_id: user.id,
    name: input.name,
    category: input.category,
    is_staple: input.isStaple,
    quantity: input.quantity ?? null,
    quantity_unit: input.quantityUnit ?? null,
    checked: false,
    on_list: true,
  });
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

export async function finishTrip() {
  const { supabase, user } = await requireUser();
  const now = new Date().toISOString();

  const { data: checkedItems } = await supabase
    .from("shopping_items")
    .select("id, is_staple")
    .eq("user_id", user.id)
    .eq("on_list", true)
    .eq("checked", true);

  if (!checkedItems || checkedItems.length === 0) return;

  const stapleIds = checkedItems.filter((i) => i.is_staple).map((i) => i.id);
  const nonStapleIds = checkedItems.filter((i) => !i.is_staple).map((i) => i.id);

  if (stapleIds.length > 0) {
    await supabase
      .from("shopping_items")
      .update({ on_list: false, checked: false, last_purchased_at: now })
      .in("id", stapleIds);
  }

  if (nonStapleIds.length > 0) {
    await supabase.from("shopping_items").delete().in("id", nonStapleIds);
  }
}
