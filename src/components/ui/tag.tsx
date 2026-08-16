import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The app's one chip. Every status, category, count badge and inline marker is
 * this — a small squared block in the metadata register.
 *
 * The tone list is deliberately semantic rather than decorative. `alert` always
 * means "this is late or over", `ok` always means "this is done or under", and
 * neither changes meaning when the palette changes — which is why they come
 * from the semantic tokens in globals.css and not from the theme accent.
 */
export function Tag({
  children,
  tone = "default",
  filled = false,
  className,
}: {
  children: ReactNode;
  tone?: "default" | "primary" | "accent" | "alert" | "ok" | "warn";
  /** Solid block instead of an outline. Reserve for the one thing that matters. */
  filled?: boolean;
  className?: string;
}) {
  const color = {
    default: "text-muted-foreground border-hairline",
    primary: "text-primary border-primary",
    accent: "text-accent border-accent",
    alert: "text-destructive border-destructive",
    ok: "text-ok border-ok",
    warn: "text-warn border-warn",
  }[tone];

  const solid = {
    default: "bg-muted text-foreground border-rule",
    primary: "bg-primary text-primary-foreground border-primary",
    accent: "bg-accent text-accent-foreground border-accent",
    alert: "bg-destructive text-destructive-foreground border-destructive",
    ok: "bg-ok text-ok-foreground border-ok",
    warn: "bg-warn text-warn-foreground border-warn",
  }[tone];

  return (
    <span
      className={cn(
        "micro-sm inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5",
        filled ? solid : color,
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * A bare metadata label with no frame — for units, timestamps and counts that
 * sit next to content rather than marking it.
 */
export function Micro({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("micro-sm text-muted-foreground", className)}>{children}</span>;
}
