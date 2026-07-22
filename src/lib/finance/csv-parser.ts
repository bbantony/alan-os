// Minimal dependency-free RFC4180-ish CSV parser (handles quoted fields,
// embedded commas/quotes via "" escaping, and CRLF or LF line endings) — bank
// export CSVs are simple enough that a full library isn't worth the dependency.
export function parseCsv(raw: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  function endField() {
    row.push(field);
    field = "";
  }
  function endRow() {
    endField();
    rows.push(row);
    row = [];
  }

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      endField();
      i += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) endRow();

  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0] === ""));
  const [headers, ...dataRows] = nonEmpty;
  return { headers: headers ?? [], rows: dataRows };
}

export interface ColumnGuess {
  dateCol: number;
  descriptionCol: number;
  amountCol: number | null;
  debitCol: number | null;
  creditCol: number | null;
}

// Best-effort header guessing so the review screen can pre-fill sensible
// defaults — the owner can still override any of these before importing.
export function guessColumns(headers: string[]): ColumnGuess {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const claimed = new Set<number>();

  function find(candidates: string[]): number {
    const idx = lower.findIndex((h, i) => !claimed.has(i) && candidates.some((c) => h.includes(c)));
    if (idx !== -1) claimed.add(idx);
    return idx;
  }

  // Order matters: claim the most specific/likely columns first so a header
  // like "Transaction Date" doesn't get grabbed by a looser later search.
  const dateCol = find(["date"]);
  const descriptionCol = find(["description", "merchant", "details", "payee"]);
  const debitCol = find(["debit", "withdrawal"]);
  const creditCol = find(["credit", "deposit"]);
  const amountCol = find(["amount"]);

  return {
    dateCol: dateCol === -1 ? 0 : dateCol,
    descriptionCol: descriptionCol === -1 ? 1 : descriptionCol,
    amountCol: amountCol === -1 ? null : amountCol,
    debitCol: debitCol === -1 ? null : debitCol,
    creditCol: creditCol === -1 ? null : creditCol,
  };
}

// Bank CSV exports vary in date format — handles ISO (YYYY-MM-DD) and North
// American MM/DD/YYYY (what Scotiabank and most Canadian banks export)
// explicitly rather than trusting the ambiguous native Date parser, which
// silently guesses wrong on DD/MM vs MM/DD. Returns null (never a guess) for
// anything else so the caller can flag the row instead of mis-dating it.
export function normalizeCsvDate(raw: string): string | null {
  const trimmed = raw.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return trimmed;

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, mm, dd, yyyy] = slash;
    const month = Number(mm);
    const day = Number(dd);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  return null;
}
