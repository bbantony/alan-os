import type { ReactNode } from "react";

/**
 * The app's standard "there's nothing here" panel.
 *
 * Restyled onto the hatch texture from globals.css: an empty region should
 * read as *deliberately* empty. A plain bordered box with centred text is
 * indistinguishable from a region that failed to load, and this app has a lot
 * of legitimately-empty screens (a cleared task list is a success, not a gap).
 */
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
    <div className="hatch flex flex-col items-center justify-center gap-4 border-2 border-rule bg-surface px-6 py-14 text-center">
      <div
        className="flex size-14 items-center justify-center border-2 border-rule bg-surface text-muted-foreground"
        aria-hidden
      >
        {icon ?? <DefaultLineIcon />}
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="display-sm">{title}</h3>
        {description && (
          <p className="max-w-[34ch] text-sm text-muted-foreground">{description}</p>
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
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      <path d="M4 19V6a2 2 0 0 1 2-2h9l5 5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M15 4v5h5" />
    </svg>
  );
}
