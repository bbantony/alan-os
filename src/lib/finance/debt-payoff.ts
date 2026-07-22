export interface DebtInput {
  id: string;
  balanceCents: number;
  aprPct: number;
  minPaymentCents: number;
}

export interface PayoffResult {
  monthsToPayoff: number;
  totalInterestPaidCents: number;
  payoffOrder: string[];
}

const MAX_MONTHS = 600; // 50-year safety cap so a too-small payment can't loop forever

// Simple amortization simulation, month by month: interest accrues on each
// debt's remaining balance, minimums are paid on everything, and any extra
// beyond minimums goes entirely to whichever debt is first in the strategy's
// order (avalanche = highest APR first, snowball = smallest balance first) —
// once that debt is paid off, the next month's extra rolls to the new first
// debt in the (re-evaluated) order automatically, since remaining balances
// change every month.
function simulate(debts: DebtInput[], extraMonthlyCents: number, strategy: "avalanche" | "snowball"): PayoffResult {
  const working = debts.map((d) => ({ ...d, remaining: d.balanceCents }));
  let months = 0;
  let totalInterest = 0;
  const payoffOrder: string[] = [];

  while (working.some((d) => d.remaining > 0) && months < MAX_MONTHS) {
    months += 1;

    for (const d of working) {
      if (d.remaining <= 0) continue;
      const monthlyRate = d.aprPct / 100 / 12;
      const interest = Math.round(d.remaining * monthlyRate);
      totalInterest += interest;
      d.remaining += interest;
    }

    const order = [...working]
      .filter((d) => d.remaining > 0)
      .sort((a, b) => (strategy === "avalanche" ? b.aprPct - a.aprPct : a.remaining - b.remaining));

    let extra = extraMonthlyCents;
    for (const d of order) {
      let payment = Math.min(d.minPaymentCents, d.remaining);
      if (extra > 0) {
        const bonus = Math.min(extra, d.remaining - payment);
        payment += bonus;
        extra -= bonus;
      }
      d.remaining -= payment;
      if (d.remaining <= 0 && !payoffOrder.includes(d.id)) payoffOrder.push(d.id);
    }
  }

  return { monthsToPayoff: months, totalInterestPaidCents: totalInterest, payoffOrder };
}

export function projectPayoff(
  debts: DebtInput[],
  extraMonthlyCents: number
): { avalanche: PayoffResult; snowball: PayoffResult } {
  return {
    avalanche: simulate(debts, extraMonthlyCents, "avalanche"),
    snowball: simulate(debts, extraMonthlyCents, "snowball"),
  };
}
