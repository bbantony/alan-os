import { LogOut, ShieldCheck } from "lucide-react";
import { signOut } from "./actions";
import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getVisibleSettingsLinks } from "./settings-links";
import { SettingsNav } from "./settings-nav";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner (admin)",
  workout_member: "Friend",
  full_user: "Full account",
};

export default async function SettingsPage() {
  const profile = await getCurrentProfile();
  const { accountLinks, moduleLinks, adminLink } = getVisibleSettingsLinks(profile);

  return (
    <div className="mx-auto max-w-lg px-4 py-8 md:mx-0 md:max-w-none md:px-0 md:py-0">
      <h1 className="mb-6 font-heading text-2xl font-semibold md:hidden">Settings</h1>

      {profile && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-sm font-semibold text-primary">
            {(profile.displayName ?? profile.email ?? "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{profile.displayName ?? "Unnamed"}</p>
            <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
          </div>
          {profile.role === "owner" && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              <ShieldCheck className="size-3" />
              Admin
            </span>
          )}
          {profile.role !== "owner" && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {ROLE_LABELS[profile.role] ?? profile.role}
            </span>
          )}
        </div>
      )}

      <SettingsNav
        accountLinks={accountLinks}
        moduleLinks={moduleLinks}
        adminLink={adminLink}
        className="mb-6 md:hidden"
      />

      <div className="mb-6 hidden rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 text-center text-sm text-muted-foreground md:block">
        Pick a section from the left.
      </div>

      <form action={signOut}>
        <Button type="submit" variant="outline" className="w-full gap-2">
          <LogOut className="size-4" />
          Sign out
        </Button>
      </form>
    </div>
  );
}
