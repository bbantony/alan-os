"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { fadeInUpVariants } from "@/lib/motion";
import { Panel, PanelHead, PanelEmpty } from "@/components/ui/panel";
import { toast } from "@/components/ui/toast";
import { setChecked } from "@/app/(app)/shopping/actions";
import { SHOPPING_UNIT_LABELS, type ShoppingItem } from "@/lib/shopping/types";

/** How many items the dashboard shows before handing off to the full list. */
const VISIBLE_LIMIT = 5;

/**
 * The shopping list, tickable from the dashboard.
 *
 * Today already knew how many things were on the list — the numbers strip has
 * shown the count since the console rebuild — but a count is something to look
 * at, not something to use. Standing in a shop, the thing worth having on the
 * first screen is the items themselves with a box next to each one.
 *
 * Deliberately short. This is a reminder of what's left, not a replacement for
 * the Shopping screen: that one has categories, prices, staples, quantities,
 * a budget line and an offline outbox, and none of that belongs on a
 * dashboard. Anything past the top handful is one tap away.
 */
export function ShoppingPanel({ items }: { items: ShoppingItem[] }) {
  const router = useRouter();
  // Ticked here, this render only. The server is the truth — this exists so
  // the box fills the instant it's tapped instead of after a round trip.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const visible = items.slice(0, VISIBLE_LIMIT);
  const remaining = items.length - visible.length;
  // done/total, the same direction as the console panel's counter directly
  // above it — two counters on one screen reading opposite ways is a puzzle.
  const doneCount = items.filter((i) => checkedIds.has(i.id)).length;

  // Optimistic, then persisted, then rolled back if the server says no — the
  // same shape as `handleToggle` in shopping-list.tsx and `toggleTask` in
  // today-console.tsx. A tick that silently didn't save is worse than a slow
  // one, because the item is still missing from the trolley either way.
  async function handleToggle(item: ShoppingItem) {
    const willBeChecked = !checkedIds.has(item.id);
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (willBeChecked) next.add(item.id);
      else next.delete(item.id);
      return next;
    });

    /** Puts this one box back the way it was. Used by both failure paths. */
    function undoTick() {
      setCheckedIds((prev) => {
        const next = new Set(prev);
        if (willBeChecked) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
    }

    // A dropped connection, a 500, or anything thrown server-side REJECTS this
    // call — it only ever comes back as `{ error }` when the database itself
    // refuses. Without the try/catch the box stayed ticked, nothing was saved
    // and nothing was said, which is exactly how you walk out of a shop
    // without the milk. Same shape as `toggleTask` in today-console.tsx and
    // `handleSnooze` in plan/nudge-panel.tsx.
    let result: Awaited<ReturnType<typeof setChecked>>;
    try {
      result = await setChecked({ id: item.id, checked: willBeChecked });
    } catch {
      undoTick();
      toast.error("Couldn't save that — check your connection and try again.");
      return;
    }

    if (result.error) {
      undoTick();
      toast.error(result.error);
      return;
    }

    // The saved tick has to reach the numbers strip above, which is rendered
    // on the server and would otherwise keep the count it was born with — tick
    // two of four here and the strip would still say four for the rest of the
    // session. Refreshing from the panel rather than revalidating inside
    // `setChecked` keeps this to the one screen with the problem: that action
    // is called far more often from the Shopping screen, which owns its own
    // list and offline queue and does not want a server round trip per tick.
    router.refresh();
  }

  return (
    <motion.div variants={fadeInUpVariants}>
      <Panel>
        <PanelHead
          title="Shopping"
          count={items.length > 0 ? `${doneCount}/${items.length}` : undefined}
          action={
            <Link
              href="/shopping"
              className="micro-sm flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              All
              <ArrowRight className="size-3" />
            </Link>
          }
        />

        {items.length === 0 ? (
          <PanelEmpty
            action={
              <Link
                href="/shopping"
                className="micro-sm flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                Open shopping
                <ArrowRight className="size-3" />
              </Link>
            }
          >
            Nothing left to buy.
          </PanelEmpty>
        ) : (
          <ul>
            {visible.map((item, i) => {
              const done = checkedIds.has(item.id);
              return (
                <li
                  key={item.id}
                  className={cn(
                    // 44px floor on the whole row, as a MIN-HEIGHT IN REM
                    // rather than `h-11`: Tailwind's spacing scale is
                    // multiplied by --density-scale, so h-11 quietly becomes
                    // 38px on the compact density — and a touch floor that
                    // shrinks isn't a floor. `items-stretch` then hands that
                    // full height to the tick button beside the name. Same
                    // reasoning as the controls in plan/nudge-panel.tsx.
                    "flex min-h-[2.75rem] items-stretch",
                    (i < visible.length - 1 || remaining > 0) && "border-b border-hairline",
                    done && "bg-muted/30"
                  )}
                >
                  {/* Its own hit target, so ticking something off can never
                      navigate away by accident — the rule FlowRow follows on
                      the console panel above. */}
                  <button
                    type="button"
                    aria-label={done ? `Uncheck ${item.name}` : `Check ${item.name}`}
                    aria-pressed={done}
                    onClick={() => handleToggle(item)}
                    className="tap-press flex shrink-0 items-center px-3 transition-colors hover:bg-muted"
                  >
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center border-2 border-rule transition-colors",
                        done && "bg-foreground text-background"
                      )}
                    >
                      {done && <Check className="size-3" strokeWidth={3} />}
                    </span>
                  </button>

                  <span
                    className={cn(
                      "flex min-w-0 flex-1 items-center py-2 pr-3 text-sm",
                      done && "text-muted-foreground line-through"
                    )}
                  >
                    {/* Inner wrapper so the name and its quantity still flow as
                        one sentence: the cell itself is a flex box only so the
                        text sits centred in the 44px row. */}
                    <span className="min-w-0">
                      {item.name}
                      {item.quantity !== null && item.quantity_unit !== null && (
                        <span className="micro-sm ml-2 text-muted-foreground">
                          {item.quantity} {SHOPPING_UNIT_LABELS[item.quantity_unit]}
                        </span>
                      )}
                    </span>
                  </span>
                </li>
              );
            })}

            {remaining > 0 && (
              <li>
                <Link
                  href="/shopping"
                  className="tap-press flex min-h-[2.75rem] items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted"
                >
                  <span className="micro-sm text-muted-foreground">
                    {remaining} more on the list
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2.5} />
                </Link>
              </li>
            )}
          </ul>
        )}
      </Panel>
    </motion.div>
  );
}
