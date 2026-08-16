"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Form labels take the metadata register — small, mono, uppercase, tracked —
// which is the same register used for units, counts and section markers across
// the app. That consistency is what makes a form read as part of the
// instrument rather than as a web form dropped into it.
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "micro flex items-center gap-2 text-muted-foreground select-none",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
