"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DateField } from "@/components/ui/date-field";
import { Panel, PanelHead, PanelEmpty } from "@/components/ui/panel";
import { Stat, StatStrip } from "@/components/ui/stat";
import { Micro, Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { todayInAppTimezone } from "@/lib/time";
import { formatCents, dollarsToCents } from "@/lib/finance/money";
import {
  parseCsv,
  guessColumns,
  normalizeCsvDate,
  readCsvAmount,
  type AmountReading,
  type ColumnGuess,
} from "@/lib/finance/csv-parser";
import { matchStatement, type AppTxn, type BankRow } from "@/lib/finance/reconcile";
import type { Account, Category } from "@/lib/finance/types";
import {
  addMissingTransaction,
  finishReconciliation,
  getReconcileData,
  type ReconcileData,
} from "../reconcile-actions";

type Step = "setup" | "match" | "done";

/**
 * The month-end check: does what the app thinks match what the bank says?
 *
 * Three steps, and the middle one does the real work. The statement CSV is
 * optional but changes the character of the job completely — without it you're
 * ticking a list by eye, with it the app tells you exactly which transactions
 * you never logged, and you add them in a tap each.
 */
export function ReconcileFlow({
  accounts,
  initialAccountId,
}: {
  accounts: Account[];
  initialAccountId: string;
}) {
  const today = todayInAppTimezone();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("setup");
  const [accountId, setAccountId] = useState(initialAccountId);
  const [statementDate, setStatementDate] = useState(today);
  const [statementBalance, setStatementBalance] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState<ReconcileData | null>(null);
  const [transactions, setTransactions] = useState<AppTxn[]>([]);
  const [cleared, setCleared] = useState<Record<string, boolean>>({});

  // Statement CSV state.
  const [bankRows, setBankRows] = useState<BankRow[] | null>(null);
  /** Statement rows dated after the statement date, excluded so they can't be
      added twice. Shown, because a silently shorter statement is confusing. */
  const [skippedAfterDate, setSkippedAfterDate] = useState(0);
  /**
   * Statement lines whose amount can be read two ways, held back for a
   * decision instead of dropped. Alan: "reconcile only that, while the rest it
   * prompts me to confirm — reconciliation is the whole purpose of this in the
   * first place." A line missing from a reconcile leaves a difference with no
   * explanation, which is the one thing this screen exists to prevent.
   */
  const [pendingRows, setPendingRows] = useState<
    { key: string; date: string; description: string; raw: string; isIncome: boolean; readings: AmountReading[] }[]
  >([]);
  const [unreadableCount, setUnreadableCount] = useState(0);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnGuess | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  const [rowCategory, setRowCategory] = useState<Record<string, string>>({});

  const [result, setResult] = useState<{
    cleared: number;
    adjusted: number;
    balance: number;
    serverDifference: number;
    declinedCorrection: boolean;
  } | null>(null);

  const account = accounts.find((a) => a.id === accountId);
  const statementBalanceCents = dollarsToCents(Number(statementBalance) || 0);

  const match = useMemo(() => {
    if (!bankRows) return null;
    return matchStatement(transactions, bankRows);
  }, [transactions, bankRows]);

  const appBalanceCents = data?.appBalanceCents ?? 0;
  const differenceCents = statementBalanceCents - appBalanceCents;

  const clearedIds = Object.entries(cleared)
    .filter(([, on]) => on)
    .map(([id]) => id);

  // ---------------- Step 1 ----------------

  async function startMatching() {
    if (!accountId || !statementBalance) return;
    setLoading(true);
    setError(null);
    const result = await getReconcileData({ accountId, statementDate });
    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    setData(result);
    setTransactions(result.transactions);

    // Anything the statement confirms starts ticked, so the list you're left
    // looking at is the exceptions rather than the whole month.
    if (bankRows) {
      const auto = matchStatement(result.transactions, bankRows);
      const next: Record<string, boolean> = {};
      for (const id of auto.matchedAppIds) next[id] = true;
      setCleared(next);
    }
    setStep("match");
  }

  function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const { headers, rows } = parseCsv(String(reader.result ?? ""));
      if (headers.length === 0 || rows.length === 0) {
        setError("Couldn't find any rows in that file.");
        return;
      }
      setCsvHeaders(headers);
      setCsvRows(rows);
      setMapping(guessColumns(headers));
      setError(null);
    };
    reader.readAsText(file);
  }

  function buildBankRows() {
    if (!mapping) return;
    const useDebitCredit =
      mapping.amountCol === null && (mapping.debitCol !== null || mapping.creditCol !== null);
    const rows: BankRow[] = [];
    const ask: typeof pendingRows = [];
    let unreadable = 0;
    // Counted, not silently dropped — the app-side equivalent already tells
    // you how many of YOUR transactions fall after the statement date, and
    // statement rows are evidence too.
    let skippedAfterDate = 0;

    for (const [i, row] of csvRows.entries()) {
      const date = normalizeCsvDate(row[mapping.dateCol] ?? "");
      const description = (row[mapping.descriptionCol] ?? "").trim();
      if (!date) continue;

      let raw = "";
      let forcedDirection: boolean | null = null;
      if (useDebitCredit) {
        const debit = mapping.debitCol !== null ? (row[mapping.debitCol] ?? "").trim() : "";
        const credit = mapping.creditCol !== null ? (row[mapping.creditCol] ?? "").trim() : "";
        if (debit) {
          raw = debit;
          forcedDirection = false;
        } else if (credit) {
          raw = credit;
          forcedDirection = true;
        }
      } else if (mapping.amountCol !== null) {
        raw = row[mapping.amountCol] ?? "";
      }
      if (!raw.trim()) continue;

      // Statement rows dated after the statement date are excluded, because
      // getReconcileData excludes app transactions after it too — without
      // this they showed up as "on the statement, not in the app" and one tap
      // on "Add it" wrote a real duplicate.
      if (date > statementDate) {
        skippedAfterDate += 1;
        continue;
      }

      const read = readCsvAmount(raw);
      if (read.kind === "ok") {
        rows.push({
          key: `${i}`,
          date,
          description,
          amountCents: read.cents,
          isIncome: forcedDirection ?? read.isIncome,
        });
      } else if (read.kind === "ambiguous") {
        ask.push({
          key: `${i}`,
          date,
          description,
          raw: raw.trim(),
          isIncome: forcedDirection ?? read.isIncome,
          readings: read.readings,
        });
      } else {
        unreadable += 1;
      }
    }

    setPendingRows(ask);
    setUnreadableCount(unreadable);

    if (rows.length === 0 && ask.length === 0) {
      setError("Couldn't read any amounts — check which columns are which above.");
      return;
    }
    setBankRows(rows);
    setError(null);
    setSkippedAfterDate(skippedAfterDate);
    toast.success(
      ask.length > 0
        ? `${rows.length} lines read — ${ask.length} need a decision`
        : `${rows.length} lines read from the statement`
    );
  }

  // ---------------- Step 2 ----------------

  async function addRow(bank: BankRow) {
    const categoryId = rowCategory[bank.key];
    if (!categoryId) {
      toast.error("Pick a category first.");
      return;
    }
    const added = await addMissingTransaction({
      accountId,
      categoryId,
      amountCents: bank.amountCents,
      merchant: bank.description.slice(0, 80),
      txnDate: bank.date,
      isIncome: bank.isIncome,
    });
    if (added.error || !added.transaction) {
      toast.error(added.error ?? "Couldn't add that.");
      return;
    }
    // It goes into the list already ticked — it came off the statement, so by
    // definition the statement confirms it.
    const txn = added.transaction;
    setTransactions((prev) => [txn, ...prev]);
    setCleared((prev) => ({ ...prev, [txn.id]: true }));
    setAddedKeys((prev) => new Set(prev).add(bank.key));
    // The app balance moves with it, which is what closes the gap.
    setData((prev) =>
      prev
        ? {
            ...prev,
            appBalanceCents:
              prev.appBalanceCents +
              (account?.type === "credit_card"
                ? bank.isIncome
                  ? -bank.amountCents
                  : bank.amountCents
                : bank.isIncome
                  ? bank.amountCents
                  : -bank.amountCents),
          }
        : prev
    );
    toast.success(`${formatCents(bank.amountCents)} added`);
  }

  async function finish(postAdjustment: boolean) {
    setLoading(true);
    const res = await finishReconciliation({
      accountId,
      statementDate,
      statementBalanceCents,
      clearedTransactionIds: clearedIds,
      postAdjustment,
      note: null,
    });
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setResult({
      cleared: res.clearedCount ?? 0,
      adjusted: res.adjustedCents ?? 0,
      balance: res.newBalanceCents ?? 0,
      serverDifference: res.differenceCents ?? 0,
      // Whether Alan tapped "Finish without correcting" while looking at a
      // real gap — the done screen must not confuse that deliberate choice
      // with the books moving underneath him during the check.
      declinedCorrection: !postAdjustment && differenceCents !== 0,
    });
    setStep("done");
  }

  // ---------------- Render ----------------

  if (step === "done" && result) {
    return (
      <Panel tone="raised">
        <PanelHead title="Done" />
        <div className="flex flex-col gap-3 px-3 py-4">
          <p className="text-sm">
            {result.adjusted !== 0
              ? `Corrected by ${formatCents(Math.abs(result.adjusted), data?.currency)}. Your ${account?.name} balance now matches the bank.`
              : result.serverDifference === 0
                ? "Everything matched — no correction was needed."
                : result.declinedCorrection
                  ? `Finished without correcting — the ${formatCents(Math.abs(result.serverDifference), data?.currency)} gap is recorded with this reconcile.`
                  : `The books moved while you were checking: the recorded gap is ${formatCents(Math.abs(result.serverDifference), data?.currency)} and no correction was posted. Run a reconcile again to settle it.`}
          </p>
          <Micro>
            {result.cleared} transaction{result.cleared === 1 ? "" : "s"} confirmed against this
            statement. They won&rsquo;t come up again next month.
          </Micro>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.location.assign("/money")}>
              Back to Money
            </Button>
            <Button
              onClick={() => {
                setStep("setup");
                setResult(null);
                setData(null);
                setBankRows(null);
                setCleared({});
                setAddedKeys(new Set());
                setStatementBalance("");
              }}
            >
              Do another account
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  if (step === "setup") {
    return (
      <div className="flex flex-col gap-4">
        <Panel>
          <PanelHead title="What does the bank say?" />
          <div className="flex flex-col gap-3 px-3 py-3">
            <div>
              <label className="micro-sm mb-1.5 block text-muted-foreground">Account</label>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.currency !== "CAD" ? ` (${a.currency})` : ""}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="micro-sm mb-1.5 block text-muted-foreground">
                Statement closing date
              </label>
              <DateField
                value={statementDate}
                onChange={setStatementDate}
                clearable={false}
                aria-label="Statement closing date"
              />
            </div>

            <div>
              <label className="micro-sm mb-1.5 block text-muted-foreground">
                Closing balance on that date
              </label>
              <Input
                type="number"
                inputMode="decimal"
                value={statementBalance}
                onChange={(e) => setStatementBalance(e.target.value)}
                placeholder="0.00"
              />
              <Micro className="mt-1 block">
                {account?.type === "credit_card"
                  ? "How much you owed on the card — a positive number."
                  : "Straight off the statement."}
              </Micro>
            </div>
          </div>
        </Panel>

        {/* The optional half that does the heavy lifting. */}
        <Panel>
          <PanelHead
            title="Statement file (optional)"
            action={
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="micro-sm tap-press flex items-center gap-1 border-2 border-rule bg-surface px-2 py-1 transition-colors hover:bg-foreground hover:text-background"
              >
                <FileUp className="size-3" strokeWidth={2.5} />
                Choose file
              </button>
            }
          />
          <div className="px-3 py-3">
            {csvHeaders.length === 0 ? (
              <Micro>
                Download your statement as a CSV from your bank and drop it in — the app will
                tick off everything that matches and show you what you forgot to log. Without
                it you can still tick things off by hand.
              </Micro>
            ) : bankRows ? (
              <p className="flex items-center gap-2 text-sm">
                <Check className="size-4 text-ok" strokeWidth={3} />
                {bankRows.length} lines read.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <Micro>Which column is which?</Micro>
                <div className="grid grid-cols-2 gap-2">
                  <ColumnPicker
                    label="Date"
                    headers={csvHeaders}
                    value={mapping?.dateCol ?? 0}
                    onChange={(v) => setMapping((m) => (m ? { ...m, dateCol: v } : m))}
                  />
                  <ColumnPicker
                    label="Description"
                    headers={csvHeaders}
                    value={mapping?.descriptionCol ?? 1}
                    onChange={(v) => setMapping((m) => (m ? { ...m, descriptionCol: v } : m))}
                  />
                  <ColumnPicker
                    label="Amount"
                    headers={csvHeaders}
                    value={mapping?.amountCol ?? -1}
                    onChange={(v) =>
                      setMapping((m) => (m ? { ...m, amountCol: v === -1 ? null : v } : m))
                    }
                    allowNone
                  />
                  <ColumnPicker
                    label="Or money out"
                    headers={csvHeaders}
                    value={mapping?.debitCol ?? -1}
                    onChange={(v) =>
                      setMapping((m) => (m ? { ...m, debitCol: v === -1 ? null : v } : m))
                    }
                    allowNone
                  />
                  {/* Banks that split money out into its own column split
                      money in the same way. The row-reading code always knew
                      how to use this column — the picker for it was just
                      missing, so deposits vanished unless the auto-guess
                      happened to find the header. */}
                  <ColumnPicker
                    label="Or money in"
                    headers={csvHeaders}
                    value={mapping?.creditCol ?? -1}
                    onChange={(v) =>
                      setMapping((m) => (m ? { ...m, creditCol: v === -1 ? null : v } : m))
                    }
                    allowNone
                  />
                </div>
                <Button type="button" variant="outline" onClick={buildBankRows}>
                  Read it
                </Button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsv}
              className="hidden"
            />
          </div>
        </Panel>

        {error && (
          <p className="border-2 border-destructive px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <Button block size="lg" disabled={loading || !statementBalance} onClick={startMatching}>
          {loading ? "Working…" : "Compare"}
        </Button>
      </div>
    );
  }

  // ---------------- Step 2: matching ----------------

  const missing = (match?.missingFromApp ?? []).filter((b) => !addedKeys.has(b.key));
  const unticked = transactions.filter((t) => !cleared[t.id]);

  return (
    <div className="flex flex-col gap-4">
      <StatStrip columns={3}>
        <Stat label="Bank says" value={formatCents(statementBalanceCents, data?.currency)} />
        <Stat label="App says" value={formatCents(appBalanceCents, data?.currency)} />
        <Stat
          label="Difference"
          value={formatCents(differenceCents, data?.currency)}
          tone={differenceCents === 0 ? "ok" : "alert"}
          sub={differenceCents === 0 ? "they match" : "still to explain"}
        />
      </StatStrip>

      {data && data.countAfterDate > 0 && (
        <p className="hatch border-2 border-rule px-3 py-2">
          <Micro>
            {data.countAfterDate} transaction{data.countAfterDate === 1 ? " is" : "s are"} dated
            after {statementDate} and {data.countAfterDate === 1 ? "isn't" : "aren't"} counted
            here — they belong to next month&rsquo;s statement.
          </Micro>
        </p>
      )}

      {/* Lines the parser can read two ways. Held back rather than dropped —
          a statement line missing from a reconcile leaves a difference with no
          explanation, which is the one thing this screen exists to prevent. */}
      {pendingRows.length > 0 && (
        <Panel tone="raised">
          <PanelHead
            title="Need a decision"
            count={pendingRows.length}
          />
          <p className="border-b border-hairline px-3 py-2 text-xs text-muted-foreground">
            Your bank wrote these amounts in a way that could mean two different numbers.
            Pick the real one and the line joins the statement; skip it and it stays out.
          </p>
          <ul>
            {pendingRows.map((row, i) => (
              <li key={row.key} className={cn("px-3 py-2.5", i > 0 && "border-t border-hairline")}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {row.description || "(no description)"}
                  </span>
                  <Micro>{row.date}</Micro>
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  file says: {row.raw} · {row.isIncome ? "money in" : "money out"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.readings.map((reading) => (
                    <button
                      key={reading.cents}
                      type="button"
                      onClick={() => {
                        setBankRows((prev) => [
                          ...(prev ?? []),
                          {
                            key: row.key,
                            date: row.date,
                            description: row.description,
                            amountCents: reading.cents,
                            isIncome: row.isIncome,
                          },
                        ]);
                        setPendingRows((prev) => prev.filter((r) => r.key !== row.key));
                      }}
                      className="tap-press border-2 border-rule bg-surface px-3 py-2 text-sm font-semibold tabular transition-colors hover:bg-muted"
                    >
                      ${reading.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPendingRows((prev) => prev.filter((r) => r.key !== row.key))}
                    className="tap-press border-2 border-hairline px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
                  >
                    Leave it out
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {unreadableCount > 0 && (
        <p className="hatch border-2 border-rule px-3 py-2">
          <Micro>
            {unreadableCount} line{unreadableCount === 1 ? "" : "s"} in your file had no
            readable amount at all and {unreadableCount === 1 ? "was" : "were"} left out.
          </Micro>
        </p>
      )}

      {/* The mirror image of the message above, for the STATEMENT side. These
          rows used to be dropped in silence, which made the file look shorter
          than it was and the difference harder to explain. */}
      {skippedAfterDate > 0 && (
        <p className="hatch border-2 border-rule px-3 py-2">
          <Micro>
            {skippedAfterDate} row{skippedAfterDate === 1 ? "" : "s"} in your file{" "}
            {skippedAfterDate === 1 ? "is" : "are"} dated after {statementDate} and{" "}
            {skippedAfterDate === 1 ? "was" : "were"} left out — they belong to next
            month&rsquo;s statement.
          </Micro>
        </p>
      )}

      {/* What the bank has and the app doesn't. The valuable list. */}
      {bankRows && (
        <Panel>
          <PanelHead
            title="On the statement, not in the app"
            count={missing.length > 0 ? missing.length : undefined}
          />
          {missing.length === 0 ? (
            <PanelEmpty>Nothing missing — everything on the statement is logged.</PanelEmpty>
          ) : (
            <ul>
              {missing.map((b, i) => (
                <li key={b.key} className={cn("px-3 py-2.5", i > 0 && "border-t border-hairline")}>
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{b.description || "—"}</p>
                      <Micro className="block">{b.date}</Micro>
                    </div>
                    <span className={cn("shrink-0 text-sm font-bold tabular", b.isIncome && "text-ok")}>
                      {b.isIncome ? "+" : "−"}
                      {formatCents(b.amountCents, data?.currency)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Select
                      value={rowCategory[b.key] ?? ""}
                      onChange={(e) =>
                        setRowCategory((prev) => ({ ...prev, [b.key]: e.target.value }))
                      }
                      className="h-8 flex-1 text-xs"
                    >
                      <option value="">Pick a category…</option>
                      {(data?.categories ?? [])
                        .filter((c: Category) => c.kind === (b.isIncome ? "income" : "expense"))
                        .map((c: Category) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => addRow(b)}>
                      Add it
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {/* Everything logged, ticked where the statement confirms it. */}
      <Panel>
        <PanelHead
          title="Your transactions"
          count={`${clearedIds.length}/${transactions.length}`}
          action={
            <button
              type="button"
              onClick={() => {
                const all: Record<string, boolean> = {};
                const allOn = clearedIds.length === transactions.length;
                for (const t of transactions) all[t.id] = !allOn;
                setCleared(all);
              }}
              className="micro-sm tap-press border-2 border-rule bg-surface px-2 py-1 transition-colors hover:bg-foreground hover:text-background"
            >
              {clearedIds.length === transactions.length ? "None" : "All"}
            </button>
          }
        />
        {transactions.length === 0 ? (
          <PanelEmpty>Nothing logged against this account up to that date.</PanelEmpty>
        ) : (
          <ul>
            {transactions.map((t, i) => (
              <li
                key={t.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5",
                  i > 0 && "border-t border-hairline",
                  !cleared[t.id] && bankRows && "bg-warn/10"
                )}
              >
                <button
                  type="button"
                  onClick={() => setCleared((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
                  aria-pressed={Boolean(cleared[t.id])}
                  aria-label={`Confirm ${t.merchant ?? "transaction"}`}
                  className={cn(
                    "tap-press flex size-6 shrink-0 items-center justify-center border-2 border-rule",
                    cleared[t.id] ? "bg-foreground text-background" : "bg-surface"
                  )}
                >
                  {cleared[t.id] && <Check className="size-3.5" strokeWidth={3.5} />}
                </button>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{t.merchant || "Transaction"}</p>
                  <Micro className="block">{t.txn_date}</Micro>
                </div>

                <span className={cn("shrink-0 text-sm font-bold tabular", t.is_income && "text-ok")}>
                  {t.is_income ? "+" : "−"}
                  {formatCents(t.amount_cents, data?.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {bankRows && unticked.length > 0 && (
        <p className="flex items-start gap-2 border-2 border-warn px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            {unticked.length} logged transaction{unticked.length === 1 ? "" : "s"} didn&rsquo;t
            appear on the statement. That&rsquo;s normal for something very recent, but if
            it&rsquo;s older it may have been logged twice or never actually gone through.
          </span>
        </p>
      )}

      {error && (
        <p className="border-2 border-destructive px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="flex flex-col gap-2">
        {differenceCents === 0 ? (
          <Button block size="lg" disabled={loading} onClick={() => finish(false)}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Everything matches — finish"}
          </Button>
        ) : (
          <>
            <Button block size="lg" disabled={loading} onClick={() => finish(true)}>
              {loading
                ? "Working…"
                : `Correct by ${formatCents(Math.abs(differenceCents), data?.currency)} and finish`}
            </Button>
            <Micro className="text-center">
              This adds one transaction called &ldquo;Balance adjustment&rdquo; so the app matches
              the bank. It shows up in your ledger like anything else.
            </Micro>
            <Button block variant="outline" disabled={loading} onClick={() => finish(false)}>
              Finish without correcting
            </Button>
          </>
        )}
        <Button block variant="ghost" onClick={() => setStep("setup")}>
          Back
        </Button>
      </div>
    </div>
  );
}

function ColumnPicker({
  label,
  headers,
  value,
  onChange,
  allowNone = false,
}: {
  label: string;
  headers: string[];
  value: number;
  onChange: (value: number) => void;
  allowNone?: boolean;
}) {
  return (
    <div>
      <label className="micro-sm mb-1 block text-muted-foreground">{label}</label>
      <Select
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 text-xs"
      >
        {allowNone && <option value="-1">—</option>}
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function ReconcileHistory({
  history,
}: {
  history: { id: string; account_name: string; statement_date: string; difference_cents: number }[];
}) {
  if (history.length === 0) return null;
  return (
    <Panel>
      <PanelHead title="Previous checks" count={history.length} />
      <ul>
        {history.map((r, i) => (
          <li
            key={r.id}
            className={cn(
              "flex items-center justify-between gap-3 px-3 py-2.5 text-sm",
              i > 0 && "border-t border-hairline"
            )}
          >
            <span className="min-w-0 truncate">
              {r.account_name}
              <Micro className="ml-2">{r.statement_date}</Micro>
            </span>
            {r.difference_cents === 0 ? (
              <Tag tone="ok">Matched</Tag>
            ) : (
              <Tag tone="warn">Off by {formatCents(Math.abs(r.difference_cents))}</Tag>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
