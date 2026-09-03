import { openDB, type IDBPDatabase } from "idb";
import type { ShoppingItem, ShoppingUnit } from "@/lib/shopping/types";

const DB_NAME = "alan-os-shopping";
const DB_VERSION = 2;

type OutboxMutationBody =
  | {
      id: string;
      type: "add";
      payload: {
        id: string;
        name: string;
        categoryId: string;
        isStaple: boolean;
        quantity?: number | null;
        quantityUnit?: ShoppingUnit | null;
        learnCategory?: boolean;
      };
    }
  | { id: string; type: "setChecked"; payload: { id: string; checked: boolean } }
  | { id: string; type: "setStaple"; payload: { id: string; isStaple: boolean } }
  | { id: string; type: "setCategory"; payload: { id: string; name: string; categoryId: string } }
  | { id: string; type: "delete"; payload: { id: string } }
  | { id: string; type: "addFromSuggestion"; payload: { id: string } }
  | { id: string; type: "finishTrip"; payload: { itemIds: string[] } };

export type OutboxMutation = OutboxMutationBody & {
  /**
   * When the change was queued (ms). Stamped by `enqueueMutation` — flushes
   * replay in this order, not in the UUID key order `getAll` returns.
   * Optional because rows queued before DB v2 don't have it.
   */
  queuedAt?: number;
  /** How many times a replay has failed on the network. Bumped by the sync layer. */
  attempts?: number;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains("items")) {
          db.createObjectStore("items", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "id" });
        }
        if (oldVersion > 0 && oldVersion < 2) {
          // v1 → v2: stamp any already-queued changes with a queue time, in
          // the order v1 would have replayed them, so nothing queued while
          // offline is lost or reordered by the upgrade. Uses the upgrade
          // transaction's own store — the rows themselves stay put.
          const store = tx.objectStore("outbox");
          store.getAll().then((rows: OutboxMutation[]) => {
            const base = Date.now() - rows.length;
            rows.forEach((row, i) => {
              if (row.queuedAt === undefined) {
                store.put({ ...row, queuedAt: base + i });
              }
            });
          });
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

// Two changes queued in the same millisecond still need a defined order, so
// each stamp is forced past the previous one.
let lastQueuedAt = 0;

export async function enqueueMutation(mutation: OutboxMutation) {
  const db = await getDb();
  const queuedAt = Math.max(Date.now(), lastQueuedAt + 1);
  lastQueuedAt = queuedAt;
  await db.put("outbox", { ...mutation, queuedAt });
}

/**
 * Rewrite a queued row in place (e.g. its `attempts` count) without
 * re-stamping its queue time — its place in the replay order must not move.
 */
export async function updateOutboxRow(mutation: OutboxMutation) {
  const db = await getDb();
  await db.put("outbox", mutation);
}

export async function getOutbox(): Promise<OutboxMutation[]> {
  const db = await getDb();
  const rows: OutboxMutation[] = await db.getAll("outbox");
  // Oldest first. Rows with no stamp (pre-v2) sort ahead of everything else,
  // keeping their existing relative order — Array.sort is stable.
  return rows.sort((a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0));
}

export async function removeFromOutbox(id: string) {
  const db = await getDb();
  await db.delete("outbox", id);
}
