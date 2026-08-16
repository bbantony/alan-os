"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "@/components/theme/theme-provider";

/**
 * The one page transition, used on every route change in the app.
 *
 * Previously a Framer fade-and-rise inside `AnimatePresence mode="wait"`. Two
 * things were wrong with it: it read as soft and organic in an app where
 * nothing else does, and `mode="wait"` held the new page back until the old
 * one had finished leaving — so every navigation cost an extra beat before
 * anything appeared.
 *
 * Now it's a wipe (see globals.css): a hard vertical edge crosses the screen
 * and the new page is revealed behind it. Pure CSS keyed on the pathname, so
 * the new page starts painting immediately, there's no exit delay, and the
 * whole thing is compositor-driven rather than running through React on every
 * frame.
 *
 * The edge is a sibling of the content, not a child — the content animates
 * `clip-path`, which would otherwise clip a fixed-position child to the very
 * region being revealed.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme } = useTheme();
  const reduced = theme.motion === "reduced";

  if (reduced) return <>{children}</>;

  return (
    <>
      <span key={`edge-${pathname}`} className="wipe-edge" aria-hidden="true" />
      <div key={`page-${pathname}`} className="page-enter">
        {children}
      </div>
    </>
  );
}
