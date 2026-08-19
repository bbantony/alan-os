"use client";

import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * "Are you sure?" — the app's one confirmation, for anything that destroys
 * something a person can't get back.
 *
 * Before this, Money deleted transactions, budgets, goals and debts on a single
 * tap of a trash icon with no confirmation and no undo, and the two places
 * elsewhere in the app that did ask used the browser's own `window.confirm` —
 * which on Android is a grey system box with nothing to do with this app, and
 * which can't say *what* is about to be lost.
 *
 * `detail` is where the real cost goes ("this also deletes 41 transactions"),
 * because the whole point is that the person deciding can see the consequence
 * rather than a generic warning.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  detail,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  pending = false,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  /** The concrete consequence, called out in its own framed block. */
  detail?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {detail && (
          <p className="border-2 border-destructive px-3 py-2 text-sm text-destructive">
            {detail}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
