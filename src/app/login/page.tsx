import Link from "next/link";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/nav/wordmark";

// The first screen anyone sees, so it sets the language before the app does:
// a framed block on a hard shadow, the mark at the top, and the display face
// doing the talking.
export default async function LoginPage({
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
          <h1 className="display mt-3">Sign in</h1>
          <p className="micro-sm mt-2 text-muted-foreground">Your second brain</p>
        </div>

        <form action={login} className="flex flex-col gap-3 p-5">
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
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="border-2 border-destructive px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" block size="lg">
            Sign in
          </Button>
        </form>

        <p className="border-t-2 border-rule bg-muted/40 px-5 py-3 text-center text-sm text-muted-foreground">
          Have an invite code?{" "}
          <Link
            href="/signup"
            className="font-semibold text-foreground underline decoration-2 underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
