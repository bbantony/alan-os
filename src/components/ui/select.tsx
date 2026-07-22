import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

// A styled wrapper around the native <select> rather than the full base-ui
// Select compound component — every select in this app is a simple flat list
// of options (categories, accounts, periods), so a native element keeps
// full built-in keyboard/accessibility behavior for free while this just
// makes it LOOK consistent with the rest of the design system (border,
// radius, focus ring, a chevron) instead of every module hand-rolling its
// own "h-9 rounded-lg border..." classes slightly differently.
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "h-9 w-full appearance-none rounded-lg border border-input bg-transparent px-2.5 pr-8 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

export { Select }
