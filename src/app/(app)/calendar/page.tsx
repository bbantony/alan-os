import { todayInAppTimezone, zonedTimeToUtc } from "@/lib/time";
import { getAgenda, getReminders, getGcalStatus } from "./actions";
import { CalendarShell } from "./calendar-shell";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; new?: string }>;
}) {
  const [agenda, reminders, gcalStatus, params] = await Promise.all([
    getAgenda("today"),
    getReminders(),
    getGcalStatus(),
    searchParams,
  ]);

  const today = todayInAppTimezone();
  const [y, m, d] = today.split("-").map(Number);
  const todayEnd = zonedTimeToUtc({ year: y, month: m, day: d, hour: 23, minute: 59, second: 59 }).toISOString();
  // Date.UTC (used inside zonedTimeToUtc) normalizes an out-of-range day
  // field into the following month automatically, so `d + 7` just works.
  const weekEnd = zonedTimeToUtc({ year: y, month: m, day: d + 7, hour: 23, minute: 59, second: 59 }).toISOString();

  return (
    <CalendarShell
      initialTab={params.tab === "reminders" ? "reminders" : "agenda"}
      initialAgenda={agenda}
      initialReminders={reminders}
      gcalConnected={gcalStatus.connected}
      groupBoundaries={{ todayEnd, weekEnd }}
      autoOpenNew={params.new === "1"}
    />
  );
}
