"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { formatCents } from "@/lib/finance/money";
import { parseCsv, guessColumns, normalizeCsvDate, type ColumnGuess } from "@/lib/finance/csv-parser";
import type { Account, Category } from "@/lib/finance/types";
import { buildCsvCandidates, importCsvTransactions, type CsvCandidateRow } from "@/app/(app)/money/csv-actions";

type Step = "upload" | "mapping" | "review" | "done";

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

  function reset() {
    setStep("upload");
    setHeaders([]);
    setRawRows([]);
    setCandidates([]);
    setSelected({});
    setRowCategory({});
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

    const parsedRows: { date: string; description: string; amountCents: number; isIncome: boolean }[] = [];
    for (const row of rawRows) {
      const date = normalizeCsvDate(row[mapping.dateCol] ?? "");
      const description = (row[mapping.descriptionCol] ?? "").trim();
      if (!date || !description) continue;

      let amountCents: number | null = null;
      let isIncome = false;
      if (useDebitCredit) {
        const debitRaw = mapping.debitCol !== null ? row[mapping.debitCol]?.trim() : "";
        const creditRaw = mapping.creditCol !== null ? row[mapping.creditCol]?.trim() : "";
        if (debitRaw) {
          amountCents = Math.round(Math.abs(Number(debitRaw.replace(/[^0-9.-]/g, ""))) * 100);
          isIncome = false;
        } else if (creditRaw) {
          amountCents = Math.round(Math.abs(Number(creditRaw.replace(/[^0-9.-]/g, ""))) * 100);
          isIncome = true;
        }
      } else if (mapping.amountCol !== null) {
        const raw = Number((row[mapping.amountCol] ?? "").replace(/[^0-9.-]/g, ""));
        if (!Number.isNaN(raw)) {
          amountCents = Math.round(Math.abs(raw) * 100);
          isIncome = raw > 0;
        }
      }
      if (amountCents === null || Number.isNaN(amountCents) || amountCents <= 0) continue;
      parsedRows.push({ date, description, amountCents, isIncome });
    }

    if (parsedRows.length === 0) {
      setLoading(false);
      setError("None of the rows could be read with this column mapping — check your choices above.");
      return;
    }

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
    toast.success(`Imported ${result.imported ?? 0} transactions`);
  }

  function categoriesFor(isIncome: boolean) {
    return categories.filter((c) => c.kind === (isIncome ? "income" : "expense"));
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Import from CSV</h2>

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
              <select
                value={mapping.dateCol}
                onChange={(e) => setMapping((m) => ({ ...m, dateCol: Number(e.target.value) }))}
                className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Description column
              <select
                value={mapping.descriptionCol}
                onChange={(e) => setMapping((m) => ({ ...m, descriptionCol: Number(e.target.value) }))}
                className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h}
                  </option>
                ))}
              </select>
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
                <select
                  value={mapping.debitCol ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, debitCol: e.target.value === "" ? null : Number(e.target.value) }))}
                  className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                >
                  <option value="">—</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Credit column
                <select
                  value={mapping.creditCol ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, creditCol: e.target.value === "" ? null : Number(e.target.value) }))}
                  className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                >
                  <option value="">—</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <label className="text-xs">
              Amount column (negative = expense, positive = income)
              <select
                value={mapping.amountCol ?? ""}
                onChange={(e) => setMapping((m) => ({ ...m, amountCol: e.target.value === "" ? null : Number(e.target.value) }))}
                className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
              >
                <option value="">—</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="text-xs">
            Which account is this?
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="mt-1 h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
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

      {step === "review" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {candidates.length} rows — {candidates.filter((c) => c.isDuplicate).length} look like duplicates and are
            unchecked. Review and pick a category for each row you want to import.
          </p>
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {candidates.map((c) => (
              <div key={c.tempId} className="rounded-lg border border-border bg-surface p-2">
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
                <select
                  value={rowCategory[c.tempId] ?? ""}
                  onChange={(e) => setRowCategory((prev) => ({ ...prev, [c.tempId]: e.target.value }))}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-xs"
                >
                  <option value="">Pick a category…</option>
                  {categoriesFor(c.isIncome).map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={reset}>
              Cancel
            </Button>
            <Button type="button" className="flex-1" disabled={loading} onClick={handleImport}>
              {loading ? "Importing…" : `Import ${Object.values(selected).filter(Boolean).length} transactions`}
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
