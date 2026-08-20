import Link from "next/link";

import { Panel, PanelHead, PanelEmpty } from "@/components/ui/panel";
import { Micro } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/finance/money";
import type { LedgerEvent } from "@/lib/ledger";

/**
 * What's actually happened today, across every module.
 *
 * The compact half of the Timeline: the same events, today only, capped so it
 * stays a glance rather than becoming the page. It's the one panel on Today
 * that looks backwards — everything else here is about what's still to come.
 */
const MAX_ROWS = 6;

export function TodaySoFar({ events }: { events: LedgerEvent[] }) {
  const shown = events.slice(0, MAX_ROWS);
  const spentCents = events
    .filter((e) => e.kind === "money" && (e.amountCents ?? 0) < 0 && e.currency !== "INR")
    .reduce((n, e) => n + Math.abs(e.amountCents ?? 0), 0);

  return (
    <Panel>
      <PanelHead
        title="Today so far"
        count={spentCents > 0 ? `−${formatCents(spentCents)}` : undefined}
        action={
          <Link href="/timeline" className="micro-sm tap-press text-muted-foreground hover:text-foreground">
            All of it
          </Link>
        }
      />

      {shown.length === 0 ? (
        <PanelEmpty>Nothing logged yet today.</PanelEmpty>
      ) : (
        <ul>
          {shown.map((event, i) => (
            <li key={`${event.kind}-${event.at}-${i}`} className={cn(i > 0 && "border-t border-hairline")}>
              <Link
                href={event.href}
                className="tap-press flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{event.title}</span>
                  {event.detail && <Micro className="block truncate">{event.detail}</Micro>}
                </span>
                {event.amountCents !== undefined && (
                  <span className={cn("shrink-0 text-sm font-bold tabular", event.amountCents > 0 && "text-ok")}>
                    {event.amountCents > 0 ? "+" : "−"}
                    {formatCents(Math.abs(event.amountCents), event.currency)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {events.length > MAX_ROWS && (
        <p className="border-t border-hairline px-3 py-2">
          <Micro>and {events.length - MAX_ROWS} more</Micro>
        </p>
      )}
    </Panel>
  );
}
