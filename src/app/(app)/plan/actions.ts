"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOwnGcalConnection, listEvents as gcalListEvents } from "@/lib/gcal/client";
import { isDueOnDate } from "@/lib/reminders/rrule";
import { utcToZonedParts, zonedTimeToUtc } from "@/lib/time";
import type { Task } from "@/lib/tasks/types";
import type { Routine } from "@/lib/routines/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/**
 * One item on the plan, wherever it came from.
 *
 * Tasks, routines and Google events used to be assembled differently by the
 * Agenda, the Today dashboard and (soon) the calendar grid, each with its own
 * idea of what counted and how to avoid duplicates. This is the one shape they
 * all speak now.
 */
export interface PlanItem {
  id: string;
  kind: "task" | "routine" | "event";
  title: string;
  /** ISO instant. For an all-day event this is the start of that day. */
  at: string;
  /** `YYYY-MM-DD` in the app's timezone — what the calendar grid buckets on. */
  dateIso: string;
  allDay: boolean;
  done: boolean;
  /** Minutes before `at` that a notification fires, if any. */
  nudgeMinutes: number | null;
  htmlLink: string | null;
  /** Set for tasks, so a row can link back to the thing itself. */
  taskId: string | null;
  routineId: string | null;
}

function dateKey(iso: string): string {
  const p = utcToZonedParts(new Date(iso));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function eachDate(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  const pad = (n: number) => String(n).padStart(2, "0");
  while (cur <= end) {
    out.push(`${cur.getUTCFullYear()}-${pad(cur.getUTCMonth() + 1)}-${pad(cur.getUTCDate())}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (out.length > 400) break; // guard against a bad range
  }
  return out;
}

/**
 * Everything scheduled between two dates, inclusive.
 *
 * Deliberately does NOT include reminder rows. Under the nudge model a
 * reminder fires *before* its task is due, so listing it would put the same
 * commitment on the agenda twice at two different times — once when you're
 * warned and once when it's actually due. The task is the thing; the nudge is
 * just how you find out about it, and it rides along on the item as
 * `nudgeMinutes`.
 */
export async function getPlanRange(
  startDateIso: string,
  endDateIso: string
): Promise<PlanItem[]> {
  const { supabase, user } = await requireUser();

  const [sy, sm, sd] = startDateIso.split("-").map(Number);
  const [ey, em, ed] = endDateIso.split("-").map(Number);
  const rangeStart = zonedTimeToUtc({ year: sy, month: sm, day: sd, hour: 0, minute: 0, second: 0 });
  const rangeEnd = zonedTimeToUtc({ year: ey, month: em, day: ed, hour: 23, minute: 59, second: 59 });

  const items: PlanItem[] = [];

  // ---- Tasks with a due date ----
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", user.id)
    .is("parent_task_id", null)
    .not("due_at", "is", null)
    .gte("due_at", rangeStart.toISOString())
    .lte("due_at", rangeEnd.toISOString());

  for (const t of (tasks as Task[]) ?? []) {
    if (!t.due_at) continue;
    items.push({
      id: `task-${t.id}`,
      kind: "task",
      title: t.title,
      at: t.due_at,
      dateIso: dateKey(t.due_at),
      allDay: false,
      done: !!t.completed_at,
      nudgeMinutes: t.notify_offset_minutes,
      htmlLink: null,
      taskId: t.id,
      routineId: null,
    });
  }

  // ---- Routines, expanded across the range ----
  // A routine is one row with a repeat rule, so its occurrences have to be
  // generated per day rather than queried. Only worth doing for a bounded
  // range, which is why this takes explicit start/end rather than "upcoming".
  const { data: routines } = await supabase
    .from("routines")
    .select("*")
    .eq("user_id", user.id)
    .eq("active", true);

  const { data: completions } = await supabase
    .from("routine_completions")
    .select("routine_id, completed_date")
    .eq("user_id", user.id)
    .gte("completed_date", startDateIso)
    .lte("completed_date", endDateIso);

  const doneKeys = new Set(
    (completions ?? []).map((c) => `${c.routine_id}:${c.completed_date}`)
  );

  const dates = eachDate(startDateIso, endDateIso);
  for (const r of (routines as Routine[]) ?? []) {
    const createdDate = r.created_at.slice(0, 10);
    for (const date of dates) {
      // A routine can't be due before it existed.
      if (date < createdDate) continue;
      let due = false;
      try {
        due = isDueOnDate(r.rrule, createdDate, date);
      } catch {
        continue; // an unparseable rule shouldn't take the whole page down
      }
      if (!due) continue;

      const [h, min] = (r.time_of_day ?? "09:00").split(":").map(Number);
      const [yy, mm, dd] = date.split("-").map(Number);
      const at = zonedTimeToUtc({
        year: yy, month: mm, day: dd,
        hour: Number.isFinite(h) ? h : 9,
        minute: Number.isFinite(min) ? min : 0,
        second: 0,
      }).toISOString();

      items.push({
        id: `routine-${r.id}-${date}`,
        kind: "routine",
        title: r.title,
        at,
        dateIso: date,
        allDay: !r.time_of_day,
        done: doneKeys.has(`${r.id}:${date}`),
        nudgeMinutes: null,
        htmlLink: null,
        taskId: null,
        routineId: r.id,
      });
    }
  }

  // ---- Google Calendar ----
  const connection = await getOwnGcalConnection();
  if (connection && connection.sync_enabled) {
    try {
      const events = await gcalListEvents(
        connection.refresh_token_encrypted,
        connection.calendar_id,
        rangeStart.toISOString(),
        rangeEnd.toISOString()
      );
      for (const e of events) {
        // Anything this app pushed to Google is already represented above by
        // the task or routine that created it — showing Google's copy as well
        // would double every single item once sync is switched on.
        if (e.title && (tasks ?? []).some((t) => (t as Task).title === e.title)) continue;
        items.push({
          id: `gcal-${e.id}`,
          kind: "event",
          title: e.title,
          at: e.start,
          dateIso: dateKey(e.start),
          allDay: !!e.allDay,
          done: false,
          nudgeMinutes: null,
          htmlLink: e.htmlLink ?? null,
          taskId: null,
          routineId: null,
        });
      }
    } catch {
      // Google unreachable — the plan still shows everything of Alan's own.
    }
  }

  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return items;
}
