"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fadeInUpVariants } from "@/lib/motion";
import { ComingSoonIllustration } from "@/components/illustrations";

export function DashboardWidget({
  title,
  icon,
  href,
  comingInPhase,
  className,
  children,
}: {
  title: string;
  // A rendered element (e.g. <Sparkles className="size-4" />), not a
  // component reference — this is a Client Component but gets rendered
  // straight from the Server Component today/page.tsx, and a bare component
  // reference (a function) isn't serializable across that boundary the way
  // an already-built element is. Color is applied via currentColor on the
  // wrapping span, so callers don't need to know the "soon" state.
  icon: React.ReactNode;
  href?: string;
  comingInPhase?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const soon = comingInPhase !== undefined;

  const body = (
    <motion.div
      variants={fadeInUpVariants}
      className={cn(
        "flex h-full flex-col gap-2 rounded-xl border p-4 shadow-sm transition-colors",
        soon
          ? "border-border/70 bg-muted/20"
          : "border-border bg-surface hover:border-primary/40 hover:shadow-md",
        href && !soon && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex", soon ? "text-muted-foreground/50" : "text-primary")}>{icon}</span>
          <span
            className={cn(
              "font-heading text-sm font-semibold",
              soon && "text-muted-foreground"
            )}
          >
            {title}
          </span>
        </div>
        {soon && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Coming soon
          </span>
        )}
      </div>
      {soon ? (
        <div className="flex flex-1 items-center gap-3">
          <ComingSoonIllustration className="size-8 shrink-0 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground/80">{children}</p>
        </div>
      ) : (
        <div className="text-sm text-foreground">{children}</div>
      )}
    </motion.div>
  );

  if (href && !soon) {
    return (
      <Link href={href} className="block h-full">
        {body}
      </Link>
    );
  }
  return body;
}
