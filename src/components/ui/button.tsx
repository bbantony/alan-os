import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Buttons in the "Swiss Instrument" language are square, hard-edged and
// physical: a filled or framed block with an uppercase label, which travels
// down the diagonal into its own shadow when pressed.
//
// Two deliberate changes from the previous version beyond the styling:
//   - Default height went 32px -> 40px. The old default was below the 44px
//     comfortable-touch guidance and this is a phone-first app.
//   - Labels are uppercase with positive tracking. That's what makes a control
//     read as a control here rather than as a piece of text with a box on it.
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap border-2 font-bold uppercase tracking-[0.08em] outline-none select-none transition-[transform,box-shadow,background-color,color] duration-100 ease-out disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The main action. Solid signal colour, hard shadow, presses flush.
        default:
          "border-rule bg-primary text-primary-foreground shadow-[var(--shadow-hard-sm)] hover:brightness-95 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        // The most emphatic action available: ink block on paper.
        invert:
          "border-rule bg-foreground text-background shadow-[var(--shadow-hard-sm)] hover:opacity-90 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        // The everyday secondary. Framed, unfilled, still physical.
        outline:
          "border-rule bg-surface text-foreground shadow-[var(--shadow-hard-sm)] hover:bg-muted active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
        // Quiet but still structural — no shadow, so it sits *in* the page.
        secondary:
          "border-rule bg-muted text-foreground hover:bg-surface active:translate-x-px active:translate-y-px",
        // No frame at all. For icon affordances inside an already-framed panel,
        // where another border would just add noise.
        ghost:
          "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground active:translate-x-px active:translate-y-px",
        destructive:
          "border-destructive bg-transparent text-destructive hover:bg-destructive hover:text-destructive-foreground active:translate-x-px active:translate-y-px",
        link: "border-transparent text-primary underline decoration-2 underline-offset-4 hover:opacity-70",
      },
      size: {
        default: "h-10 px-4 text-xs",
        xs: "h-7 px-2 text-[0.625rem] tracking-[0.1em] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 px-3 text-[0.6875rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 px-6 text-sm",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-12 [&_svg:not([class*='size-'])]:size-5",
      },
      /** Full-width block button — common on phone forms. */
      block: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  block,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, block, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
