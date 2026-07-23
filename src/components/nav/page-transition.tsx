"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "@/components/theme/theme-provider";
import { PAGE_TRANSITION } from "@/lib/motion";

// The "more animation" the owner asked for, applied everywhere at once:
// every route change gets a brief fade + rise instead of an instant hard
// cut. Respects the Settings -> Appearance "Motion: Reduced" preference —
// that CSS override (globals.css) only catches transition/animation-duration,
// not Framer Motion's own animation engine, so it's checked explicitly here.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme } = useTheme();
  const reduced = theme.motion === "reduced";

  if (reduced) return <>{children}</>;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={PAGE_TRANSITION}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
