import {
  addFromSuggestion,
  addShoppingItem,
  deleteShoppingItem,
  finishTrip,
  setChecked,
  setStaple,
} from "@/app/(app)/shopping/actions";
import { getOutbox, removeFromOutbox, type OutboxMutation } from "./shopping-db";

async function applyMutation(mutation: OutboxMutation) {
  switch (mutation.type) {
    case "add":
      return addShoppingItem(mutation.payload);
    case "setChecked":
      return setChecked(mutation.payload);
    case "setStaple":
      return setStaple(mutation.payload);
    case "delete":
      return deleteShoppingItem(mutation.payload);
    case "addFromSuggestion":
      return addFromSuggestion(mutation.payload);
    case "finishTrip":
      return finishTrip();
  }
}

let flushing = false;

export async function flushOutbox(): Promise<{ flushed: number; failed: boolean }> {
  if (flushing || typeof navigator !== "undefined" && !navigator.onLine) {
    return { flushed: 0, failed: false };
  }
  flushing = true;
  let flushed = 0;
  try {
    const queue = await getOutbox();
    for (const mutation of queue) {
      try {
        await applyMutation(mutation);
        await removeFromOutbox(mutation.id);
        flushed++;
      } catch {
        return { flushed, failed: true };
      }
    }
    return { flushed, failed: false };
  } finally {
    flushing = false;
  }
}

export { applyMutation };
