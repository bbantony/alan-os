"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Star, Trash2, WifiOff, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import {
  SHOPPING_CATEGORIES,
  SHOPPING_CATEGORY_LABELS,
  type ShoppingCategory,
  type ShoppingItem,
} from "@/lib/shopping/types";
import { guessCategory } from "@/lib/shopping/category-guess";
import {
  getShoppingItems,
  getStapleSuggestions,
  addShoppingItem,
  setChecked,
  setStaple,
  deleteShoppingItem,
  addFromSuggestion,
  finishTrip,
} from "./actions";
import {
  cacheItems,
  getCachedItems,
  putCachedItem,
  deleteCachedItem,
  enqueueMutation,
  type OutboxMutation,
} from "@/lib/offline/shopping-db";
import { flushOutbox } from "@/lib/offline/shopping-sync";

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine;
}

async function runOnlineFirst(mutation: OutboxMutation, action: () => Promise<unknown>) {
  if (isOnline()) {
    try {
      await action();
      return;
    } catch {
      // fall through — queue it for later
    }
  }
  await enqueueMutation(mutation);
}

export function ShoppingList({
  initialItems,
  initialSuggestions,
}: {
  initialItems: ShoppingItem[];
  initialSuggestions: ShoppingItem[];
}) {
  const [items, setItems] = useState<ShoppingItem[]>(initialItems);
  const [suggestions, setSuggestions] = useState<ShoppingItem[]>(initialSuggestions);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ShoppingCategory | null>(null);
  const [isStapleDraft, setIsStapleDraft] = useState(false);
  const hydrated = useRef(false);

  const refreshFromServer = useCallback(async () => {
    try {
      const [freshItems, freshSuggestions] = await Promise.all([
        getShoppingItems(),
        getStapleSuggestions(),
      ]);
      setItems(freshItems);
      setSuggestions(freshSuggestions);
      await cacheItems(freshItems);
    } catch {
      // stay on cached/local state
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      getCachedItems().then((cached) => {
        if (cached.length > 0) setItems((prev) => (prev.length > 0 ? prev : cached));
      });
    }

    async function handleOnline() {
      setOnline(true);
      const { flushed } = await flushOutbox();
      if (flushed > 0 || true) refreshFromServer();
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    flushOutbox().then(() => refreshFromServer());

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshFromServer]);

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = crypto.randomUUID();
    const finalCategory = category ?? guessCategory(trimmed);
    const item: ShoppingItem = {
      id,
      user_id: "",
      name: trimmed,
      category: finalCategory,
      is_staple: isStapleDraft,
      checked: false,
      on_list: true,
      last_purchased_at: null,
      created_at: new Date().toISOString(),
    };

    setItems((prev) => [...prev, item]);
    setName("");
    setCategory(null);
    setIsStapleDraft(false);
    await putCachedItem(item);

    await runOnlineFirst(
      { id: crypto.randomUUID(), type: "add", payload: { id, name: trimmed, category: finalCategory, isStaple: isStapleDraft } },
      () => addShoppingItem({ id, name: trimmed, category: finalCategory, isStaple: isStapleDraft })
    );
  }

  async function handleToggle(item: ShoppingItem) {
    const nextChecked = !item.checked;
    const updated = { ...item, checked: nextChecked };
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    await putCachedItem(updated);

    await runOnlineFirst(
      { id: crypto.randomUUID(), type: "setChecked", payload: { id: item.id, checked: nextChecked } },
      () => setChecked({ id: item.id, checked: nextChecked })
    );
  }

  async function handleToggleStaple(item: ShoppingItem) {
    const updated = { ...item, is_staple: !item.is_staple };
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    await putCachedItem(updated);

    await runOnlineFirst(
      { id: crypto.randomUUID(), type: "setStaple", payload: { id: item.id, isStaple: updated.is_staple } },
      () => setStaple({ id: item.id, isStaple: updated.is_staple })
    );
  }

  async function handleDelete(item: ShoppingItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await deleteCachedItem(item.id);

    await runOnlineFirst(
      { id: crypto.randomUUID(), type: "delete", payload: { id: item.id } },
      () => deleteShoppingItem({ id: item.id })
    );
  }

  async function handleAddSuggestion(item: ShoppingItem) {
    const updated = { ...item, on_list: true, checked: false };
    setSuggestions((prev) => prev.filter((i) => i.id !== item.id));
    setItems((prev) => [...prev, updated]);
    await putCachedItem(updated);

    await runOnlineFirst(
      { id: crypto.randomUUID(), type: "addFromSuggestion", payload: { id: item.id } },
      () => addFromSuggestion({ id: item.id })
    );
  }

  async function handleFinishTrip() {
    const checkedItems = items.filter((i) => i.checked);
    if (checkedItems.length === 0) return;

    const remaining: ShoppingItem[] = [];
    for (const item of items) {
      if (!item.checked) {
        remaining.push(item);
        continue;
      }
      if (item.is_staple) {
        await deleteCachedItem(item.id);
      } else {
        await deleteCachedItem(item.id);
      }
    }
    setItems(remaining);

    await runOnlineFirst(
      { id: crypto.randomUUID(), type: "finishTrip", payload: {} },
      () => finishTrip()
    );
    refreshFromServer();
  }

  const uncheckedByCategory = SHOPPING_CATEGORIES.map((cat) => ({
    category: cat,
    items: items.filter((i) => i.category === cat && !i.checked),
  })).filter((group) => group.items.length > 0);

  const checkedItems = items.filter((i) => i.checked);

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Shopping</h1>
        {!online && (
          <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <WifiOff className="size-3.5" />
            Offline — changes will sync
          </span>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="mb-4 rounded-xl border border-dashed border-accent/50 bg-accent/10 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Running low?
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => handleAddSuggestion(s)}
                className="flex items-center gap-1 rounded-full border border-accent/40 bg-surface px-3 py-1 text-sm font-medium hover:bg-accent/10"
              >
                <Plus className="size-3.5" />
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleAdd();
        }}
        className="mb-6 flex gap-2"
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add an item…"
          className="flex-1"
        />
        <Button
          type="button"
          variant={isStapleDraft ? "default" : "outline"}
          size="icon"
          onClick={() => setIsStapleDraft((v) => !v)}
          aria-label="Mark as staple"
          title="Staple item (resurfaces when you're running low)"
        >
          <Star className="size-4" fill={isStapleDraft ? "currentColor" : "none"} />
        </Button>
        <Button type="submit" size="icon" aria-label="Add item">
          <Plus className="size-4" />
        </Button>
      </form>

      {items.length === 0 && (
        <EmptyState
          title="Nothing on your list"
          description="Add your first item above — mark it with a star if it's something you buy regularly."
        />
      )}

      <div className="space-y-6">
        {uncheckedByCategory.map((group) => (
          <div key={group.category}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {SHOPPING_CATEGORY_LABELS[group.category]}
            </h2>
            <ul className="space-y-1">
              <AnimatePresence initial={false}>
                {group.items.map((item) => (
                  <ShoppingRow
                    key={item.id}
                    item={item}
                    onToggle={() => handleToggle(item)}
                    onToggleStaple={() => handleToggleStaple(item)}
                    onDelete={() => handleDelete(item)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </div>
        ))}
      </div>

      {checkedItems.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Checked
          </h2>
          <ul className="space-y-1">
            <AnimatePresence initial={false}>
              {checkedItems.map((item) => (
                <ShoppingRow
                  key={item.id}
                  item={item}
                  onToggle={() => handleToggle(item)}
                  onToggleStaple={() => handleToggleStaple(item)}
                  onDelete={() => handleDelete(item)}
                />
              ))}
            </AnimatePresence>
          </ul>

          <Button className="mt-4 w-full" onClick={handleFinishTrip}>
            Finish trip
          </Button>
        </div>
      )}
    </div>
  );
}

function ShoppingRow({
  item,
  onToggle,
  onToggleStaple,
  onDelete,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onToggleStaple: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.18 }}
      className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
    >
      <button
        onClick={onToggle}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          item.checked ? "border-primary bg-primary text-primary-foreground" : "border-border"
        )}
        aria-label={item.checked ? "Uncheck item" : "Check item"}
      >
        {item.checked && <Check className="size-3.5" />}
      </button>
      <span className={cn("flex-1 text-sm", item.checked && "text-muted-foreground line-through")}>
        {item.name}
      </span>
      {item.checked && (
        <span className="text-xs text-muted-foreground">
          {SHOPPING_CATEGORY_LABELS[item.category]}
        </span>
      )}
      <button
        onClick={onToggleStaple}
        className={cn("shrink-0", item.is_staple ? "text-accent" : "text-muted-foreground/40")}
        aria-label="Toggle staple"
        title="Staple item"
      >
        <Star className="size-4" fill={item.is_staple ? "currentColor" : "none"} />
      </button>
      <button
        onClick={onDelete}
        className="shrink-0 text-muted-foreground/40 hover:text-destructive"
        aria-label="Delete item"
      >
        <Trash2 className="size-4" />
      </button>
    </motion.li>
  );
}
