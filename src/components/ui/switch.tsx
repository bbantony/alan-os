"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

// A square switch with a square thumb that slides across a framed track. The
// iOS-style pill was the single most out-of-place control left once everything
// else went hard-edged, and a sliding block reads as a physical toggle in a
// way the pill never did here.
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 items-center border-2 border-rule bg-muted p-0.5 transition-colors outline-none",
        "data-checked:bg-primary",
        "data-disabled:cursor-not-allowed data-disabled:opacity-40",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 translate-x-0 bg-rule transition-transform duration-100 ease-out data-checked:translate-x-[18px] data-checked:bg-primary-foreground"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
