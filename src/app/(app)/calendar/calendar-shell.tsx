"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
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
}: {
  initialTab: Tab;
  initialAgenda: AgendaItem[];
  initialReminders: Reminder[];
  gcalConnected: boolean;
  groupBoundaries: { todayEnd: string; weekEnd: string };
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-24">
      <h1 className="mb-4 font-heading text-2xl font-semibold">Calendar</h1>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {(["agenda", "reminders"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "tap-press rounded-lg border px-3 py-2.5 text-sm font-medium capitalize",
              tab === t ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "agenda" ? (
        <AgendaView initialAgenda={initialAgenda} gcalConnected={gcalConnected} />
      ) : (
        <RemindersView initialReminders={initialReminders} gcalConnected={gcalConnected} groupBoundaries={groupBoundaries} />
      )}
    </div>
  );
}
