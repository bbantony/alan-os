import { getAdminCrews, getAdminUsers, getInviteCode } from "./actions";
import { SettingsPageShell } from "../settings-page-shell";
import { AdminUsers } from "./admin-users";
import { AdminCrews } from "./admin-crews";
import { CopyInviteLink } from "./copy-invite-link";

export default async function AdminPage() {
  const [users, crews, inviteCode] = await Promise.all([
    getAdminUsers(),
    getAdminCrews(),
    getInviteCode(),
  ]);

  return (
    <SettingsPageShell title="Users &amp; crews">
      <p className="text-sm text-muted-foreground">
        Decide which parts of the app each person can open, and which workout crew
        they&apos;re in.
      </p>

      <CopyInviteLink inviteCode={inviteCode} signupPath="/signup" />
      <AdminCrews initialCrews={crews} />
      <AdminUsers initialUsers={users} crews={crews} />
    </SettingsPageShell>
  );
}
