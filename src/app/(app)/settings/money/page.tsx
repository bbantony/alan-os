import { getAccounts, getCategories } from "@/app/(app)/money/actions";
import { SettingsPageShell } from "../settings-page-shell";
import { MoneySettings } from "./money-settings";
import { CsvImport } from "./csv-import";
import { MoneyPreferences } from "./money-preferences";
import { getPreferences } from "../preferences-actions";

export default async function MoneySettingsPage() {
  const [categories, accounts, preferences] = await Promise.all([
    getCategories(),
    getAccounts(),
    getPreferences(),
  ]);

  return (
    <SettingsPageShell title="Money">
      <MoneyPreferences initial={preferences} accounts={accounts} />
      <MoneySettings initialCategories={categories} />
      {accounts.length > 0 && <CsvImport accounts={accounts} categories={categories} />}
    </SettingsPageShell>
  );
}
