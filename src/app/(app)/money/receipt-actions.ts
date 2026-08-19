"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractReceiptData } from "@/lib/ai/receipt-vision";
import { findBestMatch } from "@/lib/finance/fuzzy-match";
import { balanceDeltaCents } from "@/lib/finance/balance";
import type { AccountType, Category, Receipt, ReceiptLineItem, Transaction } from "@/lib/finance/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function extForMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("receipts").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  return (data as Receipt) ?? null;
}

// A viewable link to the photo itself.
//
// The bucket is private, so the stored path is not a URL anyone can open — it
// has to be signed. Without this the review screen had no way to show the
// receipt at all: the photo was uploaded, stored, and then never seen again,
// which with no AI key configured meant typing every line in from the paper
// receipt while the phone showed a blank form. One hour is long enough for any
// realistic review session and short enough that a leaked link is worthless.
export async function getReceiptPhotoUrl(input: { id: string }): Promise<string | null> {
  const { supabase, user } = await requireUser();
  const { data: receipt } = await supabase
    .from("receipts")
    .select("storage_path")
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!receipt) return null;

  const { data } = await supabase.storage
    .from("receipts")
    .createSignedUrl(receipt.storage_path as string, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function getPendingReceipts(): Promise<Receipt[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("receipts")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "pending_review")
    .order("created_at", { ascending: false });
  return (data as Receipt[]) ?? [];
}

// Uploads the photo to private Storage, then (if an AI key is configured)
// asks it to read the receipt. Either way a `receipts` row is created —
// with real guesses if AI succeeded, or blank fields ready for fully manual
// entry if not (SPEC.md Part F's graceful-failure path, not an error state).
export async function uploadReceipt(formData: FormData): Promise<{ receiptId?: string; error?: string }> {
  const { supabase, user } = await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No photo was attached." };
  // The client shrinks photos to ~1600px before sending (src/lib/images.ts),
  // which is what keeps them under the 1 MB Server Action body limit. This is
  // the backstop for a file that somehow arrives un-shrunk — a returned error
  // the person can read, rather than the framework's own 413.
  if (file.size > 4 * 1024 * 1024) {
    return { error: "That photo is too big to send. Try taking it again." };
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = file.type || "image/jpeg";
  const ext = extForMimeType(mimeType);
  const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("receipts")
    .upload(storagePath, buffer, { contentType: mimeType });
  if (uploadError) return { error: "Couldn't upload the photo. Try again." };

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_archived", false);
  const categoryList = (categories as Category[]) ?? [];

  const extraction = await extractReceiptData(buffer.toString("base64"), mimeType);

  const lineItems: ReceiptLineItem[] = (extraction?.line_items ?? []).map((li) => {
    const match = li.category_guess ? findBestMatch(li.category_guess, categoryList, (c) => c.name) : null;
    return {
      raw_name: li.raw_name,
      clean_name: li.clean_name,
      price_cents: li.price_cents,
      category_id: match?.item.id ?? null,
      approved: true,
    };
  });

  const { data: receipt, error: insertError } = await supabase
    .from("receipts")
    .insert({
      user_id: user.id,
      storage_path: storagePath,
      merchant_guess: extraction?.merchant ?? null,
      total_cents_guess: extraction?.total_cents ?? null,
      txn_date_guess: extraction?.date ?? null,
      line_items: lineItems,
      status: "pending_review",
    })
    .select("id")
    .single();
  if (insertError || !receipt) return { error: "Couldn't save the receipt. Try again." };

  revalidatePath("/money");
  return { receiptId: receipt.id as string };
}

export async function updateReceiptLineItems(input: {
  id: string;
  lineItems: ReceiptLineItem[];
  merchant: string | null;
  txnDate: string;
}) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("receipts")
    .update({
      line_items: input.lineItems,
      merchant_guess: input.merchant,
      txn_date_guess: input.txnDate,
    })
    .eq("id", input.id)
    .eq("user_id", user.id);
  revalidatePath("/money");
}

export async function discardReceipt(input: { id: string }) {
  const { supabase, user } = await requireUser();
  await supabase.from("receipts").update({ status: "discarded" }).eq("id", input.id).eq("user_id", user.id);
  revalidatePath("/money");
}

