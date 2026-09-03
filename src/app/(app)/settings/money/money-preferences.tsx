"use client";

import { useState } from "react";

import {
  SettingsGroup,
  PreferenceChoice,
  PreferenceSwitch,
} from "@/components/settings/setting-controls";
import type { Account } from "@/lib/finance/types";
import type { Preferences } from "@/lib/preferences";

// "Payday" and "Monthly reminder to check the bank" used to live here too.
// Both saved a preference that nothing anywhere read — a switch wired to no
// wire. Removed 2 Sep 2026 with Alan's approval rather than left lying.

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
          hint="Where new entries start out — the quick-log keypad, receipts, repeating payments, remittances — until you pick a different account."
          value={prefs.defaultAccountId ?? "none"}
          options={[
            { value: "none", label: "First in the list" },
            ...accounts.map((a) => ({ value: a.id, label: a.name })),
          ]}
          onSaved={setPrefs}
          patch={(v) => ({ defaultAccountId: v === "none" ? null : v })}
          stacked
          last
        />
      </SettingsGroup>

      <SettingsGroup title="Repeating">
        <PreferenceSwitch
          label="Repeating payments post themselves"
          hint="Rent, salary and subscriptions log automatically when they come due. Turn this off and they'll wait to be added by hand."
          value={prefs.recurringAutoPost}
          onSaved={setPrefs}
          patch={(v) => ({ recurringAutoPost: v })}
          last
        />
      </SettingsGroup>
    </>
  );
}
