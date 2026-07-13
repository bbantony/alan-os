import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-surface px-6 py-16 text-center">
      <div
        className="flex size-14 items-center justify-center rounded-full border border-border text-muted-foreground"
        aria-hidden
      >
        {icon ?? <DefaultLineIcon />}
      </div>
      <div className="space-y-1">
        <h3 className="font-heading text-lg font-medium">{title}</h3>
        {description && (
          <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function DefaultLineIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 19V6a2 2 0 0 1 2-2h9l5 5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M15 4v5h5" />
    </svg>
  );
}
