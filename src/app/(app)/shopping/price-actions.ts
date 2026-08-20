"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolvePreferences } from "@/lib/preferences";
import { todayInAppTimezone } from "@/lib/time";
import {
  isDueToResurface,
  learnedIntervalDays,
  normalizeItemName,
  priceVerdict,
  summarisePrices,
  type PurchaseRow,
} from "@/lib/shopping/purchases";
import type { ShoppingItem } from "@/lib/shopping/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export interface ItemPrice {
  normalizedName: string;
  /** What it usually costs — the median, in cents. */
  typicalCents: number;
  lastCents: number;
  lastMerchant: string | null;
  observations: number;
  /** Learned buying interval in days, or null when there's too little history. */
  intervalDays: number | null;
}

/**
 * The price book: what everything usually costs you, and how often you buy it.
 *
 * Built entirely from `shopping_purchases`, which receipts have been filling
 * with a price and a merchant per line item since Round 1. Before that table
 * existed this was unanswerable — `receipts.line_items` held the prices, but
 * nothing ever read them back out.
 *
 * One query, grouped in memory. The alternative is a query per item and the
 * whole point is a screen that shows twenty of them at once.
 */
export async function getPriceBook(): Promise<Record<string, ItemPrice>> {
  const { supabase, user } = await requireUser();

  const { data } = await supabase
    .from("shopping_purchases")
    .select("normalized_name, purchased_on, price_cents, merchant")
    .eq("user_id", user.id)
    .order("purchased_on", { ascending: false })
    .limit(1000);

  const byName = new Map<string, PurchaseRow[]>();
  for (const row of (data as PurchaseRow[]) ?? []) {
    const list = byName.get(row.normalized_name) ?? [];
    list.push(row);
    byName.set(row.normalized_name, list);
  }

  const book: Record<string, ItemPrice> = {};
  for (const [name, rows] of byName) {
    const summary = summarisePrices(rows);
    const intervalDays = learnedIntervalDays(rows.map((r) => r.purchased_on));
    // An item with no priced purchase still earns an entry — the interval is
    // useful on its own, and that's the common case for anything only ever
    // ticked off a list rather than scanned from a receipt.
    if (!summary && intervalDays === null) continue;
    book[name] = {
      normalizedName: name,
      typicalCents: summary?.typicalPriceCents ?? 0,
      lastCents: summary?.lastPriceCents ?? 0,
      lastMerchant: summary?.lastMerchant ?? null,
      observations: summary?.observations ?? 0,
      intervalDays,
    };
  }
  return book;
}

/**
 * Staples due back on the list, each on its own learned rate.
 *
 * Replaces a single `last_purchased_at < now() - 14 days` query. Milk bought
 * weekly and washing-up liquid bought quarterly were treated identically by
 * that; they aren't now.
 */
export interface StapleSuggestion extends ShoppingItem {
  /** How often you actually buy this, in days — null when it's the fallback. */
  learnedIntervalDays: number | null;
}

export async function getSmartStapleSuggestions(): Promise<StapleSuggestion[]> {
  const { supabase, user } = await requireUser();

  const [{ data: staples }, { data: profile }, book] = await Promise.all([
    supabase
      .from("shopping_items")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_staple", true)
      .eq("on_list", false),
    supabase.from("profiles").select("preferences, timezone").eq("id", user.id).maybeSingle(),
    getPriceBook(),
  ]);

  const prefs = resolvePreferences(profile?.preferences);
  const today = todayInAppTimezone((profile?.timezone as string) || undefined);

  // One query for the history of every staple at once, rather than one per item.
  const items = (staples as ShoppingItem[]) ?? [];
  if (items.length === 0) return [];

  const names = items.map((i) => normalizeItemName(i.name));
  const { data: purchases } = await supabase
    .from("shopping_purchases")
    .select("normalized_name, purchased_on")
    .eq("user_id", user.id)
    .in("normalized_name", names);

  const datesByName = new Map<string, string[]>();
  for (const row of (purchases as { normalized_name: string; purchased_on: string }[]) ?? []) {
    const list = datesByName.get(row.normalized_name) ?? [];
    list.push(row.purchased_on);
    datesByName.set(row.normalized_name, list);
  }

  const due = items.filter((item) => {
    const key = normalizeItemName(item.name);
    const dates = datesByName.get(key) ?? [];
    // `last_purchased_at` stays the authority on when it was last bought — it's
    // updated by both a finished trip and an approved receipt — while the
    // purchase log supplies the rate.
    const lastPurchasedOn = item.last_purchased_at
      ? item.last_purchased_at.slice(0, 10)
      : dates.sort().at(-1) ?? null;

    return isDueToResurface({
      purchaseDates: dates,
      lastPurchasedOn,
      today,
      fallbackDays: prefs.stapleResurfaceDays,
      learnFromHistory: prefs.stapleLearnFromHistory,
    });
  });

  // Longest overdue first, capped — a suggestion row is a nudge, not an
  // inventory.
  return due
    .sort((a, b) => (a.last_purchased_at ?? "").localeCompare(b.last_purchased_at ?? ""))
    .slice(0, 6)
    .map((item) => ({
      ...item,
      // Carried on the row for the UI's "you buy this every N days" line, which
      // is the difference between "here's a suggestion" and "here's why".
      learnedIntervalDays: book[normalizeItemName(item.name)]?.intervalDays ?? null,
    }));
}

export interface PriceFlag {
  index: number;
  percent: number;
  typicalCents: number;
}

/**
 * Which receipt lines cost more than they usually do.
 *
 * Returns only the ones worth mentioning: `priceVerdict` stays silent below two
 * observations and below a 15% rise, because a warning on every third item is a
 * warning nobody reads.
 */
export async function flagDearItems(input: {
  items: { name: string; priceCents: number }[];
}): Promise<PriceFlag[]> {
  const { supabase, user } = await requireUser();

  const names = input.items.map((i) => normalizeItemName(i.name));
  if (names.length === 0) return [];

  const { data } = await supabase
    .from("shopping_purchases")
    .select("normalized_name, purchased_on, price_cents, merchant")
    .eq("user_id", user.id)
    .in("normalized_name", names);

  const byName = new Map<string, PurchaseRow[]>();
  for (const row of (data as PurchaseRow[]) ?? []) {
    const list = byName.get(row.normalized_name) ?? [];
    list.push(row);
    byName.set(row.normalized_name, list);
  }

  const flags: PriceFlag[] = [];
  input.items.forEach((item, index) => {
    const summary = summarisePrices(byName.get(normalizeItemName(item.name)) ?? []);
    const verdict = priceVerdict(item.priceCents, summary);
    if (verdict) {
      flags.push({ index, percent: verdict.percent, typicalCents: verdict.typicalCents });
    }
  });
  return flags;
}
