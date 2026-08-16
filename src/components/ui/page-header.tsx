import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The masthead every screen in the app opens with.
 *
 * Before the redesign each page invented its own heading — some an `<h1>` with
 * a size class, some a div, some nothing at all — which is a large part of why
 * moving between modules felt like moving between different apps. This is the
 * one component that establishes "you are here", and it does three jobs:
 *
 *   eyebrow   where this screen sits (the module or parent it belongs to)
 *   title     the screen itself, in the display register
 *   meta      live state — counts, dates, totals — in the metadata register
 *
 * `backHref` renders a real back affordance rather than relying on the browser
 * gesture, because a PWA launched from the home screen has no visible browser
 * chrome to go back with.
 */
export function PageHeader({
  eyebrow,
  title,
  meta,
  actions,
  backHref,
  className,
}: {
  eyebrow?: string;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  className?: string;
}) {
  return (
    <header className={cn("border-b-2 border-rule bg-surface", className)}>
      <div className="flex items-start gap-3 px-4 pt-4 pb-3 md:px-6">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back"
            className="tap-press mt-1 flex size-8 shrink-0 items-center justify-center border-2 border-rule bg-surface hover:bg-muted"
          >
            <ArrowLeft className="size-4" strokeWidth={2.5} />
          </Link>
        )}

        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="micro-sm mb-1.5 text-muted-foreground">{eyebrow}</p>
          )}
          <h1 className="display break-words">{title}</h1>
          {meta && (
            <div className="micro-sm mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
              {meta}
            </div>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>
        )}
      </div>
    </header>
  );
}

/**
 * A single dot-separated fact in a PageHeader's `meta` row. Kept as its own
 * component so every screen's metadata line is spaced and coloured the same,
 * and so an "important" fact (overdue, over budget) has one agreed way to
 * shout without each screen picking its own red.
 */
export function HeaderFact({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "alert";
}) {
  return (
    <span className={cn(tone === "alert" && "text-destructive")}>{children}</span>
  );
}
