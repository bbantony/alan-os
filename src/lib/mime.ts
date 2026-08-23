/**
 * File-extension guesses from a MIME type.
 *
 * A five-line function is not usually worth its own module. This one is,
 * because it had two byte-identical private copies — in `money/receipt-actions`
 * and in `settings/account/account-actions` — and both are used to build a
 * STORAGE PATH. Two copies of a path-building rule is how you end up with a
 * bucket where half the receipts are `.jpg` and half are `.jpeg`, which nothing
 * warns you about until something tries to find a file by name.
 *
 * Deliberately not in `lib/images.ts`: that module is browser-only (it needs
 * `document`, `Image` and canvas) and these are server actions.
 */
export function extForMimeType(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}
