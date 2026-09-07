"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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
import { Segmented } from "@/components/ui/segmented";
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
import { getReport } from "./actions";
import type { CategorySpend } from "./actions";
import { shiftPeriodRange } from "@/lib/finance/period";
import type { PeriodRange, PeriodUnit } from "@/lib/finance/period";

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

/** How many buckets the trend chart shows — six months, or six weeks. */
const TREND_BUCKETS = 6;

const MERCHANT_LIMIT = 5;

/**
 * "September 2026", or "week of 31 Aug – 6 Sep 2026" — the period named inside
 * a sentence.
 *
 * A bare date range reads fine as a heading but not in prose ("Nothing spent in
 * 31 Aug – 6 Sep 2026"), so weeks get the word "week" in front of them and
 * months don't need it.
 */
function periodPhrase(unit: PeriodUnit, range: PeriodRange | null): string {
  if (!range) return unit === "week" ? "this week" : "this month";
  return unit === "week" ? `week of ${range.longLabel}` : range.longLabel;
}

/**
 * The same phrase with the article it needs to sit after the word "in".
 *
 * "in the week of 31 Aug – 6 Sep 2026" is right; "in the August 2026" is not.
 * The article belongs to the word "week", not to the period, which is why it
 * lives here rather than being glued on at every use — paging back to a quiet
 * month rendered "Nothing spent in the August 2026" on Alan's screen.
 */
function periodPhraseAfterIn(unit: PeriodUnit, range: PeriodRange | null): string {
  const phrase = periodPhrase(unit, range);
  return unit === "week" ? `the ${phrase}` : phrase;
}

// Shared empty arrays, so "nothing loaded yet" doesn't hand the charts a new
// array identity on every render and re-run their memos for no reason.
const NO_CATEGORIES: CategorySpend[] = [];
const NO_BARS: { label: string; totalCents: number }[] = [];
const NO_MERCHANTS: { merchant: string; totalCents: number }[] = [];

