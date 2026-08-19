import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/empty-state";
import { getAccounts } from "../actions";
import { getReconciliationHistory } from "../reconcile-actions";
import { ReconcileFlow, ReconcileHistory } from "./reconcile-flow";

/**
 * The month-end truth check.
 *
 * Its own route rather than a sixth tab on the Money shell: this is a job with
 * a beginning and an end that you do once a month, not a view you flick
 * between. A tab would also have pushed the segmented control to six cells,
 * which on a phone is where labels stop being readable.
 */
export default async function ReconcilePage() {
  const [accounts, history] = await Promise.all([getAccounts(), getReconciliationHistory()]);

  return (
    <div>
      <PageHeader
        eyebrow="Money"
        title="Check against your bank"
        backHref="/money"
        meta={<span>Compare a statement to what the app has, and fix the gap</span>}
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        {accounts.length === 0 ? (
          <EmptyState
            title="No accounts yet"
            description="Add an account on the Money screen first — there's nothing to check against until then."
          />
        ) : (
          <>
            <ReconcileFlow accounts={accounts} initialAccountId={accounts[0].id} />
            <ReconcileHistory history={history} />
          </>
        )}
      </div>
    </div>
  );
}
