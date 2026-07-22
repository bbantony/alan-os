"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getShoppingIcon, AVAILABLE_SHOPPING_ICON_NAMES } from "@/lib/shopping/icon-registry";
import type { ShoppingCategoryItem, ShoppingCategoryRow } from "@/lib/shopping/types";
import {
  createShoppingCategory,
  renameShoppingCategory,
  deleteShoppingCategory,
  addKnownItem,
  removeKnownItem,
} from "@/app/(app)/shopping/actions";

export function ShoppingSettings({
  initialCategories,
  initialKnownItems,
}: {
  initialCategories: ShoppingCategoryRow[];
  initialKnownItems: ShoppingCategoryItem[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [knownItems, setKnownItems] = useState(initialKnownItems);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState(AVAILABLE_SHOPPING_ICON_NAMES[0]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isPending, startTransition] = useTransition();

  function itemsFor(categoryId: string) {
    return knownItems.filter((k) => k.category_id === categoryId);
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    setNewCategoryName("");
    startTransition(async () => {
      await createShoppingCategory({ name, icon: newCategoryIcon });
      setCategories((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          user_id: "",
          name,
          icon: newCategoryIcon,
          sort_order: prev.length,
          is_protected: false,
          created_at: new Date().toISOString(),
        },
      ]);
    });
  }

  function handleStartRename(cat: ShoppingCategoryRow) {
    setRenamingId(cat.id);
    setRenameValue(cat.name);
  }

  function handleSaveRename(id: string) {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    startTransition(async () => {
      await renameShoppingCategory({ id, name });
    });
  }

  function handleDeleteCategory(id: string) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    startTransition(async () => {
      await deleteShoppingCategory({ id });
    });
  }

  function handleAddKnownItem(categoryId: string) {
    const name = newItemName.trim();
    if (!name) return;
    setNewItemName("");
    setKnownItems((prev) => [
      ...prev.filter((k) => k.item_name.toLowerCase() !== name.toLowerCase()),
      {
        id: crypto.randomUUID(),
        user_id: "",
        category_id: categoryId,
        item_name: name,
        created_at: new Date().toISOString(),
      },
    ]);
    startTransition(async () => {
      await addKnownItem({ categoryId, itemName: name });
    });
  }

  function handleRemoveKnownItem(id: string) {
    setKnownItems((prev) => prev.filter((k) => k.id !== id));
    startTransition(async () => {
      await removeKnownItem({ id });
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Categories are yours to shape — rename, remove, or add new ones. Each
        category can also remember specific item names, so once something&apos;s
        categorized correctly it stays that way.
      </p>

      <ul className="space-y-2">
        {categories.map((cat) => {
          const Icon = getShoppingIcon(cat.icon);
          const items = itemsFor(cat.id);
          const isExpanded = expanded === cat.id;
          return (
            <li key={cat.id} className="rounded-xl border border-border bg-surface">
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  onClick={() => setExpanded(isExpanded ? null : cat.id)}
                  className="tap-press flex flex-1 items-center gap-2 text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  )}
                  <Icon className="size-4 text-primary" />
                  {renamingId === cat.id ? (
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleSaveRename(cat.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveRename(cat.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-7 max-w-40"
                    />
                  ) : (
                    <span
                      className="text-sm font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartRename(cat);
                      }}
                    >
                      {cat.name}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {items.length > 0 && `${items.length} known item${items.length > 1 ? "s" : ""}`}
                  </span>
                </button>
                {!cat.is_protected && (
                  <button
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="tap-press shrink-0 text-muted-foreground/40 hover:text-destructive"
                    aria-label="Delete category"
                    disabled={isPending}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>

              {isExpanded && (
                <div className="space-y-2 border-t border-border p-3">
                  <div className="flex flex-wrap gap-2">
                    {items.map((item) => (
                      <span
                        key={item.id}
                        className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
                      >
                        {item.item_name}
                        <button
                          onClick={() => handleRemoveKnownItem(item.id)}
                          aria-label={`Remove ${item.item_name}`}
                          className="tap-press"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                    {items.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        No known items yet — they get added automatically when
                        you correct an item&apos;s category, or add one below.
                      </span>
                    )}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddKnownItem(cat.id);
                    }}
                    className="flex gap-2"
                  >
                    <Input
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder="Add a known item…"
                      className="h-7 flex-1 text-xs"
                    />
                    <Button type="submit" size="icon-sm">
                      <Plus className="size-3.5" />
                    </Button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <form onSubmit={handleAddCategory} className="flex gap-2 border-t border-border pt-4">
        <Input
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="New category name…"
          className="flex-1"
        />
        <select
          value={newCategoryIcon}
          onChange={(e) => setNewCategoryIcon(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          aria-label="Icon"
        >
          {AVAILABLE_SHOPPING_ICON_NAMES.map((iconName) => (
            <option key={iconName} value={iconName}>
              {iconName}
            </option>
          ))}
        </select>
        <Button type="submit" size="icon">
          <Plus className="size-4" />
        </Button>
      </form>
    </div>
  );
}
