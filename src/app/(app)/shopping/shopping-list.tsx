"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Star, Trash2, WifiOff, Check, PartyPopper, Settings2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Panel, PanelHead } from "@/components/ui/panel";
import { PageHeader, HeaderFact } from "@/components/ui/page-header";
import { Micro } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { listItemVariants, LIST_ITEM_TRANSITION } from "@/lib/motion";
import { EmptyState } from "@/components/empty-state";
import { normalizeItemName } from "@/lib/shopping/purchases";
import {
  getSmartStapleSuggestions,
  type ItemPrice,
  type StapleSuggestion,
} from "./price-actions";
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
import { toast } from "@/components/ui/toast";

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine;
}

async function runOnlineFirst(
  mutation: OutboxMutation,
  action: () => Promise<{ error?: string }>
): Promise<{ error?: string; queued?: boolean }> {
  if (isOnline()) {
    try {
      // A returned error means the server looked at the change and refused
      // it — that's permanent, so queueing a retry would be wrong. Hand it
      // back so the caller can undo its optimistic update and say why.
      return await action();
    } catch {
      // A throw means the network dropped it — temporary; queue it for later.
    }
  }
  await enqueueMutation(mutation);
  // Queued is not applied: the caller must not treat this like a confirmed
  // save (e.g. by refreshing from the server, which doesn't know about the
  // change yet). The outbox flush reconciles when it actually lands.
  return { queued: true };
}

