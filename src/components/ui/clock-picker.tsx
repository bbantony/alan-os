"use client";

import { useCallback, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  angleToValue,
  formatTime24,
  to12Hour,
  to24Hour,
  valueToPoint,
} from "@/lib/calendar";

type Mode = "hour" | "minute";

/**
 * An Android-style clock dial: pick the hour, then the minute, by tapping or
 * dragging on the face. The digital readout above it doubles as the mode
 * switch and as a text input, so a time can always be typed instead.
 *
 * Replaces `<input type="time">`, which on Samsung opens a scroll wheel —
 * fiddly, and nothing like the rest of the app.
 *
 * A circle is the right shape here for once. The design language squares
 * everything, but a clock face genuinely is round, and the exception is the
 * point: it's instantly recognisable as a clock rather than a widget. The
 * square frame around it keeps it inside the system.
 */
export function ClockPicker({
  /** `HH:mm`, 24-hour. */
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const [hRaw, mRaw] = value.split(":").map(Number);
  const hour24 = Number.isFinite(hRaw) ? hRaw : 9;
  const minute = Number.isFinite(mRaw) ? mRaw : 0;
  const { hour12, meridiem } = to12Hour(hour24, minute);

  const [mode, setMode] = useState<Mode>("hour");
  const [typing, setTyping] = useState<string | null>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const commit = useCallback(
    (nextHour12: number, nextMinute: number, nextMeridiem: "AM" | "PM") => {
      onChange(formatTime24(to24Hour({ hour12: nextHour12, meridiem: nextMeridiem }), nextMinute));
    },
    [onChange]
  );

  /** Maps a pointer position on the face onto the hour or minute it points at. */
  const pointTo = useCallback(
    (clientX: number, clientY: number) => {
      const el = faceRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);

      if (mode === "hour") {
        const step = angleToValue(dx, dy, 12);
        commit(step === 0 ? 12 : step, minute, meridiem);
      } else {
        commit(hour12, angleToValue(dx, dy, 60), meridiem);
      }
    },
    [mode, minute, meridiem, hour12, commit]
  );

  const hand = mode === "hour" ? valueToPoint(hour12 % 12, 12) : valueToPoint(minute, 60);
  const numbers = mode === "hour"
    ? Array.from({ length: 12 }, (_, i) => ({ value: i === 0 ? 12 : i, step: i }))
    : Array.from({ length: 12 }, (_, i) => ({ value: i * 5, step: i * 5 }));

  function applyTyped(next: string) {
    const digits = next.replace(/\D/g, "").slice(0, 2);
    setTyping(digits);
    if (digits === "") return;
    const n = Number(digits);
    if (mode === "hour") {
      if (n >= 1 && n <= 12) commit(n, minute, meridiem);
    } else if (n >= 0 && n <= 59) {
      commit(hour12, n, meridiem);
    }
  }

  return (
    <div className={cn("border-2 border-rule bg-surface", className)}>
      {/* ---------- Readout, which is also the mode switch ---------- */}
      <div className="flex items-stretch border-b-2 border-rule">
        <div className="flex flex-1 items-center justify-center gap-1 py-3">
          <ReadoutSegment
            active={mode === "hour"}
            display={typing !== null && mode === "hour" ? typing : String(hour12)}
            onFocusMode={() => {
              setMode("hour");
              setTyping("");
            }}
            onType={applyTyped}
            onBlur={() => setTyping(null)}
            label="Hour"
          />
          <span className="stat text-3xl text-muted-foreground">:</span>
          <ReadoutSegment
            active={mode === "minute"}
            display={
              typing !== null && mode === "minute"
                ? typing
                : String(minute).padStart(2, "0")
            }
            onFocusMode={() => {
              setMode("minute");
              setTyping("");
            }}
            onType={applyTyped}
            onBlur={() => setTyping(null)}
            label="Minute"
          />
        </div>

        <div className="flex w-14 shrink-0 flex-col border-l-2 border-rule">
          {(["AM", "PM"] as const).map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => commit(hour12, minute, m)}
              aria-pressed={meridiem === m}
              className={cn(
                "micro-sm tap-press flex-1 transition-colors",
                i > 0 && "border-t border-hairline",
                meridiem === m
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- The face ---------- */}
      <div className="flex justify-center p-4">
        <div
          ref={faceRef}
          role="slider"
          tabIndex={0}
          aria-label={mode === "hour" ? "Hour" : "Minute"}
          aria-valuenow={mode === "hour" ? hour12 : minute}
          aria-valuemin={mode === "hour" ? 1 : 0}
          aria-valuemax={mode === "hour" ? 12 : 59}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            pointTo(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (dragging.current) pointTo(e.clientX, e.clientY);
          }}
          onPointerUp={() => {
            dragging.current = false;
            // Choosing an hour almost always means a minute is chosen next, so
            // the dial advances itself rather than making you tap the readout.
            if (mode === "hour") setMode("minute");
          }}
          onKeyDown={(e) => {
            const delta = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1
              : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -1 : 0;
            if (delta === 0) return;
            e.preventDefault();
            if (mode === "hour") {
              const next = ((hour12 - 1 + delta + 12) % 12) + 1;
              commit(next, minute, meridiem);
            } else {
              commit(hour12, (minute + delta + 60) % 60, meridiem);
            }
          }}
          className="relative aspect-square w-full max-w-[248px] touch-none rounded-full border-2 border-rule bg-muted/40 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {/* hand */}
          <span
            className="pointer-events-none absolute top-1/2 left-1/2 h-[2px] origin-left bg-primary"
            style={{
              width: "38%",
              transform: `rotate(${
                (mode === "hour" ? (hour12 % 12) / 12 : minute / 60) * 360 - 90
              }deg)`,
            }}
          />
          {/* hub */}
          <span className="pointer-events-none absolute top-1/2 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
          {/* selected marker */}
          <span
            className="pointer-events-none absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rule bg-primary"
            style={{
              left: `${50 + hand.x * 38}%`,
              top: `${50 + hand.y * 38}%`,
            }}
          />

          {numbers.map(({ value: n, step }) => {
            const p = valueToPoint(mode === "hour" ? step : step, mode === "hour" ? 12 : 60);
            const isActive = mode === "hour" ? n === hour12 : n === minute;
            return (
              <span
                key={n}
                className={cn(
                  "pointer-events-none absolute flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-sm font-bold tabular",
                  isActive ? "text-primary-foreground" : "text-foreground"
                )}
                style={{ left: `${50 + p.x * 38}%`, top: `${50 + p.y * 38}%` }}
              >
                {mode === "minute" ? String(n).padStart(2, "0") : n}
              </span>
            );
          })}
        </div>
      </div>

      <p className="micro-sm border-t-2 border-rule px-3 py-2 text-center text-muted-foreground">
        {mode === "hour" ? "Pick the hour" : "Pick the minutes"} &middot; or type above
      </p>
    </div>
  );
}

function ReadoutSegment({
  active,
  display,
  onFocusMode,
  onType,
  onBlur,
  label,
}: {
  active: boolean;
  display: string;
  onFocusMode: () => void;
  onType: (value: string) => void;
  onBlur: () => void;
  label: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={display}
      onFocus={onFocusMode}
      onClick={onFocusMode}
      onChange={(e) => onType(e.target.value)}
      onBlur={onBlur}
      className={cn(
        "stat w-16 border-2 bg-transparent py-1 text-center text-3xl outline-none transition-colors",
        active
          ? "border-rule bg-foreground text-background"
          : "border-transparent text-muted-foreground hover:border-hairline"
      )}
    />
  );
}
