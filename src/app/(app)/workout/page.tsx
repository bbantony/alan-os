import { getCurrentProfile } from "@/lib/supabase/profile";
import { getFeed, getLeaderboard, getWeightUnit } from "./actions";
import { WorkoutFeed } from "./workout-feed";

export default async function WorkoutPage() {
  const [profile, feed, leaderboard, weightUnit] = await Promise.all([
    getCurrentProfile(),
    getFeed(),
    getLeaderboard(),
    getWeightUnit(),
  ]);

  return (
    <WorkoutFeed
      initialFeed={feed}
      initialLeaderboard={leaderboard}
      currentUserId={profile?.id ?? ""}
      weightUnit={weightUnit}
      isOwner={profile?.role === "owner"}
    />
  );
}
