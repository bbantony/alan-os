"use client";

import { useState } from "react";

import {
  SettingsGroup,
  PreferenceChoice,
  PreferenceSwitch,
  SettingRow,
} from "@/components/settings/setting-controls";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { formatMicros } from "@/lib/ai/models";
import type { Preferences } from "@/lib/preferences";
import { updatePreferences } from "../preferences-actions";

// Round numbers people actually think in, rather than a free-text box where
// a typo could set the ceiling to $0.50 or $500.
const CAP_OPTIONS = [1, 2, 5, 10, 25, 50].map((dollars) => ({
  value: String(dollars * 1_000_000),
  label: formatMicros(dollars * 1_000_000),
}));

export function AiPreferences({ initial }: { initial: Preferences }) {
  const [prefs, setPrefs] = useState(initial);
  const [savingCap, setSavingCap] = useState(false);

  async function saveCap(micros: number) {
    const previous = prefs;
    setPrefs({ ...prefs, aiMonthlyBudgetMicros: micros });
    setSavingCap(true);
    const result = await updatePreferences({ aiMonthlyBudgetMicros: micros });
    setSavingCap(false);
    if (result.error) {
      setPrefs(previous);
      toast.error("Couldn't save that.");
      return;
    }
    setPrefs(result.preferences);
    toast.success(`Monthly limit set to ${formatMicros(micros)}`);
  }

  return (
    <>
      <SettingsGroup
        title="Spending limit"
        description="A hard stop. Once it's reached, the AI features go quiet until the 1st and everything else in the app carries on as normal."
      >
        <SettingRow
          label="Most it can spend a month"
          hint="A normal month is a dollar or two. This is the ceiling, not a target."
          last
          control={
            <Select
              value={String(prefs.aiMonthlyBudgetMicros)}
              disabled={savingCap}
              onChange={(e) => saveCap(Number(e.target.value))}
              className="w-28"
            >
              {CAP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title="How bold it can be"
        description="Whatever you pick here, it can never delete anything or move money."
      >
        <PreferenceChoice
          label="When it spots something"
          value={prefs.aiBoldness}
          options={[
            { value: "notice", label: "Just tell me" },
            { value: "suggest", label: "Offer a button" },
            { value: "act", label: "Do small things" },
          ]}
          onSaved={setPrefs}
          patch={(v) => ({ aiBoldness: v })}
          stacked
          last
          hint={
            prefs.aiBoldness === "notice"
              ? "It points things out and stops there."
              : prefs.aiBoldness === "suggest"
                ? "It can offer one button — nothing happens until you tap it."
                : "It can quietly do small, reversible things and tell you afterwards."
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title="Where it's allowed to help"
        description="Turn any of these off and that part of the app goes back to being fully manual — it still works, you just do the typing."
      >
        <PreferenceSwitch
          label="Reading receipts"
          hint="Fills in the shop, date and items from a photo."
          value={prefs.aiReceipts}
          onSaved={setPrefs}
          patch={(v) => ({ aiReceipts: v })}
        />
        <PreferenceSwitch
          label="Sorting bank imports"
          hint="Guesses a category for rows it hasn't seen before."
          value={prefs.aiCsvImport}
          onSaved={setPrefs}
          patch={(v) => ({ aiCsvImport: v })}
        />
        <PreferenceSwitch
          label="The assistant"
          hint="The ask-anything screen."
          value={prefs.aiAssistant}
          onSaved={setPrefs}
          patch={(v) => ({ aiAssistant: v })}
        />
        <PreferenceSwitch
          label="Weekly patterns"
          hint="One look a week across everything, on the Timeline. Costs 2-3 cents a month."
          value={prefs.aiWeeklyPatterns}
          onSaved={setPrefs}
          patch={(v) => ({ aiWeeklyPatterns: v })}
        />
        <PreferenceSwitch
          label="Today's outlook"
          hint="A short read on the day at the top of Today, written once each morning. Costs about 7 cents a month."
          value={prefs.aiDailyOutlook}
          onSaved={setPrefs}
          patch={(v) => ({ aiDailyOutlook: v })}
          last
        />
      </SettingsGroup>
    </>
  );
}
