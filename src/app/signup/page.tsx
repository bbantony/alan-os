import Link from "next/link";
import { signup } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/nav/wordmark";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm border-2 border-rule bg-surface shadow-[var(--shadow-hard-lg)]">
        <div className="border-b-2 border-rule px-5 py-4">
          <Wordmark />
          <h1 className="display mt-3">Create account</h1>
          <p className="micro-sm mt-2 text-muted-foreground">Invite code required</p>
        </div>

        <form action={signup} className="flex flex-col gap-3 p-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inviteCode">Invite code</Label>
            <Input id="inviteCode" name="inviteCode" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName">Name</Label>
            <Input id="displayName" name="displayName" required autoComplete="name" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="border-2 border-destructive px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" block size="lg">
            Create account
          </Button>
        </form>

        <p className="border-t-2 border-rule bg-muted/40 px-5 py-3 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-foreground underline decoration-2 underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
