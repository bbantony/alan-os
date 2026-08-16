import type { Transition, Variants } from "framer-motion";

// The one shared set of Framer Motion specs for this app.
//
// Retuned for the "Swiss Instrument" language: movement is mechanical, not
// organic. Things travel on the grid — a short vertical or diagonal slide with
// an ease-out curve and no overshoot — rather than easing softly into place or
// scaling like a bubble. Durations stay inside SPEC.md Part C's 150-250ms band;
// what changed is the *character*, not the speed.
//
// The two concrete changes from the previous set: exits no longer scale down
// (a square that shrinks reads as a soft card, so items now slide out sideways
// along the grid), and the dialog pop no longer scales from 0.97 (it drops in
// from above onto its hard shadow instead).

/** ease-out, no overshoot — the curve everything in the app moves on. */
export const MECHANICAL: Transition = { duration: 0.18, ease: [0.2, 0, 0, 1] };

export const LIST_ITEM_TRANSITION: Transition = MECHANICAL;

export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -12 },
};

// Wrap a list's container in this (initial="hidden" animate="visible") and
// give each child listItemVariants for the "subtle stagger" effect on
// page load, without each module hand-tuning its own stagger delay.
export const staggerContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.03 },
  },
};

export const fadeInUpVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: MECHANICAL },
};

// Dialogs drop in from slightly above and land on their hard shadow.
export const popInVariants: Variants = {
  hidden: { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.16, ease: [0.2, 0, 0, 1] } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.12 } },
};

export const PAGE_TRANSITION: Transition = { duration: 0.18, ease: [0.2, 0, 0, 1] };
