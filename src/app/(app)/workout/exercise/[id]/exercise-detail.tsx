"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Trophy } from "lucide-react";

import { Panel, PanelHead, PanelEmpty } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Stat, StatStrip } from "@/components/ui/stat";
import { Micro } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { CHART_CATEGORICAL_DARK, CHART_CATEGORICAL_LIGHT } from "@/lib/finance/chart-colors";
import { useTheme } from "@/components/theme/theme-provider";
import { displayWeight, formatWeight } from "@/lib/workout/units";
import type { WeightUnit } from "@/lib/workout/types";
import type { ExerciseDetail } from "../../personal-actions";

// Same hard-edged, theme-aware chart language as Money's reports — square
// corners, a 2px rule border, the hard shadow. A rounded tooltip here would be
// the one soft object left in the app.
const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 0,
  border: "2px solid var(--rule)",
  background: "var(--surface)",
  color: "var(--foreground)",
  boxShadow: "var(--shadow-hard-sm)",
} as const;

type Metric = "top" | "e1rm" | "volume";

const METRIC_LABELS: Record<Metric, string> = {
  top: "Heaviest set",
  e1rm: "Est. 1RM",
  volume: "Volume",
};

function useIsDark() {
  const { theme } = useTheme();
  // Matches reports-view: the explicit choice wins, "system" follows the OS.
  if (typeof window === "undefined") return false;
  if (theme.mode === "dark") return true;
  if (theme.mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

/**
 * One exercise, all of it.
 *
 * The module could previously show you the last four sessions of a lift, and
 * only while you were in the middle of logging it. There was no way to answer
 * "is my bench actually going up?" — which is the question the whole thing
 * exists to serve. The chart answers it; the history below is the evidence.
 */
export function ExerciseDetailView({
  detail,
  weightUnit,
}: {
  detail: ExerciseDetail;
  weightUnit: WeightUnit;
}) {
  const [metric, setMetric] = useState<Metric>("e1rm");
  const isDark = useIsDark();
  const stroke = (isDark ? CHART_CATEGORICAL_DARK : CHART_CATEGORICAL_LIGHT)[0];

  const prIds = useMemo(() => new Set(detail.prWorkoutIds), [detail.prWorkoutIds]);

  const chartData = useMemo(
    () =>
      detail.sessions.map((s) => ({
        date: shortDate(s.date),
        value: Number(
          displayWeight(
            metric === "top" ? s.topWeightKg : metric === "e1rm" ? s.best1rmKg : s.volumeKg,
            weightUnit
          ).toFixed(1)
        ),
      })),
    [detail.sessions, metric, weightUnit]
  );

  // Newest first for reading; the chart wants the opposite, hence two orders.
  const history = useMemo(() => [...detail.sessions].reverse(), [detail.sessions]);

  return (
    <div className="flex flex-col gap-4">
      <StatStrip columns={4}>
        <Stat label="Heaviest" value={formatWeight(detail.bestWeightKg, weightUnit)} />
        <Stat label="Best 1RM" value={formatWeight(detail.best1rmKg, weightUnit)} sub="estimated" />
        <Stat label="Sessions" value={detail.timesPerformed} />
        <Stat
          label="Last done"
          value={detail.lastDone ? shortDate(detail.lastDone) : "—"}
          sub={detail.lastDone ? undefined : "never"}
        />
      </StatStrip>

      <Panel>
        <PanelHead title="Progress" />
        {detail.sessions.length < 2 ? (
          <PanelEmpty>
            One session logged. Do this again and the line starts telling you something.
          </PanelEmpty>
        ) : (
          <>
            <div className="p-3">
              <Segmented
                options={(Object.keys(METRIC_LABELS) as Metric[]).map((m) => ({
                  value: m,
                  label: METRIC_LABELS[m],
                }))}
                value={metric}
                onChange={setMetric}
              />
            </div>
            <div className="h-[200px] w-full px-2 pb-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--hairline)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    className="fill-muted-foreground"
                    minTickGap={16}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    className="fill-muted-foreground"
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [`${value} ${weightUnit}`, METRIC_LABELS[metric]]}
                  />
                  {/* Square dots and joins — no rounded line caps anywhere. */}
                  <Line
                    type="linear"
                    dataKey="value"
                    stroke={stroke}
                    strokeWidth={2}
                    dot={{ r: 2.5, strokeWidth: 0, fill: stroke }}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Panel>

      <Panel>
        <PanelHead title="Every session" count={history.length || undefined} />
        {history.length === 0 ? (
          <PanelEmpty>You haven&rsquo;t logged this one yet.</PanelEmpty>
        ) : (
          <ul>
            {history.map((s, i) => (
              <li key={s.workoutId} className={cn("px-3 py-2.5", i > 0 && "border-t border-hairline")}>
                <div className="flex items-center gap-2">
                  <span className="micro-sm w-14 shrink-0 text-muted-foreground">
                    {shortDate(s.date)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm tabular">
                    {s.sets
                      .map((set) => `${formatWeight(set.weight_kg, weightUnit)}×${set.reps}`)
                      .join("  ·  ")}
                  </span>
                  {prIds.has(s.workoutId) && (
                    <Trophy className="size-3.5 shrink-0 text-accent" strokeWidth={2.5} />
                  )}
                </div>
                <Micro className="mt-0.5 block">
                  top {formatWeight(s.topWeightKg, weightUnit)} · est 1RM{" "}
                  {formatWeight(s.best1rmKg, weightUnit)}
                </Micro>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
