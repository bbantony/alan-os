import { getAccounts, getCategories } from "@/app/(app)/money/actions";
import { MoneySettings } from "./money-settings";
import { CsvImport } from "./csv-import";

export default async function MoneySettingsPage() {
  const [categories, accounts] = await Promise.all([getCategories(), getAccounts()]);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 font-heading text-2xl font-semibold">Money</h1>
      <MoneySettings initialCategories={categories} />
      {accounts.length > 0 && <CsvImport accounts={accounts} categories={categories} />}
    </div>
  );
}
