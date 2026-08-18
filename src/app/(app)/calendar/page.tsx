import { redirect } from "next/navigation";

// Calendar merged into Plan. The old page had two tabs: Agenda, which is now
// a view of Plan, and Reminders, which no longer exists as a concept — a
// reminder is a setting on a task rather than a thing of its own, so there is
// nothing left to list. Both old entry points land on the agenda view.
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; new?: string }>;
}) {
  const { new: isNew } = await searchParams;
  redirect(isNew === "1" ? "/plan?new=1" : "/plan?view=agenda");
}
