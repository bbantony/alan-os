import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The most common shape in this app: a framed region with a ruled header and a
 * stack of hairline-separated rows. Tasks, shopping, transactions, reminders,
 * accounts, crew sessions — they are all this.
 *
 * The two-weight border rule matters here more than anywhere else. The panel's
 * own frame is the heavy `rule`; the separators *inside* it are `hairline`.
 * Using the heavy weight for both is exactly what turns a brutalist list into
 * visual noise, so this component makes the correct pairing the default and
 * the incorrect one something you'd have to go out of your way to write.
 */
export function Panel({
  children,
  className,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "raised" | "invert";
}) {
  return (
    <section
      className={cn(
        "border-2 border-rule",
        tone === "default" && "bg-surface",
        tone === "raised" && "bg-surface shadow-[var(--shadow-hard-md)]",
        tone === "invert" && "bg-foreground text-background",
        className
      )}
    >
      {children}
    </section>
  );
}

/**
 * A panel's header strip. `count` renders on the right in the metadata
 * register — a running count next to a section title is the cheapest possible
 * way to make a list feel instrumented rather than just listed.
 */
export function PanelHead({
  title,
  count,
  action,
  className,
}: {
  title: ReactNode;
  count?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-center justify-between gap-3 border-b-2 border-rule px-3 py-2",
        className
      )}
    >
      <div className="micro min-w-0 truncate">{title}</div>
      <div className="flex shrink-0 items-center gap-2">
        {count !== undefined && count !== null && (
          <span className="micro-sm tabular text-muted-foreground">{count}</span>
        )}
        {action}
      </div>
    </div>
  );
}

/**
 * One row inside a Panel. Pass `href` or `onClick` and it becomes tappable,
 * complete with a chevron — the app's standard "this goes somewhere" signal,
 * which is how cross-module navigation stays recognisable everywhere.
 */
export function PanelRow({
  children,
  className,
  href,
  onClick,
  last = false,
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
  /** Suppresses the bottom hairline on the final row of a panel. */
  last?: boolean;
  tone?: "default" | "muted";
}) {
  const base = cn(
    "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm",
    !last && "border-b border-hairline",
    tone === "muted" && "bg-muted/40",
    (href || onClick) && "tap-press transition-colors hover:bg-muted",
    className
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        <span className="min-w-0 flex-1">{children}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.5} />
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base}>
        {children}
      </button>
    );
  }

  return <div className={base}>{children}</div>;
}

/**
 * The empty state for a panel. Uses the hatch texture from globals.css so a
 * blank region reads as deliberately empty rather than as something that
 * failed to load.
 */
export function PanelEmpty({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="hatch flex flex-col items-center gap-3 px-4 py-8 text-center">
      <p className="micro-sm max-w-[28ch] text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}
