import { redirect } from "next/navigation";

import { PageHeader, HeaderFact } from "@/components/ui/page-header";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getUsageSummary } from "@/lib/ai/usage";
import { isAiConfigured } from "@/lib/ai/gemini";
import { questionFromShare } from "@/lib/share-target";
import { getConversation } from "./actions";
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
 * As of 6 Sep 2026 this is no longer the only place the chat lives — the
 * capture sheet renders the same component, so the assistant is a layer over
 * whatever screen you're on rather than a screen you go to. This page is the
 * full-size view of the same conversation, and the conversation itself now
 * comes out of the database (migration 0041) rather than starting blank every
 * time. It is read HERE, on the server, so the transcript is on screen in the
 * first paint instead of appearing a round trip later.
 *
 * One chat at a time, though: while you are standing on this page the capture
 * sheet leaves ITS chat out and shows only the forms, so there is never a
 * second composer, a second microphone or a second copy of this conversation
 * behind the sheet. The thread rendered here is also what the sheet resolves
 * to from any other screen — the component writes it down on mount.
 *
 * `?q=` used to be how the capture sheet handed a question over. The sheet
 * doesn't need it any more, but a launcher shortcut or an old bookmark may
 * still carry one, so it is still honoured: whatever it holds arrives here
 * already asked.
 *
 * IT IS ALSO WHERE ANDROID'S SHARE SHEET LANDS (7 Sep 2026). `manifest.json`
 * declares this page as the app's `share_target`, so sharing a link, a page or
 * a selection from any other app opens the assistant with those words IN THE
 * BOX, unsent. `questionFromShare` merges the three fields the share sheet
 * sends, because no two apps agree on which of them a link goes in.
 *
 * A SHARE USES ITS OWN PARAMETER (`?shared=`) AND NOT `?q=`, and the
 * difference is a safety rule rather than tidiness. `?q=` means "already
 * asked" and is sent on mount. A share is not a question — Alan chose to share
 * a page, not to ask for something to be done with it — and at his `suggest`
 * setting every non-money write runs the moment the model calls it. Mapping a
 * share onto `q` therefore let text from a stranger's web page, that he had
 * read none of, reach a tool. It did exactly that for about an hour; see
 * lib/share-target.ts.
 */
export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    t?: string;
    shared?: string;
    url?: string;
    title?: string;
  }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const [{ q, t, shared, url, title }, usage, conversation] = await Promise.all([
    searchParams,
    getUsageSummary(),
    // `conversation: null` means nothing has ever been asked. That is a new
    // chat, not a failure, and the component renders it as the openers.
    getConversation(),
  ]);

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
          timeZone={profile.timezone}
          initialConversation={conversation}
          /* Unchanged: a question somebody already asked, sent on mount.
             `typeof` guarded because Next hands back an ARRAY for a repeated
             parameter (`?q=a&q=b`), and calling .trim() on one throws and takes
             the whole page down rather than being ignored. */
          initialQuestion={typeof q === "string" && q.trim() ? q.trim() : null}
          /* A one-shot token from the sheet. Two identical questions sent
             minutes apart must both be asked, and the question text alone
             cannot tell them apart — this can. */
          questionKey={typeof t === "string" && t ? t : null}
          /* A share: into the box, never sent. Same `typeof` guard, for the
             same reason — these three arrive from outside the app entirely. */
          initialDraft={questionFromShare({
            shared: typeof shared === "string" ? shared : null,
            url: typeof url === "string" ? url : null,
            title: typeof title === "string" ? title : null,
          })}
        />
      </div>
    </div>
  );
}
