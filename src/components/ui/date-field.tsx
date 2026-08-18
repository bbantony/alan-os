"use client";

import { useState } from "react";
import { CalendarDays, Clock, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CalendarGrid, DateShortcuts } from "@/components/ui/calendar-grid";
import { ClockPicker } from "@/components/ui/clock-picker";
import { cn } from "@/lib/utils";
import {
  formatDayRelative,
  formatTime12,
  splitDateTime,
  toDateString,
} from "@/lib/calendar";

/**
 * Drop-in replacements for `<input type="date">` and
 * `<input type="datetime-local">`.
 *
 * They take and emit exactly the same string formats the native inputs did
 * (`YYYY-MM-DD` and `YYYY-MM-DDTHH:mm`), so every caller's existing conversion
 * to UTC keeps working and no timezone behaviour changes.
 *
 * The native inputs open the phone's own picker, which on Samsung is a scroll
 * wheel: fiddly, and visually nothing to do with the app. These open the
 * app's own month grid and clock face instead.
 */

function todayString(): string {
  return toDateString(new Date());
}

export function DateField({
  value,
  onChange,
  placeholder = "Pick a date",
  clearable = false,
  className,
  "aria-label": ariaLabel,
}: {
  /** `YYYY-MM-DD`, or "" for empty. */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const today = todayString();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel ?? placeholder}
        className={cn(
          "tap-press flex h-10 w-full items-center gap-2 border-2 border-rule bg-surface px-3 text-left text-sm transition-colors hover:bg-muted",
          !value && "text-muted-foreground",
          className
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
        <span className="min-w-0 flex-1 truncate">
          {value ? formatDayRelative(value, today) : placeholder}
        </span>
        {clearable && value && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear date"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                e.preventDefault();
                onChange("");
              }
            }}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <X className="size-4" />
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-xs">
          <PickerHeader title="Pick a date" onClose={() => setOpen(false)} />
          <div className="flex flex-col gap-3 p-3">
            <CalendarGrid
              selected={value || null}
              todayIso={today}
              onSelect={(iso) => {
                onChange(iso);
                setOpen(false);
              }}
            />
            <DateShortcuts
              todayIso={today}
              onSelect={(iso) => {
                onChange(iso);
                setOpen(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DateTimeField({
  value,
  onChange,
  placeholder = "Pick a date and time",
  clearable = true,
  className,
  "aria-label": ariaLabel,
}: {
  /** `YYYY-MM-DDTHH:mm`, or "" for empty. */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"date" | "time">("date");
  const today = todayString();

  const { date, time } = splitDateTime(value);
  // Drafts so the dialog can be cancelled without having half-changed the value.
  const [draftDate, setDraftDate] = useState(date || today);
  const [draftTime, setDraftTime] = useState(time || "09:00");

  function openPicker() {
    const current = splitDateTime(value);
    setDraftDate(current.date || today);
    setDraftTime(current.time || "09:00");
    setStep("date");
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        aria-label={ariaLabel ?? placeholder}
        className={cn(
          "tap-press flex h-10 w-full items-center gap-2 border-2 border-rule bg-surface px-3 text-left text-sm transition-colors hover:bg-muted",
          !value && "text-muted-foreground",
          className
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
        <span className="min-w-0 flex-1 truncate">
          {value ? (
            <>
              {formatDayRelative(date, today)}
              <span className="micro-sm ml-2 text-muted-foreground">{formatTime12(time)}</span>
            </>
          ) : (
            placeholder
          )}
        </span>
        {clearable && value && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                e.preventDefault();
                onChange("");
              }
            }}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <X className="size-4" />
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-xs">
          <PickerHeader
            title={step === "date" ? "Pick a date" : "Pick a time"}
            onClose={() => setOpen(false)}
          />

          {/* Two steps rather than two fields — on a phone, a date and a time
              side by side leaves neither enough room to be tappable. */}
          <div className="flex items-stretch border-b-2 border-rule">
            <StepTab
              active={step === "date"}
              onClick={() => setStep("date")}
              icon={<CalendarDays className="size-3.5" />}
              label={formatDayRelative(draftDate, today)}
            />
            <StepTab
              active={step === "time"}
              onClick={() => setStep("time")}
              icon={<Clock className="size-3.5" />}
              label={formatTime12(draftTime)}
              bordered
            />
          </div>

          <div className="flex flex-col gap-3 p-3">
            {step === "date" ? (
              <>
                <CalendarGrid
                  selected={draftDate}
                  todayIso={today}
                  onSelect={(iso) => {
                    setDraftDate(iso);
                    setStep("time");
                  }}
                />
                <DateShortcuts
                  todayIso={today}
                  onSelect={(iso) => {
                    setDraftDate(iso);
                    setStep("time");
                  }}
                />
              </>
            ) : (
              <ClockPicker value={draftTime} onChange={setDraftTime} />
            )}

            <Button
              type="button"
              block
              variant="invert"
              onClick={() => {
                onChange(`${draftDate}T${draftTime}`);
                setOpen(false);
              }}
            >
              Set
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Just a time, no date — for a routine's time of day. */
export function TimeField({
  value,
  onChange,
  placeholder = "Pick a time",
  clearable = true,
  className,
  "aria-label": ariaLabel,
}: {
  /** `HH:mm`, or "" for empty. */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || "09:00");

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(value || "09:00");
          setOpen(true);
        }}
        aria-label={ariaLabel ?? placeholder}
        className={cn(
          "tap-press flex h-10 w-full items-center gap-2 border-2 border-rule bg-surface px-3 text-left text-sm transition-colors hover:bg-muted",
          !value && "text-muted-foreground",
          className
        )}
      >
        <Clock className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
        <span className="min-w-0 flex-1 truncate">
          {value ? formatTime12(value) : placeholder}
        </span>
        {clearable && value && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear time"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                e.preventDefault();
                onChange("");
              }
            }}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <X className="size-4" />
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-xs">
          <PickerHeader title="Pick a time" onClose={() => setOpen(false)} />
          <div className="flex flex-col gap-3 p-3">
            <ClockPicker value={draft} onChange={setDraft} />
            <Button
              type="button"
              block
              variant="invert"
              onClick={() => {
                onChange(draft);
                setOpen(false);
              }}
            >
              Set
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PickerHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b-2 border-rule px-3 py-2.5">
      <span className="micro">{title}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="tap-press text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function StepTab({
  active,
  onClick,
  icon,
  label,
  bordered,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  bordered?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "micro-sm tap-press flex flex-1 items-center justify-center gap-1.5 py-2.5 transition-colors",
        bordered && "border-l-2 border-rule",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
