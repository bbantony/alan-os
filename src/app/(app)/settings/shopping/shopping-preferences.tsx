"use client";

import { useState } from "react";

import {
  SettingsGroup,
  PreferenceChoice,
  PreferenceNumber,
  PreferenceSwitch,
} from "@/components/settings/setting-controls";
import type { Preferences } from "@/lib/preferences";

export function ShoppingPreferences({ initial }: { initial: Preferences }) {
  const [prefs, setPrefs] = useState(initial);

  return (
    <>
      <SettingsGroup
        title="Staples coming back"
        description="Things you've starred reappear as suggestions once you're likely to be running low."
      >
        <PreferenceSwitch
          label="Learn each item's own rate"
          hint="Work out how often you actually buy something from your history, instead of using the same timer for everything. Needs three purchases before it kicks in."
          value={prefs.stapleLearnFromHistory}
          onSaved={setPrefs}
          patch={(v) => ({ stapleLearnFromHistory: v })}
        />
        <PreferenceNumber
          label="Otherwise, bring it back after"
          hint="Used for anything the app hasn't seen you buy enough times yet."
          value={prefs.stapleResurfaceDays}
          suffix="days"
          min={1}
          max={365}
          onSaved={setPrefs}
          patch={(v) => ({ stapleResurfaceDays: v })}
          last
        />
      </SettingsGroup>

      <SettingsGroup title="The list">
        <PreferenceChoice
          label="Sort by"
          value={prefs.shoppingSort}
          options={[
            { value: "category", label: "Category" },
            { value: "alphabetical", label: "A to Z" },
            { value: "recent", label: "Recently added" },
          ]}
          onSaved={setPrefs}
          patch={(v) => ({ shoppingSort: v })}
        />
        <PreferenceSwitch
          label="Receipts tick things off"
          hint="When you approve a receipt, anything on it that's still on your list gets checked off automatically."
          value={prefs.receiptAutoTick}
          onSaved={setPrefs}
          patch={(v) => ({ receiptAutoTick: v })}
          last
        />
      </SettingsGroup>
    </>
  );
}
