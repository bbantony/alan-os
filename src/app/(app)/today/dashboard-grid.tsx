"use client";

import { motion } from "framer-motion";
import { staggerContainerVariants } from "@/lib/motion";

// Direct motion children (DashboardWidget, DayPlannerCard) share
// fadeInUpVariants and have no initial/animate of their own — they inherit
// this container's "hidden"->"visible" transition, giving the whole
// dashboard grid a subtle staggered entrance instead of popping in at once.
export function DashboardGrid({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      variants={staggerContainerVariants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}
