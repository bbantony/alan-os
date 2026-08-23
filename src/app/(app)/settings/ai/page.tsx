import Link from "next/link";

import { SettingsPageShell } from "../settings-page-shell";
import { Panel, PanelHead, PanelEmpty } from "@/components/ui/panel";
import { Stat, StatStrip } from "@/components/ui/stat";
import { Micro, Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { getUsageByFeature, getUsageSummary } from "@/lib/ai/usage";
import { isAiConfigured } from "@/lib/ai/gemini";
import { MODELS, formatMicros } from "@/lib/ai/models";
import { getPreferences } from "../preferences-actions";
import { AiPreferences } from "./ai-preferences";

/**
 * What the AI has actually cost, this month, by feature.
 *
 * This page exists because of one sentence from Alan: "my fear is the expense
 * as well since there will be a lot of data". The honest answer to that fear
 * isn't a reassurance, it's a meter — every model call in the app is recorded
 * (see lib/ai/usage.ts) and this is where the total is readable, alongside the
 * hard monthly ceiling that stops it running away.
 */

const FEATURE_LABELS: Record<string, string> = {
  assistant: "Assistant",
  receipt: "Reading receipts",
  "csv-import": "Sorting bank imports",
  briefing: "Morning briefing",
  review: "Reviews",
  // Every slug passed to callGeminiJson/callGeminiWithTools needs a line here,
  // or the spend list shows Alan a raw slug like "weekly-patterns".
  "weekly-patterns": "Weekly patterns",
};

export default async function AiSettingsPage() {
  const [usage, byFeature, preferences] = await Promise.all([
    getUsageSummary(),
    getUsageByFeature(),
    getPreferences(),
  ]);
  const configured = isAiConfigured();

  return (
    <SettingsPageShell title="AI & cost">
      {!configured && (
        <Panel tone="raised">
          <PanelHead title="Not switched on yet" />
          <div className="flex flex-col gap-2 px-3 py-3 text-sm">
            <p>
              The AI features need a free key from Google AI Studio. Until it&rsquo;s
              added, receipt reading and bank-import sorting fall back to typing
              things in by hand, and the assistant can&rsquo;t answer at all.
            </p>
            <p className="text-muted-foreground">
              The Manual&rsquo;s Phase 5 section has the exact steps.
            </p>
          </div>
        </Panel>
      )}

      <AiPreferences initial={preferences} />

      <StatStrip columns={2}>
        <Stat
          label="This month"
          value={formatMicros(usage.spentMicros)}
          sub={`across ${usage.calls} request${usage.calls === 1 ? "" : "s"}`}
          tone={usage.overBudget ? "alert" : "default"}
          meter={Math.min(1, usage.spentMicros / usage.budgetMicros)}
        />
        <Stat
          label="Monthly ceiling"
          value={formatMicros(usage.budgetMicros)}
          sub="hard stop — nothing can spend past it"
        />
      </StatStrip>

      <Panel>
        <PanelHead title="Where it went" count={byFeature.length || undefined} />
        {byFeature.length === 0 ? (
          <PanelEmpty>Nothing yet this month.</PanelEmpty>
        ) : (
          <ul>
            {byFeature.map((f, i) => (
              <li
                key={f.feature}
                className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2.5 text-sm",
                  i > 0 && "border-t border-hairline"
                )}
              >
                <span className="min-w-0 truncate">
                  {FEATURE_LABELS[f.feature] ?? f.feature}
                  <Micro className="ml-2">{f.calls} request{f.calls === 1 ? "" : "s"}</Micro>
                </span>
                <span className="shrink-0 text-sm font-bold tabular">
                  {formatMicros(f.costMicros)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelHead title="What each job uses" />
        <ul>
          {(Object.entries(MODELS) as [keyof typeof MODELS, (typeof MODELS)[keyof typeof MODELS]][]).map(
            ([tier, spec], i) => (
              <li
                key={tier}
                className={cn("px-3 py-2.5", i > 0 && "border-t border-hairline")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold capitalize">{tier}</span>
                  <Tag>{spec.id}</Tag>
                </div>
                <Micro className="mt-1 block">{spec.note}</Micro>
              </li>
            )
          )}
        </ul>
        <p className="hatch border-t-2 border-rule px-3 py-2.5">
          <Micro>
            Cheaper jobs use cheaper models on purpose. A whole month of normal
            use costs less than a coffee — see the Manual for the arithmetic.
          </Micro>
        </p>
      </Panel>

      <Panel>
        <PanelRowLink />
      </Panel>
    </SettingsPageShell>
  );
}

function PanelRowLink() {
  return (
    <Link
      href="/assistant"
      className="tap-press flex items-center justify-between gap-3 px-3 py-3 text-sm transition-colors hover:bg-muted"
    >
      <span>
        <span className="block font-semibold">Open the assistant</span>
        <Micro className="block">Ask about anything in the app</Micro>
      </span>
      <span aria-hidden>→</span>
    </Link>
  );
}
