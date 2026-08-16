import * as React from "react"

import { cn } from "@/lib/utils"

// A Card in the new language is a *framed* thing, not a floating one: a 2-3px
// high-contrast rule, zero radius, and no shadow. Elevation is reserved for
// things genuinely above the page (see `tone="raised"`, used by dialogs and
// menus), because if every card lifts, nothing does.
//
// The component API is unchanged from the previous design system on purpose —
// 40-odd screen files import these and none of them needed editing.

function Card({
  className,
  size = "default",
  tone = "default",
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  /**
   * default — framed panel on the surface colour.
   * invert  — ink ground, paper text. The one emphasised block on a screen.
   * raised  — framed and lifted on a hard shadow. Genuinely above the page.
   * flat    — no frame at all, for a card that sits inside another frame.
   */
  tone?: "default" | "invert" | "raised" | "flat"
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-tone={tone}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden py-(--card-spacing) text-sm [--card-spacing:--spacing(4)] data-[size=sm]:[--card-spacing:--spacing(3)] has-[>img:first-child]:pt-0",
        tone === "default" && "border-2 border-rule bg-card text-card-foreground",
        tone === "raised" &&
          "border-2 border-rule bg-card text-card-foreground shadow-[var(--shadow-hard-md)]",
        tone === "invert" && "border-2 border-rule bg-foreground text-background",
        tone === "flat" && "bg-transparent text-card-foreground",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min items-start gap-1 px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

// Card titles are short by nature ("Safe to spend", "Accounts", "This week"),
// so they take the metadata register: small, heavy, uppercase, tracked. The
// *content* of the card is what should be big — not its label.
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-heading text-xs font-extrabold tracking-[0.1em] uppercase",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn(
        "text-sm text-muted-foreground group-data-[tone=invert]/card:text-background/70",
        className
      )}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "-mb-(--card-spacing) mt-auto flex items-center border-t-2 border-rule bg-muted/60 p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
