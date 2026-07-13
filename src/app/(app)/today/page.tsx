import { getCurrentProfile } from "@/lib/supabase/profile";
import { EmptyState } from "@/components/empty-state";
import { todayInAppTimezone } from "@/lib/time";

export default async function TodayPage() {
  const profile = await getCurrentProfile();
  const name = profile?.displayName?.split(" ")[0] ?? "there";

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <p className="mb-6 text-sm text-muted-foreground">{todayInAppTimezone()}</p>
      <EmptyState
        title={`Good to see you, ${name}.`}
        description="Your morning briefing, budget pulse, and streaks land here in Phase 1 and Phase 7. For now, this is just your front door."
      />
    </div>
  );
}
