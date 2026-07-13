import { openDB, type IDBPDatabase } from "idb";
import type { ShoppingCategory, ShoppingItem } from "@/lib/shopping/types";

const DB_NAME = "alan-os-shopping";
const DB_VERSION = 1;

export type OutboxMutation =
  | { id: string; type: "add"; payload: { id: string; name: string; category: ShoppingCategory; isStaple: boolean } }
  | { id: string; type: "setChecked"; payload: { id: string; checked: boolean } }
  | { id: string; type: "setStaple"; payload: { id: string; isStaple: boolean } }
  | { id: string; type: "delete"; payload: { id: string } }
  | { id: string; type: "addFromSuggestion"; payload: { id: string } }
  | { id: string; type: "finishTrip"; payload: Record<string, never> };

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("items")) {
          db.createObjectStore("items", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function cacheItems(items: ShoppingItem[]) {
  const db = await getDb();
  const tx = db.transaction("items", "readwrite");
  await tx.store.clear();
  for (const item of items) await tx.store.put(item);
  await tx.done;
}

export async function getCachedItems(): Promise<ShoppingItem[]> {
  const db = await getDb();
  return db.getAll("items");
}

export async function putCachedItem(item: ShoppingItem) {
  const db = await getDb();
  await db.put("items", item);
}

export async function deleteCachedItem(id: string) {
  const db = await getDb();
  await db.delete("items", id);
}

export async function enqueueMutation(mutation: OutboxMutation) {
  const db = await getDb();
  await db.put("outbox", mutation);
}

export async function getOutbox(): Promise<OutboxMutation[]> {
  const db = await getDb();
  return db.getAll("outbox");
}

export async function removeFromOutbox(id: string) {
  const db = await getDb();
  await db.delete("outbox", id);
}
