import { redirect } from "next/navigation";

import { PageHeader, HeaderFact } from "@/components/ui/page-header";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getLedger, groupByDay } from "@/lib/ledger";
import { ensureWeeklyInsight } from "@/lib/ai/insights";
import { addDaysToDateString, todayInAppTimezone } from "@/lib/time";
import { TimelineView } from "./timeline-view";

/**
 * Everything, in one line.
 *
 * Not gated on a module: it's a reading of whatever the account can already
 * see, and `getLedger` queries run under the person's own session, so an
 * account without Money access simply has no money events in it. There is
 * nothing here to gate that isn't already gated at source.
 */
export default async function TimelinePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const today = todayInAppTimezone(profile.timezone);
  const from = addDaysToDateString(today, -6);

  // Writes last week's insight if it hasn't been written yet, and returns the
  // stored one otherwise — so opening this page repeatedly costs nothing after
  // the first time in a given week. See lib/ai/insights.ts.
  const [events, insight] = await Promise.all([getLedger(from, today), ensureWeeklyInsight()]);

  return (
    <div>
      <PageHeader
        eyebrow="Everything, in one line"
        title="Timeline"
        meta={
          <>
            <HeaderFact>{events.length} things in the last week</HeaderFact>
            {insight && <HeaderFact>New pattern spotted</HeaderFact>}
          </>
        }
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        <TimelineView
          initialDays={groupByDay(events)}
          initialFrom={from}
          initialTo={today}
          today={today}
          insight={insight}
        />
      </div>
    </div>
  );
}
