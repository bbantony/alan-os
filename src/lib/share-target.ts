/**
 * What a thing shared into Alan OS from another app turns into.
 *
 * `public/manifest.json` declares a `share_target`, so Alan OS now appears in
 * Android's share sheet. A share arrives as a plain GET at `/assistant` with
 * up to three query parameters, and this turns those three into one sentence
 * for the assistant to answer.
 *
 * WHY THREE PARAMETERS FOR ONE THING. The share sheet hands over `title`,
 * `text` and `url`, and almost nothing agrees on which to use. Chrome sharing
 * a page fills `title` and `url`. Most Android apps sharing a link put the URL
 * in `text` and leave `url` empty, because that is what `Intent.EXTRA_TEXT`
 * has always been. Selecting words in a browser and sharing gives `text` with
 * no URL at all. A reader app may send all three. So the manifest sends the
 * shared `text` to `shared` — a parameter of the share's own — and this
 * function folds in whatever else arrived beside it.
 *
 * DELIBERATELY NOT CLEVER, AND DELIBERATELY NOT SENT. It does not fetch the
 * link, summarise it, or guess what Alan wants done with it. What it returns
 * goes into the message BOX, unsent, for him to add a sentence to and press
 * send himself.
 *
 * THAT LAST PART IS A SAFETY RULE, NOT A PREFERENCE, and the first version of
 * this got it wrong. The manifest originally mapped the shared text onto `q`,
 * the parameter `/assistant` has always treated as "already asked" — so
 * sharing a web page auto-asked the assistant, and at Alan's `suggest` setting
 * every non-money write (a task, a shopping item, a workout) runs the moment
 * the model calls it. Words written by a stranger's web page, which Alan had
 * read none of, could therefore cause a write to his data. Sharing something
 * is not asking for anything to be done with it. `unit-reviewer` caught it;
 * the share now uses its own parameter and lands unsent.
 *
 * Pure and dependency-free so `tests/share-target.test.mts` can cover it: the
 * three-way merge is exactly the kind of thing that looks obvious and has an
 * empty-string case in it.
 */
export function questionFromShare(input: {
  /** The shared text — `?shared=`, never `?q=`. See the note above. */
  shared?: string | null;
  url?: string | null;
  title?: string | null;
}): string | null {
  const q = (input.shared ?? "").trim();
  const url = (input.url ?? "").trim();
  const title = (input.title ?? "").trim();

  const parts: string[] = [];
  if (title && title !== q && title !== url) parts.push(title);
  if (q) parts.push(q);
  // Only when the text didn't already carry it. Sharing a link from most
  // Android apps puts the URL in BOTH `text` and `url`, and a question with
  // the same address in it twice reads like a mistake.
  if (url && !q.includes(url)) parts.push(url);

  const question = parts.join(" ").trim();
  return question.length > 0 ? question : null;
}
