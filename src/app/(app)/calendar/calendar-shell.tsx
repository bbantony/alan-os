"use client";

import { useState } from "react";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { PageHeader, HeaderFact } from "@/components/ui/page-header";
import type { AgendaItem } from "./actions";
import type { Reminder } from "@/lib/reminders/types";
import { AgendaView } from "./agenda-view";
import { RemindersView } from "./reminders-view";

type Tab = "agenda" | "reminders";

export function CalendarShell({
  initialTab,
  initialAgenda,
  initialReminders,
  gcalConnected,
  groupBoundaries,
  autoOpenNew = false,
}: {
  initialTab: Tab;
  initialAgenda: AgendaItem[];
  initialReminders: Reminder[];
  gcalConnected: boolean;
  groupBoundaries: { todayEnd: string; weekEnd: string };
  /** Set by the `?new=1` link the app-wide quick-add sends here. */
  autoOpenNew?: boolean;
}) {
  // `?new=1` means "make me a reminder", so it also decides which tab opens —
  // landing on Agenda with a reminder form on top would be disorienting.
  const [tab, setTab] = useState<Tab>(autoOpenNew ? "reminders" : initialTab);

  const activeReminders = initialReminders.filter((r) => r.status === "active").length;

  return (
    <div>
      <PageHeader
        eyebrow="Agenda and reminders"
        title="Calendar"
        meta={
          <>
            <HeaderFact>{initialAgenda.length} coming up</HeaderFact>
            <HeaderFact>{activeReminders} reminders</HeaderFact>
            {!gcalConnected && <HeaderFact>Google not connected</HeaderFact>}
          </>
        }
        actions={
          <Link
            href="/settings/calendar"
            aria-label="Calendar settings"
            className="tap-press flex size-9 items-center justify-center border-2 border-rule bg-surface transition-colors hover:bg-muted"
          >
            <Settings2 className="size-4" strokeWidth={2.5} />
          </Link>
        }
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        <Segmented
          options={[
            { value: "agenda", label: "Agenda" },
            { value: "reminders", label: "Reminders" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === "agenda" ? (
          <AgendaView initialAgenda={initialAgenda} gcalConnected={gcalConnected} />
        ) : (
          <RemindersView
            initialReminders={initialReminders}
            gcalConnected={gcalConnected}
            groupBoundaries={groupBoundaries}
            autoOpenNew={autoOpenNew}
          />
        )}
      </div>
    </div>
  );
}
