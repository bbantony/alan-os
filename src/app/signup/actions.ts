"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function signup(formData: FormData) {
  const inviteCode = formData.get("inviteCode")?.toString() ?? "";
  const displayName = formData.get("displayName")?.toString() ?? "";
  const email = formData.get("email")?.toString() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (inviteCode !== process.env.INVITE_CODE) {
    redirect(`/signup?error=${encodeURIComponent("That invite code isn't right.")}`);
  }

  // Supabase puts this URL in the confirmation email. Derived from the actual
  // request rather than a hardcoded/env value, so it's automatically correct
  // whether someone signs up from localhost during development or the real
  // deployed site — no config to keep in sync. Supabase's own dashboard
  // "Redirect URLs" allowlist (Authentication -> URL Configuration) still has
  // to include this URL or it silently falls back to the Site URL setting.
  const headersList = await headers();
  const host = headersList.get("host") ?? "alan-os-nine.vercel.app";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const emailRedirectTo = `${protocol}://${host}/login`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName }, emailRedirectTo },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  if (!data.session) {
    redirect(
      `/login?error=${encodeURIComponent(
        "Account created — check your email to confirm it, then sign in."
      )}`
    );
  }

  redirect("/today");
}
