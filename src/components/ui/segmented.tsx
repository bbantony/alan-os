"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { MECHANICAL } from "@/lib/motion";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /**
   * Greyed out and unselectable, rather than hidden.
   *
   * Added for "Moved" on the money logger, which is meaningless with only one
   * account. Hiding it would make the control silently change shape depending
   * on data; showing it disabled says the option exists and why it isn't
   * available yet.
   */
  disabled?: boolean;
}

// The app's one tab bar / segmented input, used as a page tab bar (Money,
// Calendar, Workout) and as an inline picker (recurrence presets).
//
// Redesigned from a padded pill with a floating rounded thumb into a single
// framed strip divided by hairlines, where the active segment is a solid ink
// block that slides between cells. The block filling the cell edge-to-edge —
// rather than floating inside padding — is what makes it read as a switch on a
// panel instead of a web toggle.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  // A fresh layoutId per instance — reusing one id across multiple Segmented
  // controls rendered at once would make Framer Motion try to animate the
  // active block between two unrelated components.
  const layoutId = useId();

  return (
    <div
      role="tablist"
      className={cn("grid border-2 border-rule bg-surface", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option, i) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative min-h-9 px-2 py-2 text-center transition-colors duration-100",
              "micro-sm",
              i > 0 && "border-l border-hairline",
              option.disabled && "cursor-not-allowed opacity-40",
              active ? "text-background" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 bg-foreground"
                transition={MECHANICAL}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
