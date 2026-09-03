import {
  addFromSuggestion,
  addShoppingItem,
  deleteShoppingItem,
  finishTrip,
  setChecked,
  setItemCategory,
  setStaple,
} from "@/app/(app)/shopping/actions";
import {
  getOutbox,
  removeFromOutbox,
  updateOutboxRow,
  type OutboxMutation,
} from "./shopping-db";

// A change that fails on the network this many times gets set aside (and
// reported) rather than blocking everything queued behind it forever.
const MAX_ATTEMPTS = 5;

/** A queued change the server refused, in words Alan can act on. */
export type RejectedMutation = { description: string; reason: string };

async function applyMutation(mutation: OutboxMutation): Promise<{ error?: string }> {
  switch (mutation.type) {
    case "add":
      return addShoppingItem(mutation.payload);
    case "setChecked":
      return setChecked(mutation.payload);
    case "setStaple":
      return setStaple(mutation.payload);
    case "setCategory":
      return setItemCategory(mutation.payload);
    case "delete":
      return deleteShoppingItem(mutation.payload);
    case "addFromSuggestion":
      return addFromSuggestion(mutation.payload);
    case "finishTrip":
      // Replays act on exactly the items that were ticked when the trip was
      // finished — not whatever happens to be ticked by the time we're back
      // online. (Rows queued before DB v2 have no ids; the action then falls
      // back to everything currently ticked, its old behaviour.)
      return finishTrip(mutation.payload.itemIds);
  }
}

function describeMutation(mutation: OutboxMutation): string {
  switch (mutation.type) {
    case "add":
      return `Adding "${mutation.payload.name}"`;
    case "setChecked":
      return mutation.payload.checked ? "Ticking off an item" : "Un-ticking an item";
    case "setStaple":
      return mutation.payload.isStaple
        ? "Marking an item as a staple"
        : "Un-marking a staple";
    case "setCategory":
      return `Moving "${mutation.payload.name}" to another category`;
    case "delete":
      return "Removing an item";
    case "addFromSuggestion":
      return "Adding a suggested item";
    case "finishTrip":
      return "Finishing your trip";
  }
}

let flushing = false;

/**
 * Replay queued offline changes, oldest first.
 *
 * Two very different kinds of failure come back from a replay:
 * - the action RETURNS `{ error }` — the server looked at it and said no.
 *   That's permanent, so the row is removed and reported in `rejected`.
 * - the action THROWS — the network dropped it. That's temporary, so the row
 *   stays queued and the flush stops there (`failed: true`), because later
 *   changes to the same item must not overtake it. After MAX_ATTEMPTS such
 *   failures the row is set aside into `rejected` instead, so one poisoned
 *   change can't jam the queue forever.
 */
export async function flushOutbox(): Promise<{
  flushed: number;
  failed: boolean;
  rejected: RejectedMutation[];
}> {
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return { flushed: 0, failed: false, rejected: [] };
  }
  flushing = true;
  let flushed = 0;
  const rejected: RejectedMutation[] = [];
  try {
    const queue = await getOutbox();
    for (const mutation of queue) {
      let result: { error?: string };
      try {
        result = await applyMutation(mutation);
      } catch {
        const attempts = (mutation.attempts ?? 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          await removeFromOutbox(mutation.id);
          rejected.push({
            description: describeMutation(mutation),
            reason: "it kept failing to send, so it was set aside",
          });
          continue;
        }
        await updateOutboxRow({ ...mutation, attempts });
        return { flushed, failed: true, rejected };
      }
      await removeFromOutbox(mutation.id);
      if (result.error) {
        rejected.push({ description: describeMutation(mutation), reason: result.error });
      } else {
        flushed++;
      }
    }
    return { flushed, failed: false, rejected };
  } finally {
    flushing = false;
  }
}

export { applyMutation };
