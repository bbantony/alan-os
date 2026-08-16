import { changePassword } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import { SettingsPageShell } from "../settings-page-shell";

export default async function PasswordSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;

  return (
    <SettingsPageShell title="Password">
      <Panel>
        <form action={changePassword} className="flex flex-col gap-3 p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" required minLength={6} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input id="confirm" name="confirm" type="password" required minLength={6} />
          </div>

          {error && (
            <p className="border-2 border-destructive px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {success && (
            <p className="border-2 border-ok px-3 py-2 text-sm text-ok">Password updated.</p>
          )}

          <Button type="submit" block>
            Update password
          </Button>
        </form>
      </Panel>
    </SettingsPageShell>
  );
}
