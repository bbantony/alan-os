// The routine icon names as DATA, with no React and no lucide-react import.
//
// icon-registry.ts holds the same twelve names mapped to their actual icon
// components, and is typed against this list so the two can never drift apart.
// This file exists separately because two callers need the names without
// needing the pictures: the AI tool layer (`lib/ai/tools.ts` is `server-only`
// and has no business pulling a dozen SVG components into the server bundle
// just to validate a string) and `npm test`, which loads plain .ts files
// directly under node and would choke on a React package.
export const ROUTINE_ICON_NAMES = [
  "Repeat",
  "Droplet",
  "BookOpen",
  "Dumbbell",
  "Moon",
  "Sun",
  "Coffee",
  "Brush",
  "PenLine",
  "Heart",
  "Sparkles",
  "Home",
] as const;

export type RoutineIconName = (typeof ROUTINE_ICON_NAMES)[number];

/** What `getRoutineIcon` falls back to, and what an unknown name becomes. */
export const DEFAULT_ROUTINE_ICON: RoutineIconName = "Repeat";

/**
 * A name that is definitely in the registry.
 *
 * The registry lookup itself already falls back silently, which is right for
 * rendering (a missing picture must never break a screen) and wrong for
 * writing: an unknown name stored on the row is a picture that is wrong
 * forever, on a screen where every other routine's icon means something.
 * Anything coming from outside the app — a model's chosen argument, mostly —
 * goes through here first, so what lands in the database is always a real one.
 */
export function clampRoutineIcon(name: unknown): RoutineIconName {
  if (typeof name !== "string") return DEFAULT_ROUTINE_ICON;
  const trimmed = name.trim();
  const exact = ROUTINE_ICON_NAMES.find((n) => n === trimmed);
  if (exact) return exact;
  // Case-insensitive second pass: "droplet" is unmistakably Droplet, and
  // rejecting it would show a generic loop icon on a watering routine.
  const loose = ROUTINE_ICON_NAMES.find((n) => n.toLowerCase() === trimmed.toLowerCase());
  return loose ?? DEFAULT_ROUTINE_ICON;
}