export function ShoppingList({
  initialItems,
  initialSuggestions,
  priceBook,
  categories,
  initialKnownItems,
  groceryBudget,
  autoFocusNew = false,
}: {
  initialItems: ShoppingItem[];
  initialSuggestions: StapleSuggestion[];
  priceBook: Record<string, ItemPrice>;
  categories: ShoppingCategoryRow[];
  initialKnownItems: ShoppingCategoryItem[];
  groceryBudget: { remainingCents: number; amountCents: number; spentCents: number } | null;
  /** Set by the `?new=1` link the app-wide quick-add sends here. */
  autoFocusNew?: boolean;
}) {
  // Arriving from the app-wide quick-add should land with the cursor in the
  // box — the whole point of the shortcut is skipping the extra taps.
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocusNew) nameRef.current?.focus();
  }, [autoFocusNew]);
  const [items, setItems] = useState<ShoppingItem[]>(initialItems);
  const [suggestions, setSuggestions] = useState<StapleSuggestion[]>(initialSuggestions);
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

  // The add form's live state, readable inside async error paths where the
  // closure only knows pre-submit values. A failed save must never overwrite
  // anything typed after it was sent.
  const addFormPristineRef = useRef(true);
  useEffect(() => {
    addFormPristineRef.current =
      name === "" && quantity === "" && !categoryTouched && !isStapleDraft;
  });

  const knownItemsMap = useMemo(() => buildKnownItemsMap(knownItems), [knownItems]);

  const refreshFromServer = useCallback(async () => {
    try {
      const [freshItems, freshSuggestions, freshKnown] = await Promise.all([
        getShoppingItems(),
        getSmartStapleSuggestions(),
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

  const syncAndRefresh = useCallback(async () => {
    const result = await flushOutbox();
    if (result.rejected.length > 0) {
      const lines = result.rejected.map((r) => `${r.description} — ${r.reason}`);
      toast.error(
        result.rejected.length === 1
          ? `One change made offline didn't go through: ${lines[0]}`
          : "Some changes made offline didn't go through:",
        result.rejected.length === 1 ? undefined : { description: lines.join(". ") }
      );
    }
    // Only pull the server's list once nothing is left queued — refreshing
    // wipes and rewrites the local cache, so doing it while changes are
    // still waiting to sync would throw those changes away.
    if (!result.failed) refreshFromServer();
  }, [refreshFromServer]);

  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      getCachedItems().then((cached) => {
        if (cached.length > 0) setItems((prev) => (prev.length > 0 ? prev : cached));
      });
    }

    async function handleOnline() {
      setOnline(true);
      await syncAndRefresh();
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    queueMicrotask(() => void syncAndRefresh());

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncAndRefresh]);

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

    const prevKnownItems = knownItems;
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

    const result = await runOnlineFirst(
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
    if (result.error) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (categoryTouched) setKnownItems(prevKnownItems);
      await deleteCachedItem(id);
      // Put the whole form back — but only while it still sits in its
      // post-submit reset state. If he's already typing the next item, his
      // new input wins and only the toast reports the failure.
      if (addFormPristineRef.current) {
        setName(trimmed);
        setCategory(category);
        setCategoryTouched(categoryTouched);
        setIsStapleDraft(isStapleDraft);
        setQuantity(quantity);
      }
      toast.error(result.error);
    }
  }

  async function handleToggle(item: ShoppingItem) {
    const nextChecked = !item.checked;
    const updated = { ...item, checked: nextChecked };
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    await putCachedItem(updated);

    const result = await runOnlineFirst(
      { id: crypto.randomUUID(), type: "setChecked", payload: { id: item.id, checked: nextChecked } },
      () => setChecked({ id: item.id, checked: nextChecked })
    );
    if (result.error) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      await putCachedItem(item);
      toast.error(result.error);
    }
  }

  async function handleToggleStaple(item: ShoppingItem) {
    const updated = { ...item, is_staple: !item.is_staple };
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    await putCachedItem(updated);

    const result = await runOnlineFirst(
      { id: crypto.randomUUID(), type: "setStaple", payload: { id: item.id, isStaple: updated.is_staple } },
      () => setStaple({ id: item.id, isStaple: updated.is_staple })
    );
    if (result.error) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      await putCachedItem(item);
      toast.error(result.error);
    }
  }

  async function handleRecategorize(item: ShoppingItem, categoryId: string) {
    const updated = { ...item, category_id: categoryId };
    const prevKnownItems = knownItems;
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
    const result = await runOnlineFirst(
      { id: crypto.randomUUID(), type: "setCategory", payload: { id: item.id, name: item.name, categoryId } },
      () => setItemCategory({ id: item.id, name: item.name, categoryId })
    );
    if (result.error) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      setKnownItems(prevKnownItems);
      await putCachedItem(item);
      toast.error(result.error);
    }
  }

  async function handleDelete(item: ShoppingItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await deleteCachedItem(item.id);

    const result = await runOnlineFirst(
      { id: crypto.randomUUID(), type: "delete", payload: { id: item.id } },
      () => deleteShoppingItem({ id: item.id })
    );
    if (result.error) {
      setItems((prev) => [...prev, item]);
      await putCachedItem(item);
      toast.error(result.error);
    }
  }

  async function handleAddSuggestion(item: StapleSuggestion) {
    const updated = { ...item, on_list: true, checked: false };
    setSuggestions((prev) => prev.filter((i) => i.id !== item.id));
    setItems((prev) => [...prev, updated]);
    await putCachedItem(updated);

    const result = await runOnlineFirst(
      { id: crypto.randomUUID(), type: "addFromSuggestion", payload: { id: item.id } },
      () => addFromSuggestion({ id: item.id })
    );
    if (result.error) {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setSuggestions((prev) => [...prev, item]);
      await deleteCachedItem(item.id);
      toast.error(result.error);
    }
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

    // Pin down exactly which items this trip covered, so a replay after
    // being offline acts on these rows — not whatever's ticked by then.
    const checkedIds = checkedItems.map((i) => i.id);
    const result = await runOnlineFirst(
      { id: crypto.randomUUID(), type: "finishTrip", payload: { itemIds: checkedIds } },
      () => finishTrip(checkedIds)
    );
    if (result.error) {
      // Put the trip back exactly as it was — items still ticked, still in
      // the cart — and take down the celebration banner, so Alan sees what
      // went wrong and can just press Finish trip again.
      setItems((prev) => [...prev, ...checkedItems]);
      for (const item of checkedItems) await putCachedItem(item);
      setTripToast(null);
      toast.error(result.error);
      return;
    }
    // Only refresh when the trip was actually applied online. If it was
    // queued, the server still has the items on the list — refreshing now
    // would resurrect them; the flush's own refresh reconciles later.
    if (!result.queued) refreshFromServer();
  }

  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const uncheckedByCategory = categories
    .map((cat) => ({
      category: cat,
      items: items.filter((i) => i.category_id === cat.id && !i.checked),
    }))
    .filter((group) => group.items.length > 0);

  const checkedItems = items.filter((i) => i.checked);

  // Computed on the client on purpose: the whole price book already arrived
  // with the page, and this has to keep up with every tick of a checkbox while
  // you're walking round a shop — a server round trip per tick would be
  // useless on shop wifi.
  const basket = useMemo(() => {
    let estimatedCents = 0;
    let known = 0;
    let unknown = 0;
    for (const item of checkedItems) {
      const entry = priceBook[normalizeItemName(item.name)];
      if (entry && entry.typicalCents > 0) {
        estimatedCents += entry.typicalCents;
        known += 1;
      } else {
        unknown += 1;
      }
    }
    return { estimatedCents, known, unknown };
  }, [checkedItems, priceBook]);

  const uncheckedCount = items.filter((i) => !i.checked).length;
  const budgetProgress =
    groceryBudget && groceryBudget.amountCents > 0
      ? groceryBudget.spentCents / groceryBudget.amountCents
      : null;

  return (
    <div>
      <PageHeader
        eyebrow="The list and your staples"
        title="Shopping"
        meta={
          <>
            <HeaderFact>{uncheckedCount} to get</HeaderFact>
            {checkedItems.length > 0 && (
              <HeaderFact>{checkedItems.length} in the cart</HeaderFact>
            )}
            {!online && (
              <HeaderFact tone="alert">
                <span className="inline-flex items-center gap-1">
                  <WifiOff className="size-3" />
                  Offline — will sync
                </span>
              </HeaderFact>
            )}
          </>
        }
        actions={
          <Link
            href="/settings/shopping"
            aria-label="Manage categories"
            className="tap-press flex size-9 items-center justify-center border-2 border-rule bg-surface transition-colors hover:bg-muted"
          >
            <Settings2 className="size-4" strokeWidth={2.5} />
          </Link>
        }
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        {/* The Shopping↔Money hook, as a real gauge rather than a caption.
            This is the number that changes what goes in the basket, so it
            gets the meter treatment and links straight into Money. */}
        {/* What's in the basket, before the till. Estimated from what these
            items have cost you before (shopping_purchases), so it needs no
            network round trip while you're standing in a shop — and it's
            labelled an estimate, because prices move. */}
        {basket.known > 0 && (
          <div
            className={cn(
              "border-2 px-3 py-2.5",
              groceryBudget && basket.estimatedCents > groceryBudget.remainingCents
                ? "border-warn bg-warn/10"
                : "border-rule bg-surface"
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="micro-sm text-muted-foreground">In the basket</span>
              <span className="stat text-xl">~{formatCents(basket.estimatedCents)}</span>
            </div>
            <Micro className="mt-0.5 block">
              estimated from what you usually pay
              {basket.unknown > 0 && ` · ${basket.unknown} not priced yet`}
              {groceryBudget && basket.estimatedCents > groceryBudget.remainingCents
                ? " · over what's left in the budget"
                : ""}
            </Micro>
          </div>
        )}

        {groceryBudget && (
          <Link href="/money" className="tap-press block">
            <div className="border-2 border-rule bg-surface p-3 transition-colors hover:bg-muted">
              <div className="flex items-baseline justify-between gap-3">
                <span className="micro-sm text-muted-foreground">Groceries budget</span>
                <span className="micro-sm tabular text-muted-foreground">
                  {formatCents(groceryBudget.spentCents)} of{" "}
                  {formatCents(groceryBudget.amountCents)}
                </span>
              </div>
              <p
                className={cn(
                  "stat mt-1 text-2xl",
                  groceryBudget.remainingCents < 0 && "text-destructive"
                )}
              >
                {formatCents(groceryBudget.remainingCents)}
                <span className="micro-sm ml-1.5 text-muted-foreground">left</span>
              </p>
              {budgetProgress !== null && (
                <div className="mt-2 h-2 border border-rule">
                  <div
                    className={cn(
                      "h-full",
                      budgetProgress > 1
                        ? "bg-destructive"
                        : budgetProgress > 0.8
                          ? "bg-warn"
                          : "bg-primary"
                    )}
                    style={{ width: `${Math.min(100, budgetProgress * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </Link>
        )}

        <AnimatePresence>
          {tripToast && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-2 border-2 border-rule bg-foreground px-3 py-2.5 text-sm font-semibold text-background"
            >
              <PartyPopper className="size-4 shrink-0" />
              {tripToast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------------- Add item ---------------- */}
        <Panel>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAdd();
            }}
          >
            <div className="flex items-stretch border-b-2 border-rule">
              <Input
                ref={nameRef}
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Add an item…"
                aria-label="New item"
                className="h-11 flex-1 border-0 border-r-2 border-rule focus-visible:border-rule"
              />
              <button
                type="button"
                onClick={() => setIsStapleDraft((v) => !v)}
                aria-label="Mark as a staple"
                aria-pressed={isStapleDraft}
                title="Staple item (resurfaces when you're running low)"
                className={cn(
                  "tap-press flex w-12 shrink-0 items-center justify-center border-r-2 border-rule transition-colors",
                  isStapleDraft
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Star className="size-4" fill={isStapleDraft ? "currentColor" : "none"} />
              </button>
              <button
                type="submit"
                aria-label="Add item"
                className="tap-press tap-target flex w-12 shrink-0 items-center justify-center bg-primary text-primary-foreground transition-colors hover:brightness-95"
              >
                <Plus className="size-5" strokeWidth={3} />
              </button>
            </div>

            <div className="flex items-stretch">
              <Select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setCategoryTouched(true);
                }}
                className="h-10 flex-1 border-0 border-r-2 border-rule text-xs focus-visible:border-rule"
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
                aria-label="Quantity"
                className="h-10 w-16 shrink-0 border-0 border-r-2 border-rule text-center text-xs focus-visible:border-rule"
              />
              <Select
                value={quantityUnit}
                onChange={(e) => setQuantityUnit(e.target.value as ShoppingUnit)}
                className="h-10 w-24 shrink-0 border-0 text-xs focus-visible:border-rule"
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
        </Panel>

        {/* ---------------- Running-low staples ---------------- */}
        {suggestions.length > 0 && (
          <Panel className="border-accent">
            <PanelHead title="Running low?" count={suggestions.length} />
            <div className="flex flex-wrap gap-2 p-3">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleAddSuggestion(s)}
                  className="tap-press flex items-center gap-1.5 border-2 border-rule bg-surface px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-foreground hover:text-background"
                >
                  <Plus className="size-3.5" strokeWidth={3} />
                  {s.name}
                </button>
              ))}
            </div>
          </Panel>
        )}

        {/* ---------------- The list, by aisle ---------------- */}
        {items.length === 0 ? (
          <EmptyState
            title="Nothing on your list"
            description="Add your first item above — star it if it's something you buy regularly."
            icon={<ShoppingIllustration className="size-8" />}
          />
        ) : (
          uncheckedByCategory.map((group) => (
            <Panel key={group.category.id}>
              <PanelHead
                title={
                  <span className="flex items-center gap-2">
                    {createElement(getShoppingIcon(group.category.icon), {
                      className: "size-3.5",
                    })}
                    {group.category.name}
                  </span>
                }
                count={group.items.length}
              />
              <ul>
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
            </Panel>
          ))
        )}

        {/* ---------------- In the cart ---------------- */}
        {checkedItems.length > 0 && (
          <Panel>
            <PanelHead title="In the cart" count={checkedItems.length} />
            <ul>
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
            <div className="border-t-2 border-rule p-3">
              <Button block size="lg" variant="invert" onClick={handleFinishTrip}>
                Finish trip
              </Button>
            </div>
          </Panel>
        )}
      </div>
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
      variants={listItemVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={LIST_ITEM_TRANSITION}
      className={cn(
        "flex items-center gap-2 border-b border-hairline px-3 py-2.5 last:border-b-0",
        item.checked && "bg-muted/40"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "tap-press flex size-5 shrink-0 items-center justify-center border-2 border-rule transition-colors",
          item.checked && "bg-foreground text-background"
        )}
        aria-label={item.checked ? `Uncheck ${item.name}` : `Check ${item.name}`}
      >
        {item.checked && <Check className="size-3" strokeWidth={3} />}
      </button>

      <span
        className={cn(
          "min-w-0 flex-1 text-sm",
          item.checked && "text-muted-foreground line-through"
        )}
      >
        {item.name}
        {item.quantity !== null && item.quantity_unit !== null && (
          <span className="micro-sm ml-2 text-muted-foreground">
            {item.quantity} {SHOPPING_UNIT_LABELS[item.quantity_unit]}
          </span>
        )}
      </span>

      {item.checked && categoryLabel && <Micro className="shrink-0">{categoryLabel}</Micro>}

      {/* Deliberately the raw element rather than the Select primitive: this
          is an ultra-compact inline per-row picker, and the primitive's ruled
          chevron cell would dominate a row this size. */}
      {!item.checked && (
        <select
          value={item.category_id}
          onChange={(e) => onRecategorize(e.target.value)}
          className="micro-sm h-7 max-w-24 shrink-0 border border-hairline bg-transparent px-1 text-muted-foreground"
          aria-label={`Category for ${item.name}`}
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        onClick={onToggleStaple}
        className={cn(
          "tap-press shrink-0 transition-colors",
          item.is_staple ? "text-accent" : "text-muted-foreground/50 hover:text-foreground"
        )}
        aria-label={item.is_staple ? `${item.name} is a staple` : `Make ${item.name} a staple`}
        title="Staple item"
      >
        <Star className="size-4" fill={item.is_staple ? "currentColor" : "none"} />
      </button>

      <button
        type="button"
        onClick={onDelete}
        className="tap-press tap-target shrink-0 text-muted-foreground/50 transition-colors hover:text-destructive"
        aria-label={`Delete ${item.name}`}
      >
        <Trash2 className="size-4" />
      </button>
    </motion.li>
  );
}
