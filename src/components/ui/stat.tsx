import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * A single reading on the instrument panel: a metadata label, a large tabular
 * value, and optionally a meter and a sub-line.
 *
 * `href` is the important prop. Alan's brief put "page connectivity and process
 * flow" above everything else, and this is where most of that lives: every
 * number the dashboard shows is a door into the module that produced it, so
 * seeing something is always one tap from acting on it. A Stat without an href
 * should be the exception, not the norm.
 */
export function Stat({
  label,
  value,
  unit,
  sub,
  meter,
  href,
  tone = "default",
  size = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  /** Rendered small and tight against the value — "%", "kg", "items". */
  unit?: string;
  sub?: ReactNode;
  /** 0-1. Renders a squared-off progress meter under the value. */
  meter?: number;
  href?: string;
  tone?: "default" | "invert" | "alert" | "ok";
  size?: "default" | "lg";
  className?: string;
}) {
  const clamped =
    meter === undefined ? undefined : Math.max(0, Math.min(1, meter));

  const body = (
    <>
      <span
        className={cn(
          "micro-sm",
          tone === "invert" ? "text-background/60" : "text-muted-foreground"
        )}
      >
        {label}
      </span>

      <span className="flex items-baseline gap-1">
        <span
          className={cn(
            "stat",
            size === "lg" ? "text-4xl md:text-5xl" : "text-2xl md:text-3xl",
            tone === "alert" && "text-destructive",
            tone === "ok" && "text-ok"
          )}
        >
          {value}
        </span>
        {unit && (
          <span
            className={cn(
              "micro-sm",
              tone === "invert" ? "text-background/60" : "text-muted-foreground"
            )}
          >
            {unit}
          </span>
        )}
      </span>

      {clamped !== undefined && (
        <span
          className={cn(
            "block h-2 w-full border",
            tone === "invert" ? "border-background/30" : "border-rule"
          )}
        >
          <span
            className={cn(
              "block h-full",
              tone === "alert" ? "bg-destructive" : "bg-primary"
            )}
            style={{ width: `${clamped * 100}%` }}
          />
        </span>
      )}

      {sub && (
        <span
          className={cn(
            "text-xs leading-tight",
            tone === "invert" ? "text-background/70" : "text-muted-foreground"
          )}
        >
          {sub}
        </span>
      )}
    </>
  );

  const shell = cn(
    "flex min-w-0 flex-col justify-start gap-1.5 p-3",
    tone === "invert" ? "bg-foreground text-background" : "bg-surface",
    href && "tap-press transition-colors",
    href && tone !== "invert" && "hover:bg-muted",
    className
  );

  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}

/**
 * A row of Stats sharing one frame, divided by hairlines rather than gaps —
 * so the strip reads as a single gauge cluster instead of a handful of loose
 * tiles. Collapses to two columns on a phone.
 *
 * The dividers are the grid's own `gap` showing the container's background
 * through, rather than borders on the children. That's deliberate: with
 * borders, a strip whose items wrap onto a second row leaves a doubled line
 * against the frame at whichever edge the wrap lands on, and the fix has to
 * change every time the column count does. Gap-as-divider is correct at any
 * item count and any breakpoint with no per-child nth-child arithmetic.
 */
export function StatStrip({
  children,
  columns = 3,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-px border-2 border-rule bg-hairline",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-2 sm:grid-cols-3",
        columns === 4 && "grid-cols-2 sm:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}
