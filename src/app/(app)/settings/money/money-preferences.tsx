"use client";

import { useState } from "react";

import {
  SettingsGroup,
  PreferenceChoice,
  PreferenceSwitch,
} from "@/components/settings/setting-controls";
import type { Account } from "@/lib/finance/types";
import type { Preferences } from "@/lib/preferences";

const DAY_OPTIONS = [
  { value: "none", label: "Not set" },
  ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}` })),
];

export function MoneyPreferences({
  initial,
  accounts,
}: {
  initial: Preferences;
  accounts: Account[];
}) {
  const [prefs, setPrefs] = useState(initial);

  return (
    <>
      <SettingsGroup title="Logging">
        <PreferenceChoice
          label="Default account"
          hint="What the quick-log keypad picks before you change it."
          value={prefs.defaultAccountId ?? "none"}
          options={[
            { value: "none", label: "First in the list" },
            ...accounts.map((a) => ({ value: a.id, label: a.name })),
          ]}
          onSaved={setPrefs}
          patch={(v) => ({ defaultAccountId: v === "none" ? null : v })}
          stacked
        />
        <PreferenceChoice
          label="Payday"
          hint="New budgets start their period on this day of the month. Short months are handled — the 31st becomes the 28th in February."
          value={prefs.paydayAnchorDay === null ? "none" : String(prefs.paydayAnchorDay)}
          options={DAY_OPTIONS}
          onSaved={setPrefs}
          patch={(v) => ({ paydayAnchorDay: v === "none" ? null : Number(v) })}
          last
        />
      </SettingsGroup>

      <SettingsGroup title="Repeating and checking">
        <PreferenceSwitch
          label="Repeating payments post themselves"
          hint="Rent, salary and subscriptions log automatically when they come due. Turn this off and they'll wait to be added by hand."
          value={prefs.recurringAutoPost}
          onSaved={setPrefs}
          patch={(v) => ({ recurringAutoPost: v })}
        />
        <PreferenceSwitch
          label="Monthly reminder to check the bank"
          hint="A nudge once a month to reconcile your accounts against a real statement."
          value={prefs.reconcileReminder}
          onSaved={setPrefs}
          patch={(v) => ({ reconcileReminder: v })}
          last
        />
      </SettingsGroup>
    </>
  );
}
