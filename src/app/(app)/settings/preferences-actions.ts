"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolvePreferences, type Preferences } from "@/lib/preferences";
import { friendlyDbError } from "@/lib/db-errors";

// The one way settings get written.
//
// Every settings screen calls this with just the keys it changed. The merge
// happens here against what's already stored — not against DEFAULT_PREFERENCES —
// so saving one toggle on the Shopping page cannot silently reset a value the
// Notifications page set five minutes ago. That's the whole reason this isn't
// just an `update` from each page.

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function getPreferences(): Promise<Preferences> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .maybeSingle();
  return resolvePreferences(data?.preferences);
}

/**
 * Saves a partial change and returns the whole resolved result.
 *
 * `notifications` is merged one level deeper than the rest, because it's the
 * only nested object — spreading it shallowly would wipe every sibling switch
 * whenever one was flipped.
 */
export async function updatePreferences(
  patch: Partial<Preferences>
): Promise<{ preferences: Preferences; error?: string }> {
  const { supabase, user } = await requireUser();

  const { data: existing } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .maybeSingle();

  const current = (existing?.preferences ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...current, ...patch };

  if (patch.notifications) {
    merged.notifications = {
      ...((current.notifications as Record<string, unknown>) ?? {}),
      ...patch.notifications,
    };
  }

  // Stored resolved rather than raw: a value that arrived out of range would
  // otherwise sit in the database being clamped on every read, and the next
  // person to look at the row would see a number the app never honours.
  const resolved = resolvePreferences(merged);

  const { error } = await supabase
    .from("profiles")
    .update({ preferences: resolved })
    .eq("id", user.id);
  if (error) return { preferences: resolved, error: friendlyDbError(error) ?? "That didn't save. Try again." };

  // Preferences change how nearly every screen behaves, so everything that
  // reads them needs re-rendering.
  revalidatePath("/", "layout");
  return { preferences: resolved };
}

export async function updateProfileBasics(input: {
  displayName?: string;
  timezone?: string;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();

  const patch: Record<string, string> = {};
  if (input.displayName !== undefined) patch.display_name = input.displayName.trim();
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (Object.keys(patch).length === 0) return {};

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) return { error: friendlyDbError(error) ?? "That didn't save. Try again." };

  revalidatePath("/", "layout");
  return {};
}
