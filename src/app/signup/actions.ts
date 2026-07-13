"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signup(formData: FormData) {
  const inviteCode = formData.get("inviteCode")?.toString() ?? "";
  const displayName = formData.get("displayName")?.toString() ?? "";
  const email = formData.get("email")?.toString() ?? "";
  const password = formData.get("password")?.toString() ?? "";

  if (inviteCode !== process.env.INVITE_CODE) {
    redirect(`/signup?error=${encodeURIComponent("That invite code isn't right.")}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
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
