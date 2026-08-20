"use server";

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

export interface PushDevice {
  id: string;
  label: string;
  createdAt: string;
}

/**
 * The devices signed up to receive notifications.
 *
 * There has never been a way to see or remove these. An old phone, a laptop you
 * used once, a browser you've since wiped — each one keeps its subscription
 * forever, and every reminder goes to all of them. (The dispatcher does delete
 * a subscription the push service rejects outright, but a device that simply
 * stopped being yours isn't rejected — it's just somebody's old phone.)
 *
 * The endpoint is a long opaque URL, so a readable label is derived from it
 * rather than shown raw.
 */
export async function getPushDevices(): Promise<PushDevice[]> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, device_label, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return ((data as { id: string; endpoint: string; device_label: string | null; created_at: string }[]) ?? []).map(
    (row) => ({
      id: row.id,
      label: row.device_label ?? labelFromEndpoint(row.endpoint),
      createdAt: row.created_at,
    })
  );
}

function labelFromEndpoint(endpoint: string): string {
  try {
    const host = new URL(endpoint).hostname;
    if (host.includes("google")) return "Chrome or Android";
    if (host.includes("mozilla")) return "Firefox";
    if (host.includes("apple")) return "Safari or iPhone";
    if (host.includes("microsoft")) return "Edge";
    return host;
  } catch {
    return "A device";
  }
}

export async function revokePushDevice(input: { id: string }): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("id", input.id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/settings/notifications");
  return {};
}
