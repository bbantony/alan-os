import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

// A styled wrapper around the native <select> rather than the full base-ui
// Select compound component — every select in this app is a simple flat list
// of options (categories, accounts, periods), so a native element keeps full
// built-in keyboard/accessibility behaviour for free while this just makes it
// LOOK consistent with the rest of the design system.
//
// The chevron sits in its own ruled cell on the right rather than floating
// over the text — a small thing, but it's what makes the control read as
// constructed from parts instead of as a box with an icon dropped on top.
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "h-10 w-full appearance-none border-2 border-rule bg-surface px-3 pr-11 text-base outline-none transition-colors",
          "focus-visible:border-primary",
          "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50",
          "md:text-sm",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center border-l-2 border-rule"
      >
        <ChevronDown className="size-4" strokeWidth={2.5} />
      </span>
    </div>
  )
}

export { Select }
