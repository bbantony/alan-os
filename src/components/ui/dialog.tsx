"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

// A heavier backdrop than before. The dialog is a hard-edged block sitting on
// a hard shadow, and a barely-there 10% scrim left it looking pasted onto the
// page rather than lifted off it.
function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-foreground/35 duration-100 supports-backdrop-filter:backdrop-blur-[2px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  side = "center",
  style,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  /**
   * Where the dialog is anchored.
   *
   * `center` is the app's default — a block dropped onto the middle of the
   * page from just above it.
   *
   * `bottom` is the phone sheet: flush to the bottom edge, full width, and it
   * rises from that edge rather than dropping from the top. It exists because
   * the capture sheet is opened by a control at the *bottom* of the screen and
   * is used one-handed — a centred dialog puts its first field out of thumb
   * reach and moves in the opposite direction to the tap that summoned it.
   * From `sm` up it stops being a full-width strip and becomes a centred
   * bottom-docked panel, because a 1440px-wide sheet reads as a page.
   */
  side?: "center" | "bottom"
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        // Not `data-side` — that name belongs to base-ui's own positioned
        // popups (menus, popovers) and this is a dialog.
        data-dialog-side={side}
        className={cn(
          "fixed z-50 grid w-full gap-4 overflow-y-auto border-2 border-rule bg-popover p-4 text-sm text-popover-foreground shadow-[var(--shadow-hard-lg)] duration-100 outline-none",
          side === "center" && [
            "top-1/2 left-1/2 max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 sm:max-w-md",
            "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-2 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-top-2",
          ],
          side === "bottom" && [
            // No bottom border: the sheet is docked to the edge of the screen
            // on a phone, and a rule with nothing under it reads as a seam.
            "inset-x-0 bottom-0 max-h-[85dvh] border-b-0 sm:inset-x-auto sm:left-1/2 sm:max-w-md sm:-translate-x-1/2 sm:border-b-2",
            "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-4",
            // Somebody who has asked their phone to stop animating gets the
            // sheet simply appearing. The app's own Motion: Reduced setting is
            // already handled globally in globals.css.
            "motion-reduce:animate-none",
          ],
          className
        )}
        // Inline rather than a padding utility on purpose: consumers pass
        // `p-0` to run their own edge-to-edge sections, and this must survive
        // that — it's the gap that keeps the last row of the sheet clear of a
        // phone's home indicator.
        // (`style` can also be a function of the popup's state in base-ui; in
        // that case it is left alone rather than half-merged.)
        style={
          side === "bottom" && (style === undefined || typeof style === "object")
            ? { paddingBottom: "env(safe-area-inset-bottom)", ...style }
            : style
        }
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

// The header gets a structural rule under it, which is how every other framed
// region in the app separates its title from its body.
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "-mx-4 -mt-4 flex flex-col gap-1 border-b-2 border-rule px-4 pt-4 pb-3",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 border-t-2 border-rule bg-muted/60 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("display-sm pr-8", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
