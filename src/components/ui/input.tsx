import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

// Square, framed, 40px tall. The focus treatment is an inset ink rule plus the
// signal-coloured outline from globals.css rather than a soft ring — a blurred
// glow is the one thing that would look out of place in this language.
//
// `text-base` on mobile is not a style choice: iOS Safari zooms the viewport
// when a focused input's text is under 16px, which on a phone reads as the
// page lurching. It drops to 14px from the `md` breakpoint up.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 border-2 border-rule bg-surface px-3 py-1 text-base transition-colors outline-none",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-xs file:font-bold file:uppercase file:tracking-[0.08em] file:text-foreground",
        "placeholder:text-muted-foreground placeholder:normal-case",
        "focus-visible:border-primary",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50",
        "aria-invalid:border-destructive",
        "md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
