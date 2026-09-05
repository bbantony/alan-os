import { redirect } from "next/navigation";

import { PageHeader, HeaderFact } from "@/components/ui/page-header";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getUsageSummary } from "@/lib/ai/usage";
import { isAiConfigured } from "@/lib/ai/gemini";
import { AssistantChat } from "./assistant-chat";

/**
 * One place to ask the app anything.
 *
 * It isn't gated on a module of its own — what it can *do* is gated instead,
 * tool by tool, on the same module_access grid the nav and the route guard
 * use (see lib/ai/tools.ts). An account with only Workout access gets an
 * assistant that can talk about training and nothing else, without a separate
 * permission having to be invented for it.
 *
 * `?q=` is how the global capture sheet hands a question over: whatever was
 * typed (or dictated) into the sheet arrives here already asked, so the sheet
 * never has to become a second chat window of its own.
 */
export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; t?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const [{ q, t }, usage] = await Promise.all([searchParams, getUsageSummary()]);

  return (
    <div>
      <PageHeader
        eyebrow="Ask the app"
        title="Assistant"
        meta={
          <>
            <HeaderFact>Reads and updates what you can see</HeaderFact>
            <HeaderFact>AI this month: {usage.label}</HeaderFact>
          </>
        }
      />

      <div className="mx-auto flex max-w-2xl flex-col px-4 py-4 md:px-6 md:py-6">
        <AssistantChat
          configured={isAiConfigured()}
          initialUsage={usage}
          moduleAccess={profile.moduleAccess}
          initialQuestion={typeof q === "string" && q.trim() ? q.trim() : null}
          /* A one-shot token from the sheet. Two identical questions sent
             minutes apart must both be asked, and the question text alone
             cannot tell them apart — this can. */
          questionKey={typeof t === "string" && t ? t : null}
        />
      </div>
    </div>
  );
}
