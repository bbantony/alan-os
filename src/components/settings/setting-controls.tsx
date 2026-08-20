"use client";

import { useState, type ReactNode } from "react";

import { Panel, PanelHead } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Micro } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { Preferences } from "@/lib/preferences";
import { updatePreferences } from "@/app/(app)/settings/preferences-actions";

/**
 * The shared vocabulary for every settings screen.
 *
 * Eight pages of toggles is exactly the situation where each one quietly grows
 * its own row height, its own label size and its own idea of where the
 * description goes. These four components are the whole vocabulary, so a
 * setting looks the same wherever it lives.
 *
 * Everything saves on change — there is no Save button anywhere in Settings.
 * A settings screen full of switches with a Save at the bottom is a screen you
 * can leave without your change taking effect, and people do.
 */

export function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Panel>
      <PanelHead title={title} />
      {description && (
        <p className="border-b border-hairline px-3 py-2">
          <Micro>{description}</Micro>
        </p>
      )}
      {children}
    </Panel>
  );
}

export function SettingRow({
  label,
  hint,
  control,
  stacked = false,
  last = false,
}: {
  label: string;
  hint?: ReactNode;
  control: ReactNode;
  /** Put the control on its own line — for anything wider than a switch. */
  stacked?: boolean;
  last?: boolean;
}) {
  return (
    <div className={cn("px-3 py-3", !last && "border-b border-hairline")}>
      <div className={cn("flex gap-3", stacked ? "flex-col" : "items-center justify-between")}>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{label}</p>
          {hint && <Micro className="mt-0.5 block">{hint}</Micro>}
        </div>
        <div className={cn(stacked ? "w-full" : "shrink-0")}>{control}</div>
      </div>
    </div>
  );
}

/** A switch bound to one boolean preference, saving the moment it moves. */
export function PreferenceSwitch({
  label,
  hint,
  value,
  onSaved,
  patch,
  last = false,
}: {
  label: string;
  hint?: ReactNode;
  value: boolean;
  onSaved: (prefs: Preferences) => void;
  /** Builds the patch from the new value. */
  patch: (next: boolean) => Partial<Preferences>;
  last?: boolean;
}) {
  const [checked, setChecked] = useState(value);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: boolean) {
    // Optimistic, then reconciled — a switch that waits for a round trip before
    // moving feels broken on a phone.
    setChecked(next);
    setSaving(true);
    const result = await updatePreferences(patch(next));
    setSaving(false);
    if (result.error) {
      setChecked(!next);
      toast.error("Couldn't save that.");
      return;
    }
    onSaved(result.preferences);
  }

  return (
    <SettingRow
      label={label}
      hint={hint}
      last={last}
      control={<Switch checked={checked} onCheckedChange={handleChange} disabled={saving} />}
    />
  );
}

/** A dropdown bound to one preference. */
export function PreferenceChoice<T extends string>({
  label,
  hint,
  value,
  options,
  onSaved,
  patch,
  stacked = false,
  last = false,
}: {
  label: string;
  hint?: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onSaved: (prefs: Preferences) => void;
  patch: (next: T) => Partial<Preferences>;
  stacked?: boolean;
  last?: boolean;
}) {
  const [current, setCurrent] = useState<T>(value);
  const [saving, setSaving] = useState(false);

  async function handleChange(next: T) {
    const previous = current;
    setCurrent(next);
    setSaving(true);
    const result = await updatePreferences(patch(next));
    setSaving(false);
    if (result.error) {
      setCurrent(previous);
      toast.error("Couldn't save that.");
      return;
    }
    onSaved(result.preferences);
  }

  return (
    <SettingRow
      label={label}
      hint={hint}
      stacked={stacked}
      last={last}
      control={
        <Select
          value={current}
          disabled={saving}
          onChange={(e) => handleChange(e.target.value as T)}
          className={stacked ? "w-full" : "w-44"}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      }
    />
  );
}

/**
 * A number bound to one preference, saved when you leave the field.
 *
 * On blur rather than on every keystroke: typing "14" over "7" passes through
 * "1" on the way, and saving that would briefly set a real behaviour to a value
 * nobody chose.
 */
export function PreferenceNumber({
  label,
  hint,
  value,
  suffix,
  min,
  max,
  onSaved,
  patch,
  last = false,
}: {
  label: string;
  hint?: ReactNode;
  value: number;
  suffix?: string;
  min?: number;
  max?: number;
  onSaved: (prefs: Preferences) => void;
  patch: (next: number) => Partial<Preferences>;
  last?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const [saving, setSaving] = useState(false);

  async function commit() {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    setSaving(true);
    const result = await updatePreferences(patch(parsed));
    setSaving(false);
    if (result.error) {
      setText(String(value));
      toast.error("Couldn't save that.");
      return;
    }
    onSaved(result.preferences);
  }

  return (
    <SettingRow
      label={label}
      hint={hint}
      last={last}
      control={
        <span className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={text}
            disabled={saving}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            className="w-24 text-center"
          />
          {suffix && <Micro className="shrink-0">{suffix}</Micro>}
        </span>
      }
    />
  );
}

/** Hours as a friendly dropdown — nobody wants to type "22" for 10pm. */
export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label:
    h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`,
}));
