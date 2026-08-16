import { LogOut, ShieldCheck } from "lucide-react";
import { signOut } from "./actions";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { PageHeader } from "@/components/ui/page-header";
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
    <div>
      {/* The masthead is mobile-only: on desktop the settings layout already
          puts a persistent rail on the left, and a second page title above it
          would just be the word "Settings" twice. */}
      <div className="md:hidden">
        <PageHeader eyebrow="Alan OS" title="Settings" />
      </div>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 md:mx-0 md:max-w-none md:px-0 md:py-0">
        {profile && (
          <Panel>
            <div className="flex items-center gap-3 p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-rule font-heading text-sm font-extrabold">
                {(profile.displayName ?? profile.email ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {profile.displayName ?? "Unnamed"}
                </p>
                <p className="micro-sm mt-0.5 truncate text-muted-foreground">
                  {profile.email}
                </p>
              </div>
              {profile.role === "owner" ? (
                <Tag tone="primary" filled>
                  <ShieldCheck className="size-3" />
                  Admin
                </Tag>
              ) : (
                <Tag>{ROLE_LABELS[profile.role] ?? profile.role}</Tag>
              )}
            </div>
          </Panel>
        )}

        <SettingsNav
          accountLinks={accountLinks}
          moduleLinks={moduleLinks}
          adminLink={adminLink}
          className="md:hidden"
        />

        <div className="hatch hidden border-2 border-rule p-8 text-center md:block">
          <p className="micro text-muted-foreground">Pick a section from the left</p>
        </div>

        <form action={signOut}>
          <Button type="submit" variant="outline" block>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
