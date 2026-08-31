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

/**
 * One bank-statement amount, turned into whole cents plus a direction.
 *
 * THE BUG THIS EXISTS TO KILL. Both callers used to do
 * `Number(raw.replace(/[^0-9.-]/g, ""))` and then `isIncome = value > 0`.
 * Plenty of banks write a withdrawal in accounting style — `(1,234.56)` — and
 * that strip removes the brackets along with the dollar sign and the commas,
 * leaving `1234.56`. Positive. So every withdrawal on such a statement was
 * imported as money coming IN, and the account balance moved the wrong way by
 * twice the amount. The reconciler had a second, byte-identical copy of the
 * same mistake, where it produced duplicate transactions in the wrong
 * direction instead.
 *
 * Handles, in order: accounting brackets, a trailing minus (`1234.56-`, which
 * several European and older exports use), a leading minus, and a bare number.
 * Returns null for anything that isn't a number at all, so the caller can flag
 * the row rather than silently importing a zero.
 */
export interface ParsedAmount {
  /** Always positive. The direction is `isIncome`, never the sign. */
  cents: number;
  isIncome: boolean;
}

/**
 * One possible reading of an amount the parser cannot settle on its own.
 * `label` is written for a person, not a developer — it goes on a button.
 */
export interface AmountReading {
  cents: number;
  label: string;
}

export type AmountParse =
  | { kind: "ok"; cents: number; isIncome: boolean }
  /**
   * Readable as a number, but genuinely more than one way. NOT dropped: Alan's
   * words when this came up were that "reconciliation is the whole purpose of
   * this in the first place" — a row silently missing from a reconcile is
   * worse than a row he has to spend two seconds confirming, because the
   * difference it leaves behind is unexplainable.
   */
  | { kind: "ambiguous"; isIncome: boolean; readings: AmountReading[] }
  | { kind: "unreadable" };

/** Formats whole cents plainly for a choice button: 123456 -> "1,234.56". */
function centsLabel(cents: number): string {
  return (cents / 100).toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * The full result, including the rows that need a human.
 *
 * `parseCsvAmount` below is the narrow wrapper for callers that only want the
 * certain answers.
 */
export function readCsvAmount(raw: string): AmountParse {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { kind: "unreadable" };

  // Brackets first, because the digit strip below would eat them.
  const bracketed = /^\(.*\)$/.test(trimmed);
  const trailingMinus = /-\s*$/.test(trimmed);
  const leadingMinus = /^\s*-/.test(trimmed);
  const isIncome = !(bracketed || trailingMinus || leadingMinus);

  const digitsOnly = trimmed.replace(/[^0-9]/g, "");
  if (!digitsOnly) return { kind: "unreadable" };

  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");

  // A COMMA AFTER THE LAST DOT is the ambiguous case. `1,234` is a thousands
  // group; `1234,56` is a decimal comma; and there is no way to tell `1,234`
  // from a European `1,234` meaning 1.234 without knowing the bank. Where the
  // group is exactly three digits the thousands reading is overwhelmingly the
  // common one and is taken; anything else is put to the person.
  if (lastComma !== -1 && lastComma > lastDot) {
    const afterComma = trimmed.slice(lastComma + 1).replace(/[^0-9]/g, "");
    if (afterComma.length !== 3) {
      // Reading A: comma is the decimal point -> 1234,56 = 1234.56
      const asDecimal = Math.round(Number(digitsOnly) / Math.pow(10, afterComma.length) * 100);
      // Reading B: comma is a separator -> 1234,56 = 123456
      const asSeparator = Math.round(Number(digitsOnly) * 100);
      const readings: AmountReading[] = [];
      if (asDecimal > 0) readings.push({ cents: asDecimal, label: centsLabel(asDecimal) });
      if (asSeparator > 0 && asSeparator !== asDecimal) {
        readings.push({ cents: asSeparator, label: centsLabel(asSeparator) });
      }
      if (readings.length === 0) return { kind: "unreadable" };
      if (readings.length === 1) {
        return { kind: "ok", cents: readings[0].cents, isIncome };
      }
      return { kind: "ambiguous", isIncome, readings };
    }
  }

  const digits = trimmed.replace(/[^0-9.]/g, "");
  if (!digits || !/\d/.test(digits)) return { kind: "unreadable" };

  // Several dots left means a dot-as-thousands format (`1.234.567`), which is
  // the mirror image of the case above and equally undecidable alone.
  const dotCount = (digits.match(/\./g) ?? []).length;
  if (dotCount > 1) {
    const flat = Math.round(Number(digits.replace(/\./g, "")) * 100);
    const lastGroup = digits.slice(digits.lastIndexOf(".") + 1);
    const asDecimal = Math.round(
      Number(digits.slice(0, digits.lastIndexOf(".")).replace(/\./g, "") + "." + lastGroup) * 100
    );
    const readings: AmountReading[] = [];
    if (asDecimal > 0) readings.push({ cents: asDecimal, label: centsLabel(asDecimal) });
    if (flat > 0 && flat !== asDecimal) readings.push({ cents: flat, label: centsLabel(flat) });
    if (readings.length === 0) return { kind: "unreadable" };
    if (readings.length === 1) return { kind: "ok", cents: readings[0].cents, isIncome };
    return { kind: "ambiguous", isIncome, readings };
  }

  const value = Number(digits);
  if (!Number.isFinite(value)) return { kind: "unreadable" };

  // Rounded to whole cents at the boundary, once — everything downstream is
  // integer cents, per the app's money rule. See lib/finance/money.ts.
  const cents = Math.round(value * 100);
  if (cents <= 0) return { kind: "unreadable" };

  return { kind: "ok", cents, isIncome };
}

/** Only the amounts that can be read one way. Ambiguous rows come back null. */
export function parseCsvAmount(raw: string): ParsedAmount | null {
  const result = readCsvAmount(raw);
  return result.kind === "ok" ? { cents: result.cents, isIncome: result.isIncome } : null;
}
