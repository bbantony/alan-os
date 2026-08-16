import { getAccounts, getCategories } from "@/app/(app)/money/actions";
import { SettingsPageShell } from "../settings-page-shell";
import { MoneySettings } from "./money-settings";
import { CsvImport } from "./csv-import";

export default async function MoneySettingsPage() {
  const [categories, accounts] = await Promise.all([getCategories(), getAccounts()]);

  return (
    <SettingsPageShell title="Money">
      <MoneySettings initialCategories={categories} />
      {accounts.length > 0 && <CsvImport accounts={accounts} categories={categories} />}
    </SettingsPageShell>
  );
}
