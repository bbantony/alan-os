"use client";

import { useState } from "react";

import {
  SettingsGroup,
  PreferenceChoice,
  HOUR_OPTIONS,
} from "@/components/settings/setting-controls";
import { PreferenceSwitch } from "@/components/settings/setting-controls";
import type { Preferences } from "@/lib/preferences";

const NUDGE_OPTIONS = [
  { value: "none", label: "No reminder" },
  { value: "0", label: "When it's due" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "The day before" },
  { value: "10080", label: "A week before" },
];

export function PlanSettings({ initial }: { initial: Preferences }) {
  const [prefs, setPrefs] = useState(initial);

  return (
    <>
      <SettingsGroup
        title="Working hours"
        description="Work tasks fold themselves away outside these hours, so evenings and weekends aren't a list of things from the office."
      >
        <PreferenceChoice
          label="Work starts"
          value={String(prefs.workHoursStart)}
          options={HOUR_OPTIONS}
          onSaved={setPrefs}
          patch={(v) => ({ workHoursStart: Number(v) })}
        />
        <PreferenceChoice
          label="Work ends"
          value={String(prefs.workHoursEnd)}
          options={HOUR_OPTIONS}
          onSaved={setPrefs}
          patch={(v) => ({ workHoursEnd: Number(v) })}
        />
        <PreferenceSwitch
          label="Weekends are off"
          hint="Treat Saturday and Sunday as outside working hours."
          value={prefs.workWeekendsOff}
          onSaved={setPrefs}
          patch={(v) => ({ workWeekendsOff: v })}
          last
        />
      </SettingsGroup>

      <SettingsGroup title="The day">
        <PreferenceChoice
          label="Evening planning starts"
          hint="After this, Today swaps from 'what's on now' to 'plan tomorrow'."
          value={String(prefs.eveningRitualHour)}
          options={HOUR_OPTIONS.filter((o) => Number(o.value) >= 12)}
          onSaved={setPrefs}
          patch={(v) => ({ eveningRitualHour: Number(v) })}
        />
        <PreferenceChoice
          label="Plan opens on"
          hint="Which of the three views you land on."
          value={prefs.defaultPlanView}
          options={[
            { value: "list", label: "List" },
            { value: "calendar", label: "Calendar" },
            { value: "agenda", label: "Agenda" },
          ]}
          onSaved={setPrefs}
          patch={(v) => ({ defaultPlanView: v })}
        />
        <PreferenceChoice
          label="New tasks remind you"
          hint="The starting point for a new task's nudge. You can still change it per task."
          value={prefs.defaultNudgeMinutes === null ? "none" : String(prefs.defaultNudgeMinutes)}
          options={NUDGE_OPTIONS}
          onSaved={setPrefs}
          patch={(v) => ({ defaultNudgeMinutes: v === "none" ? null : Number(v) })}
          stacked
          last
        />
      </SettingsGroup>
    </>
  );
}
