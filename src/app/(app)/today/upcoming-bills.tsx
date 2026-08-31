import Link from "next/link";

import { Panel, PanelHead } from "@/components/ui/panel";
import { Micro } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/finance/money";
import type { UpcomingBill } from "@/app/(app)/money/recurring-actions";

/**
 * What's about to leave your account, before it leaves.
 *
 * The whole value is in the last line: safe-to-spend *after* these land. A
 * number that says $400 while $1,450 of rent goes out on Tuesday isn't wrong
 * exactly, but it answers the wrong question — and it's the question people
 * actually ask a budgeting app before buying something.
 */
export function UpcomingBills({
  bills,
  safeToSpendCents,
}: {
  bills: UpcomingBill[];
  safeToSpendCents: number;
}) {
  if (bills.length === 0) return null;

  // CAD only. `safeToSpendCents` is a CAD figure, and this used to add every
  // bill's raw `amountCents` to it regardless of currency — so a Rs.5,000
  // remittance subtracted $50 from safe-to-spend. Each ROW below has always
  // formatted with its own currency; only this total was wrong.
  const cadBills = bills.filter((b) => b.currency === "CAD");
  const net = cadBills.reduce(
    (sum, b) => sum + (b.isIncome ? b.amountCents : -b.amountCents),
    0
  );
  const after = safeToSpendCents + net;
  const hasOtherCurrency = cadBills.length !== bills.length;

  function whenLabel(bill: UpcomingBill): string {
    if (bill.daysAway === 0) return "today";
    if (bill.daysAway === 1) return "tomorrow";
    return `in ${bill.daysAway} days`;
  }

  return (
    <Panel>
      <PanelHead title="About to land" count={bills.length} />

      <ul>
        {bills.map((bill, i) => (
          <li key={bill.id} className={cn(i > 0 && "border-t border-hairline")}>
            <Link
              href="/money"
              className="tap-press flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{bill.name}</span>
                <Micro className="block">{whenLabel(bill)}</Micro>
              </span>
              <span
                className={cn("shrink-0 text-sm font-bold tabular", bill.isIncome && "text-ok")}
              >
                {bill.isIncome ? "+" : "−"}
                {formatCents(bill.amountCents, bill.currency)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div
        className={cn(
          "flex items-center justify-between gap-3 border-t-2 border-rule px-3 py-2.5",
          after < 0 ? "bg-destructive text-destructive-foreground" : "bg-muted/50"
        )}
      >
        <span className="micro-sm">
          Safe to spend after these
          {hasOtherCurrency && " (CAD only)"}
        </span>
        <span className="stat text-lg">{formatCents(after)}</span>
      </div>
    </Panel>
  );
}
