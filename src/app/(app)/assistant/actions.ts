"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { askAssistant, type AssistantMessage, type AssistantReply } from "@/lib/ai/assistant";
import { getUsageSummary, type UsageSummary } from "@/lib/ai/usage";
import { isAiConfigured } from "@/lib/ai/gemini";

export async function ask(input: {
  question: string;
  history: AssistantMessage[];
}): Promise<AssistantReply & { usage: UsageSummary }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const reply = await askAssistant({
    // The user's own client, so every tool runs under their session and Row
    // Level Security is what stops the assistant seeing anyone else's data.
    // Nothing in this path ever touches a service-role client.
    ctx: { supabase, userId: user.id },
    displayName: profile.displayName,
    moduleAccess: profile.moduleAccess,
    history: input.history,
    question: input.question,
  });

  // If it changed something, the screens showing that thing are now stale.
  if (reply.actions.length > 0) {
    revalidatePath("/today");
    revalidatePath("/plan");
    revalidatePath("/money");
    revalidatePath("/shopping");
  }

  return { ...reply, usage: await getUsageSummary() };
}

export async function getAssistantStatus(): Promise<{
  configured: boolean;
  usage: UsageSummary;
}> {
  return { configured: isAiConfigured(), usage: await getUsageSummary() };
}
