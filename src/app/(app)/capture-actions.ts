"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { friendlyDbError } from "@/lib/db-errors";
import {
  getAccounts,
  getCategories,
  getRecentMerchants,
  type MerchantMemory,
} from "@/app/(app)/money/actions";
import { getShoppingCategories, getKnownItems } from "@/app/(app)/shopping/actions";
import type { Account, Category } from "@/lib/finance/types";
import type { ShoppingCategoryItem, ShoppingCategoryRow } from "@/lib/shopping/types";

// Everything the global capture sheet needs to open, in one round trip.
//
// The sheet is reachable from every screen, so it cannot rely on the module
// page it happens to be sitting on top of having already loaded this. It also
// cannot assume the account is allowed to use every module: this is the one
// place in the app where Money and Shopping data would otherwise be fetched
// together regardless of who is asking. The gate below is therefore not a
// nicety — a workout_member opening the sheet must be handed NOTHING from
// Money or Shopping, not an empty-looking form that still shipped their
// account and category names down the wire.
//
// Read-only. Everything the sheet actually SAVES goes through the existing
// per-module actions (money/actions.ts, shopping/actions.ts), which do their
// own requireUser + user_id scoping.

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export interface CaptureMoneyData {
  accounts: Account[];
  categories: Category[];
  recentMerchants: MerchantMemory[];
  /**
   * The "Default account" preference, already checked against the accounts
   * that actually exist — null when it names one that has since been deleted.
   * Same rule as money/page.tsx, so the sheet and the Money screen agree.
   */
  defaultAccountId: string | null;
}

export interface CaptureShoppingData {
  categories: ShoppingCategoryRow[];
  knownItems: ShoppingCategoryItem[];
}

export interface CaptureData {
  /** Absent entirely when the account cannot use the Money module. */
  money?: CaptureMoneyData;
  /** Absent entirely when the account cannot use the Shopping module. */
  shopping?: CaptureShoppingData;
  error?: string;
}

export async function getCaptureData(): Promise<CaptureData> {
  // requireUser is the guard every action file in here starts with; the
  // profile read alongside it is what the module pages use (it resolves
  // role + module_access through lib/permissions, the single source of
  // truth). Fetched together so the two auth round trips overlap.
  const [, profile] = await Promise.all([requireUser(), getCurrentProfile()]);
  if (!profile) redirect("/login");

  const wantsMoney = profile.moduleAccess.money;
  const wantsShopping = profile.moduleAccess.shopping;
  if (!wantsMoney && !wantsShopping) return {};

  try {
    // One Promise.all: the sheet opens on a tap and every one of these is a
    // separate query. Anything a module is switched off for resolves to null
    // without ever being asked for.
    const [accounts, categories, merchants, shoppingCategories, knownItems] = await Promise.all([
      wantsMoney ? getAccounts() : Promise.resolve(null),
      wantsMoney ? getCategories() : Promise.resolve(null),
      wantsMoney ? getRecentMerchants() : Promise.resolve(null),
      wantsShopping ? getShoppingCategories() : Promise.resolve(null),
      wantsShopping ? getKnownItems() : Promise.resolve(null),
    ]);

    const result: CaptureData = {};

    if (accounts && categories && merchants) {
      const preferred = profile.preferences.defaultAccountId;
      result.money = {
        accounts,
        categories,
        recentMerchants: merchants,
        defaultAccountId:
          preferred && accounts.some((a) => a.id === preferred) ? preferred : null,
      };
    }

    if (shoppingCategories && knownItems) {
      result.shopping = { categories: shoppingCategories, knownItems };
    }

    return result;
  } catch (error) {
    // The getters above swallow ordinary query errors and return empty lists,
    // so reaching here means something bigger went wrong (connection dropped,
    // auth token, RLS refusing a read). A thrown Postgres error still gets the
    // friendlyDbError treatment; anything else gets the read-flavoured
    // sentence, because friendlyDbError's own fallback talks about saving.
    const thrown = error as { code?: string; message?: string } | null;
    const friendly = thrown && typeof thrown.code === "string" ? friendlyDbError(thrown) : null;
    return {
      // "Quick-add options" was a name from the code: nothing on screen is
      // called that, so it named nothing Alan could go and look at. This says
      // what the sheet was actually fetching.
      error: friendly ?? "Couldn't load your accounts and lists. Check your connection and try again.",
    };
  }
}
