import { getAdminCrews, getAdminUsers, getInviteCode } from "./actions";
import { AdminUsers } from "./admin-users";
import { AdminCrews } from "./admin-crews";
import { CopyInviteLink } from "./copy-invite-link";

export default async function AdminPage() {
  const [users, crews, inviteCode] = await Promise.all([getAdminUsers(), getAdminCrews(), getInviteCode()]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-2 font-heading text-2xl font-semibold">Users &amp; Crews</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Decide which parts of the app each person can open, and which workout crew they&apos;re in.
      </p>

      <CopyInviteLink inviteCode={inviteCode} signupPath="/signup" />

      <div className="mt-8">
        <AdminCrews initialCrews={crews} />
      </div>

      <div className="mt-8">
        <AdminUsers initialUsers={users} crews={crews} />
      </div>
    </div>
  );
}
