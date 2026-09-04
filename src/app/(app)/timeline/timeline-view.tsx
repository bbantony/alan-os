"use client";

import { addDaysToDateString, formatInAppTimezone } from "@/lib/time";
import { useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Repeat,
  Scale,
  ShoppingCart,
  Sparkles,
  Check as CheckIcon,
  Trophy,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel, PanelHead, PanelEmpty } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Stat, StatStrip } from "@/components/ui/stat";
import { Micro } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { fadeInUpVariants, staggerContainerVariants } from "@/lib/motion";
import { formatCents } from "@/lib/finance/money";
import type { LedgerDaySummary, LedgerEvent, LedgerKind } from "@/lib/ledger";
import type { Insight } from "@/lib/ai/insights";
import { getLedgerDays, dismissInsight, runSuggestedAction } from "./actions";

/**
 * One timeline across every module.
 *
 * Six modules have always held timestamped rows about the same life without
 * being able to see each other. This is the first screen in the app that reads
 * them together — and it's also the thing that makes the weekly pattern
 * possible, because a week of this is exactly what gets summarised and handed
 * to the model.
 *
 * Every row links back to the module that produced it. Nothing here is a new
 * source of truth; it's a reading.
 */

const KIND_ICONS: Record<LedgerKind, typeof Wallet> = {
  money: Wallet,
  training: Dumbbell,
  task: CheckIcon,
  routine: Repeat,
  shopping: ShoppingCart,
  check: Scale,
};

