import Link from "next/link";
import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AuthIllustration } from "@/components/illustrations";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <AuthIllustration className="mb-2 size-10 text-primary" />
          <CardTitle className="font-heading text-2xl">Alan OS</CardTitle>
          <CardDescription>Sign in to your second brain.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={login} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Have an invite code?{" "}
            <Link href="/signup" className="text-primary underline underline-offset-4">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
