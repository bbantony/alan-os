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
  /**
   * True when the simulation hit MAX_MONTHS with debt still outstanding —
   * i.e. the minimums do not cover the interest and this plan never finishes.
   *
   * The caller MUST check this before rendering `totalInterestPaidCents`. That
   * figure is then just whatever accrued over 50 years, and the debts screen
   * was printing it as fact: $10,000 at 24% paying $10/month rendered as
   * "Interest paid $1,373,494,258.53" beside a correct "600+ mo".
   */
  neverPaysOff: boolean;
}

const MAX_MONTHS = 600; // 50-year safety cap so a too-small payment can't loop forever

// Simple amortization simulation, month by month: interest accrues on each
// debt's remaining balance, minimums are paid on everything, and any extra
// beyond minimums goes entirely to whichever debt is first in the strategy's
// order (avalanche = highest APR first, snowball = smallest balance first).
// Once a debt is cleared, BOTH its share of the extra and its own freed-up
// minimum payment roll onto the next debt in the re-evaluated order — that
// rolling is what makes avalanche and snowball different plans at all.
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

    // THE SNOWBALL, which was missing entirely. When a debt is cleared its
    // minimum payment does not stop — it rolls onto the next debt in the
    // chosen order. Without this the two strategies each just paid every
    // debt's own minimum forever, so avalanche and snowball returned
    // byte-identical answers (verified: 57 months and $875.62 either way on
    // two realistic debts) and both overstated the time and the interest.
    const freedCents = working
      .filter((d) => d.remaining <= 0)
      .reduce((sum, d) => sum + d.minPaymentCents, 0);

    let extra = extraMonthlyCents + freedCents;
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

  const neverPaysOff = working.some((d) => d.remaining > 0);
  return {
    monthsToPayoff: months,
    totalInterestPaidCents: totalInterest,
    payoffOrder,
    neverPaysOff,
  };
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