function formatDayHeading(iso: string, todayIso: string): string {
  if (iso === todayIso) return "Today";
  const d = new Date(`${iso}T00:00:00Z`);
  const today = new Date(`${todayIso}T00:00:00Z`);
  const days = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (days === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

function formatTime(event: { at: string; timeKnown: boolean }): string | null {
  // A row that only knows a date has no time to show, and inventing one would
  // be a lie. This used to be detected by sniffing for a "T00:00:00.000Z"
  // suffix, which only held while day-starts were UTC midnight; the ledger
  // now says so outright.
  if (!event.timeKnown) return null;
  // WITH a timezone. Without one this rendered in the device's zone — and
  // because this component server-renders first, the server (UTC) and the
  // phone (Winnipeg) produced different text, which is a hydration mismatch
  // on every timed row as well as being the wrong time.
  return formatInAppTimezone(event.at, { hour: "numeric", minute: "2-digit" });
}

type Range = "day" | "week";

export function TimelineView({
  initialDays,
  initialFrom,
  initialTo,
  today,
  insight,
}: {
  initialDays: LedgerDaySummary[];
  initialFrom: string;
  initialTo: string;
  today: string;
  insight: Insight | null;
}) {
  const [range, setRange] = useState<Range>("week");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [days, setDays] = useState(initialDays);
  const [loading, setLoading] = useState(false);
  const [currentInsight, setCurrentInsight] = useState(insight);
  const [acting, setActing] = useState(false);

  // The header range updates instantly but the rows arrive whenever the
  // network says so — two quick arrow taps used to race, and whichever fetch
  // finished last won. Each load takes a ticket; stale results are dropped.
  const loadIdRef = useRef(0);

  async function load(nextFrom: string, nextTo: string) {
    const loadId = ++loadIdRef.current;
    setLoading(true);
    setFrom(nextFrom);
    setTo(nextTo);
    const result = await getLedgerDays(nextFrom, nextTo);
    if (loadId !== loadIdRef.current) return;
    setDays(result);
    setLoading(false);
  }

  function shift(direction: -1 | 1) {
    const step = range === "day" ? 1 : 7;
    load(addDaysToDateString(from, direction * step), addDaysToDateString(to, direction * step));
  }

  function changeRange(next: Range) {
    setRange(next);
    if (next === "day") load(today, today);
    else load(addDaysToDateString(today, -6), today);
  }

  async function handleAction() {
    if (!currentInsight?.suggested_action) return;
    setActing(true);
    const result = await runSuggestedAction({
      insightId: currentInsight.id,
      action: currentInsight.suggested_action,
    });
    setActing(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setCurrentInsight({ ...currentInsight, acted_at: new Date().toISOString() });
    toast.success("Done");
  }

  async function handleDismiss() {
    if (!currentInsight) return;
    const id = currentInsight.id;
    setCurrentInsight(null);
    await dismissInsight({ insightId: id });
  }

  const totals = days.reduce(
    (acc, d) => ({
      spent: acc.spent + d.spentCents,
      earned: acc.earned + d.earnedCents,
      trained: acc.trained + (d.trained ? 1 : 0),
      tasks: acc.tasks + d.tasksDone,
    }),
    { spent: 0, earned: 0, trained: 0, tasks: 0 }
  );

  const rangeLabel =
    range === "day"
      ? formatDayHeading(from, today)
      : `${new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }).format(
          new Date(`${from}T00:00:00Z`)
        )} – ${new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }).format(
          new Date(`${to}T00:00:00Z`)
        )}`;

  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-4"
    >
      <motion.div variants={fadeInUpVariants}>
        <Segmented
          options={[
            { value: "day", label: "A day" },
            { value: "week", label: "A week" },
          ]}
          value={range}
          onChange={(v) => changeRange(v as Range)}
        />
      </motion.div>

      {/* Date navigator, as one ruled strip — the same control Money's reports
          use, for the same job. */}
      <motion.div variants={fadeInUpVariants} className="flex items-stretch border-2 border-rule bg-surface">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Earlier"
          className="tap-press flex w-11 shrink-0 items-center justify-center border-r border-hairline transition-colors hover:bg-muted"
        >
          <ChevronLeft className="size-4" strokeWidth={2.5} />
        </button>
        <span className="micro flex flex-1 items-center justify-center py-2.5">{rangeLabel}</span>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={to >= today}
          aria-label="Later"
          className="tap-press flex w-11 shrink-0 items-center justify-center border-l border-hairline transition-colors hover:bg-muted disabled:opacity-30"
        >
          <ChevronRight className="size-4" strokeWidth={2.5} />
        </button>
      </motion.div>

      <motion.div variants={fadeInUpVariants}>
        <StatStrip columns={4}>
          <Stat label="Spent" value={formatCents(totals.spent)} href="/money" />
          <Stat label="In" value={formatCents(totals.earned)} tone={totals.earned > 0 ? "ok" : "default"} />
          <Stat label="Trained" value={totals.trained} unit={totals.trained === 1 ? "day" : "days"} href="/workout" />
          <Stat label="Done" value={totals.tasks} sub="tasks" href="/plan" />
        </StatStrip>
      </motion.div>

      {/* ---------------- The weekly pattern ---------------- */}
      {currentInsight && !currentInsight.dismissed_at && (
        <motion.div variants={fadeInUpVariants}>
          <Panel tone="raised">
            <PanelHead
              title="What last week showed"
              action={
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="micro-sm tap-press text-muted-foreground transition-colors hover:text-foreground"
                >
                  Dismiss
                </button>
              }
            />
            <div className="flex flex-col gap-3 px-3 py-3">
              <div className="flex gap-3">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.5} />
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{currentInsight.body}</p>
              </div>

              {/* The "suggest" half of notice-and-suggest. Nothing has happened
                  yet — this is a stored intention until it's tapped. */}
              {currentInsight.suggested_action && !currentInsight.acted_at && (
                <Button type="button" variant="outline" disabled={acting} onClick={handleAction}>
                  {acting ? "Working…" : currentInsight.suggested_action.label}
                </Button>
              )}
              {currentInsight.acted_at && (
                <Micro className="flex items-center gap-1.5">
                  <CheckIcon className="size-3.5 text-ok" strokeWidth={3} />
                  Done
                </Micro>
              )}
            </div>
          </Panel>
        </motion.div>
      )}

      {/* ---------------- The days ---------------- */}
      {loading ? (
        <Panel>
          <p className="micro-sm px-3 py-6 text-center text-muted-foreground">Loading…</p>
        </Panel>
      ) : days.length === 0 ? (
        <Panel>
          <PanelEmpty>
            Nothing logged in this stretch. Anything you do in any part of the app lands here.
          </PanelEmpty>
        </Panel>
      ) : (
        days.map((day) => (
          <motion.div key={day.date} variants={fadeInUpVariants}>
            <Panel>
              <PanelHead
                title={formatDayHeading(day.date, today)}
                count={
                  day.spentCents > 0 ? `−${formatCents(day.spentCents)}` : undefined
                }
              />
              <ul>
                {day.events.map((event, i) => (
                  <TimelineRow key={`${event.kind}-${event.at}-${i}`} event={event} first={i === 0} />
                ))}
              </ul>
            </Panel>
          </motion.div>
        ))
      )}
    </motion.div>
  );
}

function TimelineRow({ event, first }: { event: LedgerEvent; first: boolean }) {
  const Icon = KIND_ICONS[event.kind];
  const time = formatTime(event);

  return (
    <li className={cn(!first && "border-t border-hairline")}>
      <Link
        href={event.href}
        className="tap-press flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted"
      >
        <span className="micro-sm w-12 shrink-0 tabular text-muted-foreground">{time ?? "—"}</span>

        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center border-2",
            event.highlight ? "border-accent bg-accent text-accent-foreground" : "border-rule"
          )}
        >
          {event.highlight ? (
            <Trophy className="size-3.5" strokeWidth={2.5} />
          ) : (
            <Icon className="size-3.5" strokeWidth={2.5} />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{event.title}</span>
          {event.detail && <Micro className="block truncate">{event.detail}</Micro>}
        </span>

        {event.amountCents !== undefined && (
          <span
            className={cn(
              "shrink-0 text-sm font-bold tabular",
              event.amountCents > 0 && "text-ok"
            )}
          >
            {event.amountCents > 0 ? "+" : "−"}
            {formatCents(Math.abs(event.amountCents), event.currency)}
          </span>
        )}
      </Link>
    </li>
  );
}
