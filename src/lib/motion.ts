import type { Transition, Variants } from "framer-motion";

// The one shared set of Framer Motion specs for this app (SPEC.md Part C:
// "smooth, fast (150-250ms), never bouncy or gimmicky. List items animate in
// with subtle stagger.") — extracted from the pattern already proven good in
// tasks/task-list.tsx and shopping/shopping-list.tsx so every other module
// uses the exact same feel instead of reinventing durations/easings.

export const LIST_ITEM_TRANSITION: Transition = { duration: 0.18 };

export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: -6 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96 },
};

// Wrap a list's container in this (initial="hidden" animate="visible") and
// give each child listItemVariants for the "subtle stagger" effect on
// page load, without each module hand-tuning its own stagger delay.
export const staggerContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.035 },
  },
};

export const fadeInUpVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22 } },
};

// A gentle scale+fade for dialogs/sheets appearing — same 150-250ms band.
export const popInVariants: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.16 } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.12 } },
};

export const PAGE_TRANSITION: Transition = { duration: 0.2, ease: [0.4, 0, 0.2, 1] };