// The Shopping <-> Finance <-> (future Fridge) cross-check hook from
// SPEC.md Part B4: any approved line item whose cleaned name fuzzy-matches an
// item still on the shopping list gets auto-checked off, and staple timers
// advance — using plain string matching, not AI (no extra API call needed).
async function applyShoppingCrossCheck(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  lineItems: ReceiptLineItem[]
) {
  const { data: shoppingItems } = await supabase
    .from("shopping_items")
    .select("id, name, is_staple")
    .eq("user_id", userId)
    .eq("on_list", true)
    .eq("checked", false);
  if (!shoppingItems || shoppingItems.length === 0) return;

  const now = new Date().toISOString();
  for (const item of lineItems) {
    const match = findBestMatch(item.clean_name || item.raw_name, shoppingItems, (s) => s.name as string);
    if (!match) continue;
    await supabase
      .from("shopping_items")
      .update({
        checked: true,
        ...(match.item.is_staple ? { last_purchased_at: now } : {}),
      })
      .eq("id", match.item.id);
  }
}

export async function approveReceipt(input: {
  id: string;
  accountId: string;
  merchant: string | null;
  txnDate: string;
  lineItems: ReceiptLineItem[];
  splitByCategory: boolean;
}): Promise<{ error?: string; transactions?: Transaction[]; updatedAccountBalanceCents?: number }> {
  const { supabase, user } = await requireUser();

  const items = input.lineItems.filter((li) => li.price_cents > 0);
  if (items.length === 0) return { error: "Add at least one item before approving." };
  if (items.some((li) => !li.category_id)) return { error: "Every item needs a category." };

  const { data: account } = await supabase
    .from("accounts")
    .select("id, type, current_balance_cents")
    .eq("id", input.accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!account) return { error: "Couldn't find that account." };

  let totalCents = 0;
  let insertedTransactions: Transaction[];
  if (input.splitByCategory) {
    const byCategory = new Map<string, number>();
    for (const li of items) {
      byCategory.set(li.category_id!, (byCategory.get(li.category_id!) ?? 0) + li.price_cents);
    }
    const rows = [...byCategory.entries()].map(([categoryId, amountCents]) => ({
      user_id: user.id,
      account_id: input.accountId,
      category_id: categoryId,
      amount_cents: amountCents,
      currency: "CAD",
      merchant: input.merchant,
      note: null,
      txn_date: input.txnDate,
      source: "receipt",
      receipt_id: input.id,
    }));
    totalCents = rows.reduce((sum, r) => sum + r.amount_cents, 0);
    const { data, error } = await supabase.from("transactions").insert(rows).select("*");
    if (error) return { error: error.message };
    insertedTransactions = (data as Transaction[]) ?? [];
  } else {
    totalCents = items.reduce((sum, li) => sum + li.price_cents, 0);
    const counts = new Map<string, number>();
    for (const li of items) counts.set(li.category_id!, (counts.get(li.category_id!) ?? 0) + 1);
    const dominantCategory = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        account_id: input.accountId,
        category_id: dominantCategory,
        amount_cents: totalCents,
        currency: "CAD",
        merchant: input.merchant,
        note: null,
        txn_date: input.txnDate,
        source: "receipt",
        receipt_id: input.id,
      })
      .select("*")
      .single();
    if (error) return { error: error.message };
    insertedTransactions = data ? [data as Transaction] : [];
  }

  const delta = balanceDeltaCents(totalCents, false, account.type as AccountType);
  const updatedBalance = (account.current_balance_cents as number) + delta;
  await supabase.from("accounts").update({ current_balance_cents: updatedBalance }).eq("id", account.id);

  await applyShoppingCrossCheck(supabase, user.id, items);

  await supabase
    .from("receipts")
    .update({ status: "approved", line_items: items, merchant_guess: input.merchant, txn_date_guess: input.txnDate })
    .eq("id", input.id)
    .eq("user_id", user.id);

  revalidatePath("/money");
  revalidatePath("/shopping");
  revalidatePath("/today");
  return {
    transactions: insertedTransactions,
    updatedAccountBalanceCents: updatedBalance,
  };
}
