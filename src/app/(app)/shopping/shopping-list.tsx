"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Star, Trash2, WifiOff, Check, PartyPopper } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { ShoppingIllustration } from "@/components/illustrations";
import { getShoppingIcon } from "@/lib/shopping/icon-registry";
import { formatCents } from "@/lib/finance/money";
import {
  SHOPPING_UNITS,
  SHOPPING_UNIT_LABELS,
  type ShoppingCategoryItem,
  type ShoppingCategoryRow,
  type ShoppingItem,
  type ShoppingUnit,
} from "@/lib/shopping/types";
import { buildKnownItemsMap, guessCategoryId } from "@/lib/shopping/category-guess";
import {
  getShoppingItems,
  getStapleSuggestions,
  getKnownItems,
  addShoppingItem,
  setChecked,
  setStaple,
  setItemCategory,
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
  categories,
  initialKnownItems,
  groceryBudget,
}: {
  initialItems: ShoppingItem[];
  initialSuggestions: ShoppingItem[];
  categories: ShoppingCategoryRow[];
  initialKnownItems: ShoppingCategoryItem[];
  groceryBudget: { remainingCents: number; amountCents: number; spentCents: number } | null;
}) {
  const [items, setItems] = useState<ShoppingItem[]>(initialItems);
  const [suggestions, setSuggestions] = useState<ShoppingItem[]>(initialSuggestions);
  const [knownItems, setKnownItems] = useState<ShoppingCategoryItem[]>(initialKnownItems);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [name, setName] = useState("");
  const otherCategoryId = categories.find((c) => c.is_protected)?.id ?? categories[0]?.id ?? "";
  const [category, setCategory] = useState<string>(otherCategoryId);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [isStapleDraft, setIsStapleDraft] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [quantityUnit, setQuantityUnit] = useState<ShoppingUnit>("count");
  const [tripToast, setTripToast] = useState<string | null>(null);
  const hydrated = useRef(false);

  const knownItemsMap = useMemo(() => buildKnownItemsMap(knownItems), [knownItems]);

  const refreshFromServer = useCallback(async () => {
    try {
      const [freshItems, freshSuggestions, freshKnown] = await Promise.all([
        getShoppingItems(),
        getStapleSuggestions(),
        getKnownItems(),
      ]);
      setItems(freshItems);
      setSuggestions(freshSuggestions);
      setKnownItems(freshKnown);
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
      await flushOutbox();
      refreshFromServer();
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

  function handleNameChange(value: string) {
    setName(value);
    if (!categoryTouched) {
      setCategory(guessCategoryId(value, categories, knownItemsMap) ?? otherCategoryId);
    }
  }

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = crypto.randomUUID();
    const parsedQuantity = quantity.trim() ? Number(quantity) : null;
    const finalQuantityUnit = parsedQuantity !== null ? quantityUnit : null;

    const item: ShoppingItem = {
      id,
      user_id: "",
      name: trimmed,
      category_id: category,
      is_staple: isStapleDraft,
      checked: false,
      on_list: true,
      quantity: parsedQuantity,
      quantity_unit: finalQuantityUnit,
      last_purchased_at: null,
      created_at: new Date().toISOString(),
    };

    setItems((prev) => [...prev, item]);
    if (categoryTouched) {
      setKnownItems((prev) => [
        ...prev.filter((k) => k.item_name.toLowerCase() !== trimmed.toLowerCase()),
        {
          id: crypto.randomUUID(),
          user_id: "",
          category_id: category,
          item_name: trimmed,
          created_at: new Date().toISOString(),
        },
      ]);
    }
    setName("");
    setCategory(otherCategoryId);
    setCategoryTouched(false);
    setIsStapleDraft(false);
    setQuantity("");
    await putCachedItem(item);

    await runOnlineFirst(
      {
        id: crypto.randomUUID(),
        type: "add",
        payload: {
          id,
          name: trimmed,
          categoryId: category,
          isStaple: isStapleDraft,
          quantity: parsedQuantity,
          quantityUnit: finalQuantityUnit,
          learnCategory: categoryTouched,
        },
      },
      () =>
        addShoppingItem({
          id,
          name: trimmed,
          categoryId: category,
          isStaple: isStapleDraft,
          quantity: parsedQuantity,
          quantityUnit: finalQuantityUnit,
          learnCategory: categoryTouched,
        })
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

  async function handleRecategorize(item: ShoppingItem, categoryId: string) {
    const updated = { ...item, category_id: categoryId };
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    setKnownItems((prev) => [
      ...prev.filter((k) => k.item_name.toLowerCase() !== item.name.toLowerCase()),
      {
        id: crypto.randomUUID(),
        user_id: "",
        category_id: categoryId,
        item_name: item.name,
        created_at: new Date().toISOString(),
      },
    ]);
    await putCachedItem(updated);
    await runOnlineFirst(
      { id: crypto.randomUUID(), type: "setCategory", payload: { id: item.id, name: item.name, categoryId } },
      () => setItemCategory({ id: item.id, name: item.name, categoryId })
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

    const staples = checkedItems.filter((i) => i.is_staple).length;
    const oneOff = checkedItems.filter((i) => !i.is_staple).length;

    for (const item of checkedItems) {
      await deleteCachedItem(item.id);
    }
    setItems((prev) => prev.filter((i) => !i.checked));

    const parts = [];
    if (oneOff > 0) parts.push(`${oneOff} cleared`);
    if (staples > 0) parts.push(`${staples} staple${staples > 1 ? "s" : ""} will resurface later`);
    setTripToast(`Trip finished — ${parts.join(", ")}.`);
    setTimeout(() => setTripToast(null), 5000);

    await runOnlineFirst(
      { id: crypto.randomUUID(), type: "finishTrip", payload: {} },
      () => finishTrip()
    );
    refreshFromServer();
  }

  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const uncheckedByCategory = categories
    .map((cat) => ({
      category: cat,
      items: items.filter((i) => i.category_id === cat.id && !i.checked),
    }))
    .filter((group) => group.items.length > 0);

  const checkedItems = items.filter((i) => i.checked);

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Shopping</h1>
        <div className="flex items-center gap-2">
          {!online && (
            <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <WifiOff className="size-3.5" />
              Offline — changes will sync
            </span>
          )}
          <Link
            href="/settings/shopping"
            className="text-xs font-medium text-muted-foreground underline underline-offset-2"
          >
            Manage categories
          </Link>
        </div>
      </div>

      {groceryBudget && (
        <Link
          href="/money"
          className="tap-press mb-4 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
        >
          <span className="text-muted-foreground">Groceries budget</span>
          <span className="tabular font-medium text-primary">{formatCents(groceryBudget.remainingCents)} left</span>
        </Link>
      )}

      <AnimatePresence>
        {tripToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary"
          >
            <PartyPopper className="size-4 shrink-0" />
            {tripToast}
          </motion.div>
        )}
      </AnimatePresence>

      {suggestions.length > 0 && (
        <div className="mb-4 rounded-xl border border-dashed border-accent/50 bg-accent/10 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Running low?</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.id}
                onClick={() => handleAddSuggestion(s)}
                className="tap-press flex items-center gap-1 rounded-full border border-accent/40 bg-surface px-3 py-1 text-sm font-medium hover:bg-accent/10"
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
        className="mb-6 space-y-2"
      >
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
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
        </div>
        <div className="flex gap-2">
          <Select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setCategoryTouched(true);
            }}
            className="h-8 flex-1"
            aria-label="Category"
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Qty"
            className="w-20"
          />
          <Select
            value={quantityUnit}
            onChange={(e) => setQuantityUnit(e.target.value as ShoppingUnit)}
            className="h-8 w-20"
            aria-label="Unit"
          >
            {SHOPPING_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {SHOPPING_UNIT_LABELS[unit]}
              </option>
            ))}
          </Select>
        </div>
      </form>

      {items.length === 0 && (
        <EmptyState
          title="Nothing on your list"
          description="Add your first item above — mark it with a star if it's something you buy regularly."
          icon={<ShoppingIllustration className="size-8" />}
        />
      )}

      <div className="space-y-6">
        {uncheckedByCategory.map((group) => {
          const Icon = getShoppingIcon(group.category.icon);
          return (
            <div key={group.category.id}>
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Icon className="size-3.5" />
                {group.category.name}
              </h2>
              <ul className="space-y-1">
                <AnimatePresence initial={false}>
                  {group.items.map((item) => (
                    <ShoppingRow
                      key={item.id}
                      item={item}
                      categories={categories}
                      onToggle={() => handleToggle(item)}
                      onToggleStaple={() => handleToggleStaple(item)}
                      onDelete={() => handleDelete(item)}
                      onRecategorize={(categoryId) => handleRecategorize(item, categoryId)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          );
        })}
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
                  categories={categories}
                  categoryLabel={categoriesById.get(item.category_id)?.name}
                  onToggle={() => handleToggle(item)}
                  onToggleStaple={() => handleToggleStaple(item)}
                  onDelete={() => handleDelete(item)}
                  onRecategorize={(categoryId) => handleRecategorize(item, categoryId)}
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
  categories,
  categoryLabel,
  onToggle,
  onToggleStaple,
  onDelete,
  onRecategorize,
}: {
  item: ShoppingItem;
  categories: ShoppingCategoryRow[];
  categoryLabel?: string;
  onToggle: () => void;
  onToggleStaple: () => void;
  onDelete: () => void;
  onRecategorize: (categoryId: string) => void;
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
          "tap-press flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          item.checked ? "border-primary bg-primary text-primary-foreground" : "border-border"
        )}
        aria-label={item.checked ? "Uncheck item" : "Check item"}
      >
        {item.checked && <Check className="size-3.5" />}
      </button>
      <span className={cn("flex-1 text-sm", item.checked && "text-muted-foreground line-through")}>
        {item.name}
        {item.quantity !== null && item.quantity_unit !== null && (
          <span className="ml-1.5 text-xs text-muted-foreground">
            {item.quantity} {SHOPPING_UNIT_LABELS[item.quantity_unit]}
          </span>
        )}
      </span>
      {item.checked && categoryLabel && (
        <span className="text-xs text-muted-foreground">{categoryLabel}</span>
      )}
      {!item.checked && (
        <select
          value={item.category_id}
          onChange={(e) => onRecategorize(e.target.value)}
          className="h-6 max-w-24 rounded-md border border-input bg-transparent px-1 text-xs"
          aria-label="Category"
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={onToggleStaple}
        className={cn("tap-press shrink-0", item.is_staple ? "text-accent" : "text-muted-foreground/40")}
        aria-label="Toggle staple"
        title="Staple item"
      >
        <Star className="size-4" fill={item.is_staple ? "currentColor" : "none"} />
      </button>
      <button
        onClick={onDelete}
        className="tap-press shrink-0 text-muted-foreground/40 hover:text-destructive"
        aria-label="Delete item"
      >
        <Trash2 className="size-4" />
      </button>
    </motion.li>
  );
}
