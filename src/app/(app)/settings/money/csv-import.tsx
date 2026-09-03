"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { Micro } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/finance/money";
import {
  parseCsv,
  guessColumns,
  normalizeCsvDate,
  readCsvAmount,
  type AmountReading,
  type ColumnGuess,
} from "@/lib/finance/csv-parser";
import type { Account, Category } from "@/lib/finance/types";
import { buildCsvCandidates, importCsvTransactions, type CsvCandidateRow } from "@/app/(app)/money/csv-actions";

type Step = "upload" | "mapping" | "confirm" | "review" | "done";

/**
 * A row whose amount can be read more than one way.
 *
 * These used to be dropped. Alan's instruction when asked: import what can be
 * read and "the rest it prompts me to confirm — reconciliation is the whole
 * purpose of this in the first place". A row missing from a reconcile leaves a
 * difference that cannot be explained, which is worse than two seconds of
 * confirming.
 */
interface PendingRow {
  key: string;
  date: string;
  description: string;
  raw: string;
  isIncome: boolean;
  readings: AmountReading[];
}

export function CsvImport({ accounts, categories }: { accounts: Account[]; categories: Category[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnGuess>({ dateCol: 0, descriptionCol: 1, amountCol: null, debitCol: null, creditCol: null });
  const [useDebitCredit, setUseDebitCredit] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [candidates, setCandidates] = useState<CsvCandidateRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [rowCategory, setRowCategory] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  /** Rows waiting on a decision, and the decision once made. */
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [resolved, setResolved] = useState<Record<string, number>>({});
  /** Rows that were not a number at all, reported rather than dropped. */
  const [unreadableCount, setUnreadableCount] = useState(0);
  const [certainRows, setCertainRows] = useState<
    { date: string; description: string; amountCents: number; isIncome: boolean }[]
  >([]);

  function reset() {
    setStep("upload");
    setHeaders([]);
    setRawRows([]);
    setCandidates([]);
    setSelected({});
    setRowCategory({});
    setPending([]);
    setResolved({});
    setUnreadableCount(0);
    setCertainRows([]);
    setError(null);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const { headers: h, rows } = parseCsv(text);
      if (h.length === 0 || rows.length === 0) {
        setError("Couldn't find any rows in that file.");
        return;
      }
      setHeaders(h);
      setRawRows(rows);
      const guess = guessColumns(h);
      setMapping(guess);
      setUseDebitCredit(guess.amountCol === null && guess.debitCol !== null);
      setStep("mapping");
    };
    reader.readAsText(file);
  }

  async function handleBuildCandidates() {
    setLoading(true);
    setError(null);

    const certain: { date: string; description: string; amountCents: number; isIncome: boolean }[] = [];
    const ask: PendingRow[] = [];
    let unreadable = 0;

    for (const [i, row] of rawRows.entries()) {
      const date = normalizeCsvDate(row[mapping.dateCol] ?? "");
      const description = (row[mapping.descriptionCol] ?? "").trim();
      if (!date || !description) continue;

      // A debit column is money OUT and a credit column money IN whatever sign
      // the bank wrote, so only the magnitude comes from the parser.
      let raw = "";
      let forcedDirection: boolean | null = null;
      if (useDebitCredit) {
        const debitRaw = mapping.debitCol !== null ? (row[mapping.debitCol] ?? "").trim() : "";
        const creditRaw = mapping.creditCol !== null ? (row[mapping.creditCol] ?? "").trim() : "";
        if (debitRaw) {
          raw = debitRaw;
          forcedDirection = false;
        } else if (creditRaw) {
          raw = creditRaw;
          forcedDirection = true;
        }
      } else if (mapping.amountCol !== null) {
        raw = row[mapping.amountCol] ?? "";
      }
      if (!raw.trim()) continue;

      const read = readCsvAmount(raw);
      if (read.kind === "ok") {
        certain.push({
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

    setUnreadableCount(unreadable);

    if (certain.length === 0 && ask.length === 0) {
      setLoading(false);
      setError("None of the rows could be read with this column mapping — check your choices above.");
      return;
    }

    // Anything needing a decision goes to its own step first. Nothing is
    // dropped on the way through.
    if (ask.length > 0) {
      setCertainRows(certain);
      setPending(ask);
      setResolved({});
      setLoading(false);
      setStep("confirm");
      return;
    }

    await continueToReview(certain);
  }

  /** Merges the confirmed rows back in and carries on to the review list. */
  async function continueToReview(
    rows: { date: string; description: string; amountCents: number; isIncome: boolean }[]
  ) {
    setLoading(true);
    setError(null);
    const parsedRows = rows;

    const result = await buildCsvCandidates({ rows: parsedRows });
    setLoading(false);
    if (result.error || !result.candidates) {
      setError(result.error ?? "Something went wrong reading that file.");
      return;
    }
    setCandidates(result.candidates);
    const initialSelected: Record<string, boolean> = {};
    const initialCategory: Record<string, string> = {};
    for (const c of result.candidates) {
      initialSelected[c.tempId] = !c.isDuplicate;
      if (c.suggestedCategoryId) initialCategory[c.tempId] = c.suggestedCategoryId;
    }
    setSelected(initialSelected);
    setRowCategory(initialCategory);
    setStep("review");
  }

  async function handleImport() {
    const rows = candidates
      .filter((c) => selected[c.tempId] && rowCategory[c.tempId])
      .map((c) => ({
        txnDate: c.txnDate,
        merchant: c.merchant,
        amountCents: c.amountCents,
        isIncome: c.isIncome,
        categoryId: rowCategory[c.tempId],
      }));
    if (rows.length === 0) {
      setError("Pick a category for at least one row you want to import.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await importCsvTransactions({ accountId, rows });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setImportedCount(result.imported ?? 0);
    setStep("done");
    if (result.skipped) {
      toast.success(
        `Imported ${result.imported ?? 0} transactions — ${result.skipped} couldn't be matched to your categories and ${result.skipped === 1 ? "was" : "were"} skipped`
      );
    } else {
      toast.success(`Imported ${result.imported ?? 0} transactions`);
    }
  }

  function categoriesFor(isIncome: boolean) {
    return categories.filter((c) => c.kind === (isIncome ? "income" : "expense"));
  }

  // What the Import button must count: exactly the rows handleImport sends —
  // ticked AND given a category. Ticked rows without one are skipped, and
  // that gets said out loud next to the button rather than discovered later.
  const importableCount = candidates.filter((c) => selected[c.tempId] && rowCategory[c.tempId]).length;
  const uncategorisedCount = candidates.filter((c) => selected[c.tempId] && !rowCategory[c.tempId]).length;

  return (
    <div className="space-y-3 border-t-2 border-rule pt-4">
      <h2 className="micro text-muted-foreground">Import from CSV</h2>

      {step === "upload" && (
        <div>
          <p className="mb-2 text-sm text-muted-foreground">
            Upload a bank statement export (.csv) to bulk-import transactions.
          </p>
          <Button type="button" variant="outline" className="gap-1.5" onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" />
            Choose file
          </Button>
          <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
        </div>
      )}

      {step === "mapping" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {rawRows.length} rows found. Confirm which columns are which — best guesses are pre-filled.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              Date column
              <Select
                value={mapping.dateCol}
                onChange={(e) => setMapping((m) => ({ ...m, dateCol: Number(e.target.value) }))}
                className="mt-1 h-8 w-full border-2 border-rule bg-transparent px-2 text-sm"
              >
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs">
              Description column
              <Select
                value={mapping.descriptionCol}
                onChange={(e) => setMapping((m) => ({ ...m, descriptionCol: Number(e.target.value) }))}
                className="mt-1 h-8 w-full border-2 border-rule bg-transparent px-2 text-sm"
              >
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={useDebitCredit} onChange={(e) => setUseDebitCredit(e.target.checked)} />
            This file has separate Debit and Credit columns (instead of one signed Amount column)
          </label>

          {useDebitCredit ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">
                Debit column
                <Select
                  value={mapping.debitCol ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, debitCol: e.target.value === "" ? null : Number(e.target.value) }))}
                  className="mt-1 h-8 w-full border-2 border-rule bg-transparent px-2 text-sm"
                >
                  <option value="">—</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-xs">
                Credit column
                <Select
                  value={mapping.creditCol ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, creditCol: e.target.value === "" ? null : Number(e.target.value) }))}
                  className="mt-1 h-8 w-full border-2 border-rule bg-transparent px-2 text-sm"
                >
                  <option value="">—</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          ) : (
            <label className="text-xs">
              Amount column (negative = expense, positive = income)
              <Select
                value={mapping.amountCol ?? ""}
                onChange={(e) => setMapping((m) => ({ ...m, amountCol: e.target.value === "" ? null : Number(e.target.value) }))}
                className="mt-1 h-8 w-full border-2 border-rule bg-transparent px-2 text-sm"
              >
                <option value="">—</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h}
                  </option>
                ))}
              </Select>
            </label>
          )}

          <label className="text-xs">
            Which account is this?
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="mt-1 h-8">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={reset}>
              Cancel
            </Button>
            <Button type="button" className="flex-1" disabled={loading || !accountId} onClick={handleBuildCandidates}>
              {loading ? "Reading…" : "Continue"}
            </Button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="flex flex-col gap-3">
          <div className="border-2 border-rule bg-surface p-3">
            <p className="text-sm font-semibold">
              {pending.length} row{pending.length === 1 ? "" : "s"} could be read two ways
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your bank wrote these amounts in a format where the comma or dot could be a
              decimal point or a thousands separator. Pick what each one really was — the
              other {certainRows.length} row{certainRows.length === 1 ? "" : "s"} came
              through fine and {certainRows.length === 1 ? "is" : "are"} waiting.
            </p>
          </div>

          <ul className="border-2 border-rule bg-surface">
            {pending.map((row, i) => (
              <li key={row.key} className={cn("p-3", i > 0 && "border-t border-hairline")}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {row.description}
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
                      onClick={() =>
                        setResolved((prev) => ({ ...prev, [row.key]: reading.cents }))
                      }
                      aria-pressed={resolved[row.key] === reading.cents}
                      className={cn(
                        "tap-press border-2 px-3 py-2 text-sm font-semibold tabular transition-colors",
                        resolved[row.key] === reading.cents
                          ? "border-rule bg-foreground text-background"
                          : "border-rule bg-surface hover:bg-muted"
                      )}
                    >
                      ${reading.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setResolved((prev) => ({ ...prev, [row.key]: -1 }))}
                    aria-pressed={resolved[row.key] === -1}
                    className={cn(
                      "tap-press border-2 px-3 py-2 text-sm transition-colors",
                      resolved[row.key] === -1
                        ? "border-rule bg-destructive text-destructive-foreground"
                        : "border-hairline text-muted-foreground hover:bg-muted"
                    )}
                  >
                    Skip this row
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {unreadableCount > 0 && (
            <p className="hatch border-2 border-rule px-3 py-2">
              <Micro>
                {unreadableCount} row{unreadableCount === 1 ? "" : "s"} had no readable amount
                at all and {unreadableCount === 1 ? "was" : "were"} left out.
              </Micro>
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={reset}>
              Start over
            </Button>
            <Button
              block
              disabled={loading || pending.some((r) => resolved[r.key] === undefined)}
              onClick={() => {
                const merged = [...certainRows];
                for (const row of pending) {
                  const cents = resolved[row.key];
                  if (cents === undefined || cents < 0) continue;
                  merged.push({
                    date: row.date,
                    description: row.description,
                    amountCents: cents,
                    isIncome: row.isIncome,
                  });
                }
                merged.sort((a, b) => a.date.localeCompare(b.date));
                void continueToReview(merged);
              }}
            >
              {pending.some((r) => resolved[r.key] === undefined)
                ? `${pending.filter((r) => resolved[r.key] === undefined).length} still to confirm`
                : `Continue with ${
                    certainRows.length +
                    pending.filter((r) => (resolved[r.key] ?? -1) >= 0).length
                  } rows`}
            </Button>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {candidates.length} rows — {candidates.filter((c) => c.isDuplicate).length} look like duplicates and are
            unchecked. Review and pick a category for each row you want to import.
          </p>
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {candidates.map((c) => (
              <div key={c.tempId} className="border-2 border-rule bg-surface p-2">
                <div className="mb-1.5 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected[c.tempId] ?? false}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [c.tempId]: e.target.checked }))}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{c.merchant}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.txnDate} · {c.isIncome ? "+" : "-"}
                      {formatCents(c.amountCents)}
                      {c.isDuplicate && " · possible duplicate"}
                    </p>
                  </div>
                </div>
                <Select
                  value={rowCategory[c.tempId] ?? ""}
                  onChange={(e) => setRowCategory((prev) => ({ ...prev, [c.tempId]: e.target.value }))}
                  className="h-8 w-full border-2 border-rule bg-transparent px-2 text-xs"
                >
                  <option value="">Pick a category…</option>
                  {categoriesFor(c.isIncome).map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* The button promises exactly the set handleImport sends: ticked
              AND categorised. It used to count every ticked row, so "Import
              12" could quietly save 9. */}
          {uncategorisedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {uncategorisedCount === 1
                ? "1 ticked row has no category and will be skipped."
                : `${uncategorisedCount} ticked rows have no category and will be skipped.`}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={reset}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={loading || importableCount === 0}
              onClick={handleImport}
            >
              {loading
                ? "Importing…"
                : `Import ${importableCount} ${importableCount === 1 ? "transaction" : "transactions"}`}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-2">
          <p className="text-sm">Imported {importedCount} transactions.</p>
          <Button type="button" variant="outline" onClick={reset}>
            Import another file
          </Button>
        </div>
      )}
    </div>
  );
}
