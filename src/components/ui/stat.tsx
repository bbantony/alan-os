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
            // CONTAINER query, not a viewport one — @md is 28rem of the
            // StatStrip around this cell, not 768px of the window. See the
            // note on StatStrip below for why; the short version is that since
            // the assistant dock exists, a wide window no longer implies a wide
            // strip, and a 30px money figure in a 109px cell is clipped.
            size === "lg" ? "text-4xl @md:text-5xl" : "text-2xl @md:text-3xl",
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
    // THE STRIP MEASURES ITSELF, NOT THE WINDOW (7 Sep 2026).
    //
    // These were `sm:grid-cols-3` / `md:text-3xl` — viewport breakpoints — and
    // that held right up until the assistant dock (components/nav/assistant-
    // dock.tsx) started taking a column off the right of a wide screen. On the
    // Fold's unfolded inner display the window is ~884px, so every `sm:` and
    // `md:` utility fires, but the page itself is only ~377px wide: three
    // columns of ~109px each, holding a 30px "$1,234.56". Clipped. Unfolding
    // the phone made the Money and Today screens worse, which would have made
    // the whole dock a net loss.
    //
    // An element cannot query its own width, hence the wrapper: it carries
    // `container-type: inline-size` so both the grid below and the `Stat`
    // cells inside it size themselves against the space they were actually
    // given. Safe as a container because nothing inside a Stat is absolutely
    // or fixed-positioned — `container-type` also makes an element a
    // containing block for those, which is the trap with putting it higher up
    // the tree.
    //
    // 28rem for BOTH thresholds, deliberately the same number: below it two
    // columns at the smaller type, above it the full strip. Every real width
    // the app renders at today is unchanged — a phone (343px of strip) still
    // gets two columns and 24px figures, every desktop width (496–624px)
    // still gets the full strip and 30px figures. The one band that moves is a
    // 480–767px window, which now matches what a strip of that width already
    // did on desktop instead of disagreeing with it.
    <div className="@container">
      <div
        className={cn(
          "grid gap-px border-2 border-rule bg-hairline",
          columns === 2 && "grid-cols-2",
          columns === 3 && "grid-cols-2 @md:grid-cols-3",
          columns === 4 && "grid-cols-2 @md:grid-cols-4",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
