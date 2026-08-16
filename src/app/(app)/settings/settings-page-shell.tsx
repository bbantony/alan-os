import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";

/**
 * The wrapper every settings sub-page uses.
 *
 * Each of the seven sub-pages previously opened with its own hand-written
 * `mx-auto max-w-lg px-4 py-8` and an `<h1>` — seven chances to drift, and
 * none of them offered a way back to the settings index on a phone, where
 * there's no browser chrome and no side rail to return to.
 *
 * On desktop the masthead is suppressed: the persistent rail in
 * `settings/layout.tsx` already shows where you are, so repeating the title
 * above it would just be the same word twice.
 */
export function SettingsPageShell({
  title,
  eyebrow = "Settings",
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="md:hidden">
        <PageHeader eyebrow={eyebrow} title={title} backHref="/settings" />
      </div>

      {/* Desktop keeps a quieter title so the column still has a heading, just
          not a full masthead competing with the rail. */}
      <h1 className="display-sm mb-4 hidden md:block">{title}</h1>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 md:mx-0 md:max-w-none md:px-0 md:py-0">
        {children}
      </div>
    </div>
  );
}
