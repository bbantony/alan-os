"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { EmptyState } from "@/components/empty-state";
import { Panel, PanelHead } from "@/components/ui/panel";
import { useIsDark } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/finance/money";
import {
  CHART_CATEGORICAL_DARK,
  CHART_CATEGORICAL_LIGHT,
  CHART_CATEGORY_CAP,
  CHART_OTHER_DARK,
  CHART_OTHER_LIGHT,
} from "@/lib/finance/chart-colors";
import { getMonthlySpendByCategory, getMonthlyTrend, getTopMerchants } from "./actions";

interface CategorySpend {
  categoryId: string;
  categoryName: string;
  totalCents: number;
}

// The categorical palette itself is unchanged — it was already validated for
// contrast and colour-blind separation when Reports was built. What changed is
// the geometry around it: square corners on bars and tooltips, square legend
// swatches, and a hard-edged tooltip card, so the charts sit inside the same
// language as everything else instead of being the one rounded island left.
const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 0,
  border: "2px solid var(--rule)",
  background: "var(--surface)",
  color: "var(--foreground)",
  boxShadow: "var(--shadow-hard-sm)",
} as const;

function monthLabel(offset: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString("en-CA", { month: "long", year: "numeric" });
}

export function ReportsView() {
  const isDark = useIsDark();
  const palette = isDark ? CHART_CATEGORICAL_DARK : CHART_CATEGORICAL_LIGHT;
  const otherColor = isDark ? CHART_OTHER_DARK : CHART_OTHER_LIGHT;

  const [monthOffset, setMonthOffset] = useState(0);
  const [categorySpend, setCategorySpend] = useState<CategorySpend[] | null>(null);
  const [trend, setTrend] = useState<{ label: string; totalCents: number }[] | null>(null);
  const [topMerchants, setTopMerchants] = useState<
    { merchant: string; totalCents: number }[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    getMonthlySpendByCategory(monthOffset).then((data) => {
      if (!cancelled) setCategorySpend(data);
    });
    if (monthOffset === 0) {
      getTopMerchants(5).then((data) => {
        if (!cancelled) setTopMerchants(data);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [monthOffset]);

  useEffect(() => {
    getMonthlyTrend(6).then(setTrend);
  }, []);

  const donutData = useMemo(() => {
    if (!categorySpend) return [];
    const top = categorySpend.slice(0, CHART_CATEGORY_CAP);
    const rest = categorySpend.slice(CHART_CATEGORY_CAP);
    const restTotal = rest.reduce((sum, c) => sum + c.totalCents, 0);
    const rows = top.map((c, i) => ({
      name: c.categoryName,
      value: c.totalCents,
      color: palette[i % palette.length],
    }));
    if (restTotal > 0) rows.push({ name: "Other", value: restTotal, color: otherColor });
    return rows;
  }, [categorySpend, palette, otherColor]);

  const totalSpend = donutData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Month navigator as a single ruled strip with the arrows in their own
          cells, so it reads as one control rather than three loose pieces. */}
      <div className="flex items-stretch border-2 border-rule bg-surface">
        <button
          type="button"
          onClick={() => setMonthOffset((m) => m - 1)}
          className="tap-press flex w-11 shrink-0 items-center justify-center border-r border-hairline transition-colors hover:bg-muted"
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" strokeWidth={2.5} />
        </button>
        <span className="micro flex flex-1 items-center justify-center py-2.5">
          {monthLabel(monthOffset)}
        </span>
        <button
          type="button"
          onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
          disabled={monthOffset === 0}
          className="tap-press flex w-11 shrink-0 items-center justify-center border-l border-hairline transition-colors hover:bg-muted disabled:opacity-30"
          aria-label="Next month"
        >
          <ChevronRight className="size-4" strokeWidth={2.5} />
        </button>
      </div>

      {/* ---------------- Spend by category ---------------- */}
      <Panel>
        <PanelHead
          title="Spend by category"
          count={totalSpend > 0 ? formatCents(totalSpend) : undefined}
        />
        {categorySpend === null ? (
          <p className="micro-sm px-3 py-6 text-center text-muted-foreground">Loading…</p>
        ) : donutData.length === 0 ? (
          <EmptyState
            title="No spending this month"
            description="Log an expense to see the breakdown."
          />
        ) : (
          <>
            <div className="relative mx-auto h-[220px] w-full max-w-[220px] py-3">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="95%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {donutData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [formatCents(Number(value ?? 0)), String(name)]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="stat text-xl">{formatCents(totalSpend)}</span>
                <span className="micro-sm mt-0.5 text-muted-foreground">total</span>
              </div>
            </div>

            <ul className="border-t-2 border-rule">
              {donutData.map((d, i) => (
                <li
                  key={d.name}
                  className={cn(
                    "flex items-center justify-between gap-3 px-3 py-2 text-sm",
                    i > 0 && "border-t border-hairline"
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-3 shrink-0 border border-rule"
                      style={{ backgroundColor: d.color }}
                    />
                    <span className="truncate">{d.name}</span>
                  </span>
                  <span className="micro-sm shrink-0 tabular text-muted-foreground">
                    {formatCents(d.value)} ·{" "}
                    {totalSpend > 0 ? Math.round((d.value / totalSpend) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      {/* ---------------- 6-month trend ---------------- */}
      <Panel>
        <PanelHead title="Last 6 months" />
        {trend === null ? (
          <p className="micro-sm px-3 py-6 text-center text-muted-foreground">Loading…</p>
        ) : (
          <div className="h-[150px] w-full p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <Tooltip
                  formatter={(value) => formatCents(Number(value ?? 0))}
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: "var(--muted)" }}
                />
                {/* radius 0 — squared bars, matching every other filled block
                    in the app. */}
                <Bar dataKey="totalCents" fill={palette[0]} radius={0} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      {/* ---------------- Top merchants ---------------- */}
      {topMerchants !== null && topMerchants.length > 0 && (
        <Panel>
          <PanelHead title="Top merchants" count={topMerchants.length} />
          <ol>
            {topMerchants.map((m, i) => (
              <li
                key={m.merchant}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 text-sm",
                  i > 0 && "border-t border-hairline"
                )}
              >
                <span className="micro-sm flex size-5 shrink-0 items-center justify-center border border-rule tabular">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{m.merchant}</span>
                <span className="shrink-0 text-sm font-bold tabular">
                  {formatCents(m.totalCents)}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </div>
  );
}
