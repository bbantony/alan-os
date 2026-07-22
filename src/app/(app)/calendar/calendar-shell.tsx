"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
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

      <Segmented
        className="mb-4"
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
        <RemindersView initialReminders={initialReminders} gcalConnected={gcalConnected} groupBoundaries={groupBoundaries} />
      )}
    </div>
  );
}
