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
import { useTheme } from "@/components/theme/theme-provider";
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

function useIsDark() {
  const { theme } = useTheme();
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const compute = () => setIsDark(theme.mode === "dark" || (theme.mode === "system" && media.matches));
    compute();
    media.addEventListener("change", compute);
    return () => media.removeEventListener("change", compute);
  }, [theme.mode]);
  return isDark;
}

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
  const [topMerchants, setTopMerchants] = useState<{ merchant: string; totalCents: number }[] | null>(null);

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
    const rows = top.map((c, i) => ({ name: c.categoryName, value: c.totalCents, color: palette[i % palette.length] }));
    if (restTotal > 0) rows.push({ name: "Other", value: restTotal, color: otherColor });
    return rows;
  }, [categorySpend, palette, otherColor]);

  const totalSpend = donutData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2">
        <button onClick={() => setMonthOffset((m) => m - 1)} className="tap-press p-1" aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium">{monthLabel(monthOffset)}</span>
        <button
          onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
          disabled={monthOffset === 0}
          className="tap-press p-1 disabled:opacity-30"
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold">Spend by category</h3>
        {categorySpend === null ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : donutData.length === 0 ? (
          <EmptyState title="No spending this month" description="Log an expense to see the breakdown." />
        ) : (
          <>
            <div className="relative mx-auto h-[220px] w-full max-w-[220px]">
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
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="tabular text-lg font-semibold">{formatCents(totalSpend)}</span>
                <span className="text-[10px] text-muted-foreground">total</span>
              </div>
            </div>
            <ul className="mt-3 space-y-1.5">
              {donutData.map((d) => (
                <li key={d.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-foreground">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.name}
                  </span>
                  <span className="tabular text-muted-foreground">
                    {formatCents(d.value)} ({totalSpend > 0 ? Math.round((d.value / totalSpend) * 100) : 0}%)
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold">Last 6 months</h3>
        {trend === null ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <div className="h-[140px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  className="fill-muted-foreground"
                />
                <Tooltip formatter={(value) => formatCents(Number(value ?? 0))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="totalCents" fill={palette[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {topMerchants !== null && topMerchants.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold">Top merchants this month</h3>
          <ul className="space-y-2">
            {topMerchants.map((m) => (
              <li key={m.merchant} className="flex items-center justify-between text-sm">
                <span className="truncate">{m.merchant}</span>
                <span className="tabular text-muted-foreground">{formatCents(m.totalCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
