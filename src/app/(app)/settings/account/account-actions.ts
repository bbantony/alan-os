"use server";

import { extForMimeType } from "@/lib/mime";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/**
 * Uploads a profile photo and points `avatar_url` at it.
 *
 * The client downscales to 512px first (src/lib/images.ts, the same helper
 * receipts use), which is both why this fits comfortably inside the 1 MB
 * Server Action body limit and why a 4 MB camera photo doesn't become a 4 MB
 * download on every feed card.
 *
 * The old file is deleted after the new URL is saved, not before: if the
 * upload half fails, you still have the avatar you had.
 */
export async function uploadAvatar(formData: FormData): Promise<{ url?: string; error?: string }> {
  const { supabase, user } = await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No photo was attached." };
  if (file.size > 2 * 1024 * 1024) return { error: "That photo is too big. Try another." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const mimeType = file.type || "image/jpeg";
  const path = `${user.id}/${crypto.randomUUID()}.${extForMimeType(mimeType)}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: mimeType });
  if (uploadError) return { error: "Couldn't upload that. Try again." };

  const { data: publicUrl } = supabase.storage.from("avatars").getPublicUrl(path);

  const { error: saveError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl.publicUrl })
    .eq("id", user.id);
  if (saveError) return { error: saveError.message };

  // Tidy up the one it replaced, so the bucket doesn't accumulate every photo
  // you've ever set. Best-effort: a failure here costs storage, not correctness.
  const previous = profile?.avatar_url as string | null;
  if (previous) {
    const marker = "/avatars/";
    const index = previous.indexOf(marker);
    if (index !== -1) {
      const oldPath = previous.slice(index + marker.length);
      if (oldPath.startsWith(`${user.id}/`)) {
        await supabase.storage.from("avatars").remove([oldPath]);
      }
    }
  }

  revalidatePath("/", "layout");
  return { url: publicUrl.publicUrl };
}

export async function removeAvatar(): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}
