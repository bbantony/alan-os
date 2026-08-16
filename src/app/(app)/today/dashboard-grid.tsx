"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { fadeInUpVariants, staggerContainerVariants } from "@/lib/motion";

// The dashboard's entrance. Bands appear in reading order, top to bottom,
// which is the same order the screen wants to be read in — so the animation
// teaches the layout rather than just decorating it.
//
// Framer Motion propagates variants through React context, not the DOM tree,
// so a `<Reveal>` nested inside plain wrapper divs still inherits this
// container's hidden -> visible transition and its stagger position.
export function DashboardGrid({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="flex flex-col gap-4"
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

/**
 * Wraps a band of the dashboard so it takes part in the stagger. Exists
 * because the page itself is a Server Component and can't render a
 * `motion.div` directly.
 */
export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={fadeInUpVariants} className={className}>
      {children}
    </motion.div>
  );
}
