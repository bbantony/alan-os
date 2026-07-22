"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

// Replaces the broken base-ui Tabs wrapper (src/components/ui/tabs.tsx,
// deleted) and the 4 independent hand-copies of this exact markup that had
// already started to drift (money-shell.tsx, calendar-shell.tsx,
// workout-feed.tsx, reminder-form.tsx's preset picker). Controlled, not tied
// to any specific page's tab state — works equally well as a page tab bar or
// an inline segmented input (e.g. a recurrence-preset picker).
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
  // active-pill between two unrelated components.
  const layoutId = useId();

  return (
    <div
      className={cn("grid gap-1 rounded-lg border border-border bg-muted/40 p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "tap-press relative rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-primary"
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              />
            )}
            <span className="relative z-10">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
