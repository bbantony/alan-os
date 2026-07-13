"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ThemeSettings } from "@/lib/palettes";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function saveThemeSettings(theme: ThemeSettings) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("profiles")
    .update({ theme_settings: theme })
    .eq("id", user.id);

  revalidatePath("/settings/appearance");
}

export async function changePassword(formData: FormData) {
  const password = formData.get("password")?.toString() ?? "";
  const confirm = formData.get("confirm")?.toString() ?? "";

  if (password.length < 6) {
    redirect(`/settings/password?error=${encodeURIComponent("Use at least 6 characters.")}`);
  }
  if (password !== confirm) {
    redirect(`/settings/password?error=${encodeURIComponent("Passwords don't match.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/settings/password?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/settings/password?success=1`);
}
