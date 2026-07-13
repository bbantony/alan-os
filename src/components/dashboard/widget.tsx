import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function DashboardWidget({
  title,
  icon: Icon,
  href,
  comingInPhase,
  className,
  children,
}: {
  title: string;
  icon: LucideIcon;
  href?: string;
  comingInPhase?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const soon = comingInPhase !== undefined;

  const body = (
    <div
      className={cn(
        "flex h-full flex-col gap-2 rounded-xl border p-4 transition-colors",
        soon
          ? "border-dashed border-border/70 bg-muted/30"
          : "border-border bg-surface hover:border-primary/40",
        href && !soon && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn("size-4", soon ? "text-muted-foreground/50" : "text-primary")} />
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
            Phase {comingInPhase}
          </span>
        )}
      </div>
      <div className={cn("text-sm", soon ? "text-muted-foreground/80" : "text-foreground")}>
        {children}
      </div>
    </div>
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
