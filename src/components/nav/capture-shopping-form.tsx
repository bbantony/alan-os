"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Micro } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { buildKnownItemsMap, guessCategoryId } from "@/lib/shopping/category-guess";
import type { ShoppingCategoryItem, ShoppingCategoryRow } from "@/lib/shopping/types";
import { addShoppingItem } from "@/app/(app)/shopping/actions";

/**
 * One-field shopping capture: a name, and the app works out the aisle.
 *
 * The guess runs through the very same `guessCategoryId` the Shopping screen
 * uses, fed with that account's own learned items — so "milk" lands in Dairy
 * here exactly as it would there. Getting this wrong would be worse than
 * having no shortcut at all: an item filed under "Other" is an item you walk
 * past in the shop.
 *
 * ONLINE ONLY, on purpose, and the one place this is thinner than the Shopping
 * screen. That screen has a proper offline queue (an IndexedDB outbox that
 * replays when the signal comes back) and rebuilding it here would mean two
 * queues writing to the same list from two places. Adding while offline
 * therefore says so plainly and points at the screen that can do it.
 */
export function CaptureShoppingForm({
  categories,
  knownItems,
  onSaved,
}: {
  categories: ShoppingCategoryRow[];
  knownItems: ShoppingCategoryItem[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const knownItemsMap = useMemo(() => buildKnownItemsMap(knownItems), [knownItems]);

  const guessedCategoryId = name.trim()
    ? guessCategoryId(name, categories, knownItemsMap)
    : null;
  const guessedCategory = categories.find((c) => c.id === guessedCategoryId) ?? null;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("You're offline. Open the Shopping list to add it — that screen works without a signal.");
      return;
    }

    const categoryId = guessCategoryId(trimmed, categories, knownItemsMap);
    if (!categoryId) {
      toast.error("There are no shopping categories set up yet. Open the Shopping list once and they'll be created.");
      return;
    }

    setSaving(true);
    // Cleared immediately so the next item can be typed while this one saves,
    // and put back if the save fails.
    setName("");
    // "If the save fails" includes the signal dying mid-save, which REJECTS
    // rather than returning an error. Unguarded, that skipped everything
    // below: the button stuck on "Adding…" for good and the word typed was
    // lost. Same try/catch/finally the money logger uses.
    let result: Awaited<ReturnType<typeof addShoppingItem>>;
    try {
      result = await addShoppingItem({
        id: crypto.randomUUID(),
        name: trimmed,
        categoryId,
        isStaple: false,
        // Nothing was chosen by hand here, so there is nothing to teach it —
        // learning from a guess would harden a guess into a rule.
        learnCategory: false,
      });
    } catch {
      setName(trimmed);
      toast.error("Couldn't add that — check your connection and try again.");
      return;
    } finally {
      setSaving(false);
    }

    if (result.error) {
      setName(trimmed);
      toast.error(result.error);
      return;
    }

    toast.success(`${trimmed} is on the list`);
    nameRef.current?.focus();
    onSaved();
  }

  return (
    <form onSubmit={handleAdd} className="flex flex-col gap-3 p-3">
      <div>
        <label className="micro-sm mb-1.5 block text-muted-foreground" htmlFor="capture-shopping-name">
          What to buy
        </label>
        <Input
          id="capture-shopping-name"
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Milk"
          disabled={saving}
        />
      </div>

      <Button type="submit" block disabled={saving || !name.trim()}>
        {saving ? "Adding…" : "Add to list"}
      </Button>

      <Micro className="block text-muted-foreground">
        {guessedCategory
          ? `Goes under ${guessedCategory.name} — you can move it on the Shopping screen.`
          : "It'll be filed for you, and you can move it on the Shopping screen."}
      </Micro>
    </form>
  );
}
