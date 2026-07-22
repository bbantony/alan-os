import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getCrewProfiles } from "../actions";
import { CopyInviteLink } from "./copy-invite-link";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  workout_member: "Workout",
  full_user: "Full",
};

export default async function InvitePage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "owner") redirect("/workout");

  const crew = await getCrewProfiles();
  const inviteCode = process.env.INVITE_CODE ?? "";

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-2 font-heading text-2xl font-semibold">Invite your crew</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Send this to your friends &mdash; they&apos;ll sign up and land straight in the workout module.
      </p>

      <CopyInviteLink inviteCode={inviteCode} signupPath="/signup" />

      <h2 className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Crew</h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {crew.map((member) => (
          <li key={member.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>{member.display_name ?? "Unnamed"}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              {ROLE_LABELS[member.role] ?? member.role}
            </span>
          </li>
        ))}
        {crew.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">No one&apos;s joined yet.</li>
        )}
      </ul>
    </div>
  );
}
