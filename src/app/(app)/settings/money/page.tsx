import { getCategories } from "@/app/(app)/money/actions";
import { MoneySettings } from "./money-settings";

export default async function MoneySettingsPage() {
  const categories = await getCategories();

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 font-heading text-2xl font-semibold">Money categories</h1>
      <MoneySettings initialCategories={categories} />
    </div>
  );
}