/** Everything one loaded report holds, including which period it is FOR. */
interface LoadedReport {
  unit: PeriodUnit;
  offset: number;
  /** Null only when a period was never successfully labelled — see the catch below. */
  range: PeriodRange | null;
  byCategory: CategorySpend[];
  trend: { label: string; totalCents: number }[];
  merchants: { merchant: string; totalCents: number }[];
  /** The plain-English reason, or null when the figures are real. */
  error: string | null;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ReportsView() {
  const isDark = useIsDark();
  const palette = isDark ? CHART_CATEGORICAL_DARK : CHART_CATEGORICAL_LIGHT;
  const otherColor = isDark ? CHART_OTHER_DARK : CHART_OTHER_LIGHT;

  // Month stays the default, so nothing changes for anyone who never touches
  // the switch.
  const [unit, setUnit] = useState<PeriodUnit>("month");
  const [offset, setOffset] = useState(0);

  // ONE piece of state for the answer, holding the period it belongs to.
  //
  // "Are we loading?" is then DERIVED — the period asked for above versus the
  // period this arrived for — rather than being a flag someone has to remember
  // to raise and lower. The version this replaces had a `setLoading(true)`
  // wrapped in an async function it immediately called, with a comment
  // claiming that made it asynchronous. It didn't: with no `await` before the
  // setState, it ran exactly as if called directly. It was a way of getting
  // past a lint rule, and the rule was pointing at something real. Deriving
  // removes the question instead of dodging it, and makes the two impossible
  // to disagree.
  //
  // The heading is not computed here either. It used to come from a local
  // `monthLabel()` built on `new Date()` — the *browser's* timezone — so a late
  // evening tap near a month boundary could name the wrong month while showing
  // the right data. The server labels the period it actually queried.
  const [loaded, setLoaded] = useState<LoadedReport | null>(null);

  const loading = loaded === null || loaded.unit !== unit || loaded.offset !== offset;
  const failed = !loading && loaded !== null && loaded.error !== null;
  const range = loaded?.range ?? null;
  // Read only when neither loading nor failed; the panels below see to that.
  const categorySpend = loaded?.byCategory ?? NO_CATEGORIES;
  const trend = loaded?.trend ?? NO_BARS;
  const topMerchants = loaded?.merchants ?? NO_MERCHANTS;

  // Ticket per load: two quick taps on the arrows launch overlapping fetches
  // and only the newest may write its results — the same stale-response guard
  // the Timeline and the Plan calendar use. The month-only version of this
  // screen was guarded too, with a `cancelled` flag cleaned up per effect; the
  // ticket replaces it because several panels now resolve from one call and a
  // per-effect flag has nothing to say about which REQUEST an answer belongs
  // to. The protection is not new, the mechanism is.
  const loadIdRef = useRef(0);

  useEffect(() => {
    const loadId = ++loadIdRef.current;
    const period = { unit, offset };

    // ONE server action, and one is the point: Next runs server actions from a
    // single client SEQUENTIALLY, so anything this screen wants per period has
    // to queue. `getReport` fetches the lot concurrently on the server — where
    // the concurrency is real — and answers in one hop, so the heading and the
    // figures land together.
    //
    // For the record, since an earlier version of this comment guessed and got
    // it wrong: the month-only screen made three calls, not four. Categories on
    // every change, merchants only on the current month, the trend once at
    // mount in its own effect, and no call at all for the heading — it was
    // built locally from the browser's clock, which is the timezone bug this
    // rewrite removed.
    getReport(period, { trendCount: TREND_BUCKETS, merchantLimit: MERCHANT_LIMIT })
      .then((report) => {
        if (loadId !== loadIdRef.current) return;
        // The heading is kept either way: it names the period we asked for and
        // is true even when the figures under it couldn't be fetched. The
        // error, when there is one, is the server's own sentence — it might be
        // "that's further back than reports go", which is worth reading.
        // Recording it also stops the empty states claiming nothing was spent,
        // which is a different and wrong statement from "couldn't load it".
        setLoaded({
          ...period,
          range: report.range,
          byCategory: report.byCategory,
          trend: report.trend,
          merchants: report.merchants,
          error: report.error ?? null,
        });
      })
      .catch(() => {
        if (loadId !== loadIdRef.current) return;
        // A dropped connection. The figures are gone, but WHERE THE ARROWS
        // TOOK YOU is not: it is worked out from the last range the server
        // sent, shifted by however many periods have been tapped since. That
        // is pure arithmetic on a date the server chose — no device clock is
        // involved, which is the whole reason `shiftPeriodRange` exists.
        //
        // Without this the navigator kept whatever it last said: three taps of
        // ◀ while offline left the heading reading "September 2026" over June,
        // and the one control that tells you where you are was lying.
        setLoaded((prev) => ({
          ...period,
          range:
            prev?.range && prev.unit === period.unit
              ? shiftPeriodRange(prev.range, period.unit, period.offset - prev.offset)
              : null,
          byCategory: [],
          trend: [],
          merchants: [],
          error: "Couldn't load these figures. Check your connection and try the arrows again.",
        }));
      });
  }, [unit, offset]);

  const donutData = useMemo(() => {
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
  const trendHasSpend = trend.some((t) => t.totalCents > 0);

  const unitWord = unit === "week" ? "week" : "month";
  const phrase = periodPhrase(unit, range);
  // The same phrase, articled for use after the word "in".
  const inPhrase = periodPhraseAfterIn(unit, range);
  // "this week" only when it really is this week; anything older gets named.
  const emptyTitle =
    offset === 0 ? `Nothing spent this ${unitWord}` : `Nothing spent in ${inPhrase}`;
  const emptyDescription =
    offset === 0
      ? "Log an expense and the breakdown appears here."
      : `No expenses were logged in that ${unitWord}.`;

  function changeUnit(next: PeriodUnit) {
    setUnit(next);
    // Back to the current period on every switch. Three months back does not
    // mean anything as three weeks back, and landing on "now" is the one answer
    // nobody has to work out.
    setOffset(0);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Month/Week switch and the period navigator: stacked on a phone, side by
          side once there is room. The navigator stays one ruled strip with the
          arrows in their own cells, so it reads as a single control rather than
          three loose pieces. */}
      {/* Side by side only when THIS ROW has the room, not when the window
          does (7 Sep 2026). With the assistant dock open the Money screen is
          about 330px wide on a 884px display, and a viewport `sm:` put a fixed
          176px Month/Week switch beside the period navigator with ~57px left
          for the month name. `@container` here rather than higher up the tree
          so it stays a fact about this one control. */}
      <div className="@container">
        <div className="flex flex-col gap-2 @md:flex-row @md:items-stretch">
          <Segmented
            className="@md:w-44 @md:shrink-0"
            options={[
              { value: "month", label: "Month" },
              { value: "week", label: "Week" },
            ]}
            value={unit}
            onChange={changeUnit}
          />

          <div
            className="flex flex-1 items-stretch border-2 border-rule bg-surface"
            aria-busy={loading}
          >
            <button
              type="button"
              onClick={() => setOffset((o) => o - 1)}
              className="tap-press flex w-11 shrink-0 items-center justify-center border-r border-hairline transition-colors hover:bg-muted"
              aria-label={`Previous ${unitWord}`}
            >
              <ChevronLeft className="size-4" strokeWidth={2.5} />
            </button>
            <span
              aria-live="polite"
              className={cn(
                "micro flex flex-1 items-center justify-center px-2 py-2.5 text-center transition-opacity duration-150",
                loading && "opacity-50"
              )}
            >
              {range ? range.longLabel : loading ? "Loading…" : "Couldn't load"}
            </span>
            <button
              type="button"
              onClick={() => setOffset((o) => Math.min(0, o + 1))}
              disabled={offset === 0}
              className="tap-press flex w-11 shrink-0 items-center justify-center border-l border-hairline transition-colors hover:bg-muted disabled:opacity-30"
              aria-label={`Next ${unitWord}`}
            >
              <ChevronRight className="size-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- Spend by category ---------------- */}
      <Panel>
        <PanelHead
          title="Spend by category"
          count={!loading && !failed && totalSpend > 0 ? formatCents(totalSpend) : undefined}
        />
        {/* Every panel names the dates it covers, so no number on this screen
            can be read against the wrong period. */}
        <PeriodCaption loading={loading} failed={failed}>
          {capitalise(phrase)}
        </PeriodCaption>
        {loading ? (
          <LoadingLine />
        ) : failed ? (
          <FailedLine message={loaded?.error} />
        ) : donutData.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
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

      {/* ---------------- Trend ---------------- */}
      <Panel>
        {/* The chart ends at whichever period is selected, so paging back moves
            it too: "last 6 weeks" means the six weeks up to the one on screen,
            not the six weeks up to today. */}
        <PanelHead title={`Last ${TREND_BUCKETS} ${unitWord}s`} />
        <PeriodCaption loading={loading} failed={failed}>
          Ending {inPhrase}
        </PeriodCaption>
        {loading ? (
          <LoadingLine />
        ) : failed ? (
          <FailedLine message={loaded?.error} />
        ) : !trendHasSpend ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing spent in these {TREND_BUCKETS} {unitWord}s yet.
          </p>
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
      {/* This panel used to vanish when it had nothing to show, and used to
          answer for the month no matter which period the rest of the screen was
          on. It now follows the switch, and says so when it is empty instead of
          leaving the page a different shape. */}
      <Panel>
        <PanelHead
          title="Top merchants"
          count={!loading && !failed && topMerchants.length > 0 ? topMerchants.length : undefined}
        />
        <PeriodCaption loading={loading} failed={failed}>
          {capitalise(phrase)}
        </PeriodCaption>
        {loading ? (
          <LoadingLine />
        ) : failed ? (
          <FailedLine message={loaded?.error} />
        ) : topMerchants.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {offset === 0
              ? `No shop names on this ${unitWord}'s expenses yet.`
              : `No shop names on that ${unitWord}'s expenses.`}{" "}
            Add a shop when you log one and it gets counted here.
          </p>
        ) : (
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
        )}
      </Panel>
    </div>
  );
}

/**
 * The hairline strip under a panel heading naming the dates that panel covers.
 *
 * Hidden while loading: mid-load the period being fetched and whatever is still
 * on screen are two different things, and a caption naming one while the body
 * shows the other is worse than no caption at all.
 */
function PeriodCaption({
  children,
  loading,
  failed,
}: {
  children: ReactNode;
  loading: boolean;
  failed: boolean;
}) {
  if (loading || failed) return null;
  return (
    <p className="micro-sm border-b border-hairline px-3 py-1.5 text-muted-foreground">
      {children}
    </p>
  );
}

function LoadingLine() {
  return <p className="micro-sm px-3 py-6 text-center text-muted-foreground">Loading…</p>;
}

// The sentence comes from whoever failed. A dropped connection says to check
// the connection; the server says why it refused (a period further back than
// reports go, say). One generic line for both would have thrown away the only
// useful half.
function FailedLine({ message }: { message?: string | null }) {
  return (
    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
      {message ?? "Couldn't load these figures. Check your connection and try the arrows again."}
    </p>
  );
}
