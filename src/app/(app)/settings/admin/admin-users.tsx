"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Flame } from "lucide-react";
import { MODULE_IDS, MODULE_LABELS } from "@/lib/permissions";
import { formatInAppTimezone } from "@/lib/time";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { assignUserCrew, getAdminUserWorkoutSummary, setUserModuleAccess, type AdminCrewRow, type AdminUserRow, type AdminUserWorkoutSummary } from "./actions";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  workout_member: "Friend",
  full_user: "Full user",
};

export function AdminUsers({ initialUsers, crews }: { initialUsers: AdminUserRow[]; crews: AdminCrewRow[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [workoutSummaries, setWorkoutSummaries] = useState<Record<string, AdminUserWorkoutSummary>>({});
  const [loadingSummary, setLoadingSummary] = useState<string | null>(null);

  async function handleToggleModule(userId: string, moduleId: (typeof MODULE_IDS)[number]) {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    const nextEnabled = !user.module_access[moduleId];
    const nextAccess = { ...user.module_access, [moduleId]: nextEnabled };
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, module_access: nextAccess } : u)));
    await setUserModuleAccess({ userId, access: nextAccess });
    toast.success(`${MODULE_LABELS[moduleId]} ${nextEnabled ? "enabled" : "disabled"} for ${user.display_name ?? "this user"}`);
  }

  async function handleCrewChange(userId: string, crewId: string) {
    const user = users.find((u) => u.id === userId);
    const resolvedCrewId = crewId === "" ? null : crewId;
    const crewName = crews.find((c) => c.id === resolvedCrewId)?.name ?? null;
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, crew_id: resolvedCrewId, crew_name: crewName } : u)));
    await assignUserCrew({ userId, crewId: resolvedCrewId });
    toast.success(
      crewName
        ? `${user?.display_name ?? "User"} moved to ${crewName}`
        : `${user?.display_name ?? "User"} removed from their crew`
    );
  }

  async function handleExpand(userId: string) {
    if (expandedId === userId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(userId);
    if (!workoutSummaries[userId]) {
      setLoadingSummary(userId);
      const summary = await getAdminUserWorkoutSummary(userId);
      setWorkoutSummaries((prev) => ({ ...prev, [userId]: summary }));
      setLoadingSummary(null);
    }
  }

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Users</h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {users.map((user) => {
          const isExpanded = expandedId === user.id;
          const summary = workoutSummaries[user.id];
          return (
            <li key={user.id}>
              <div className="px-4 py-3">
                <button
                  onClick={() => handleExpand(user.id)}
                  className="tap-press flex w-full items-center gap-2 text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user.display_name ?? "Unnamed"}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    {ROLE_LABELS[user.role] ?? user.role}
                  </span>
                </button>

                {isExpanded && (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    {user.role !== "owner" && (
                      <>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Crew</label>
                          <Select
                            value={user.crew_id ?? ""}
                            onChange={(e) => handleCrewChange(user.id, e.target.value)}
                            className="h-8"
                          >
                            <option value="">No crew</option>
                            {crews.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </Select>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                            Can open these modules
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {MODULE_IDS.map((id) => (
                              <label key={id} className="flex items-center justify-between gap-2 text-xs">
                                {MODULE_LABELS[id]}
                                <Switch
                                  checked={user.module_access[id]}
                                  onCheckedChange={() => handleToggleModule(user.id, id)}
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    <div>
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Workout activity</p>
                      {loadingSummary === user.id ? (
                        <p className="text-xs text-muted-foreground">Loading…</p>
                      ) : summary ? (
                        <div className="rounded-lg bg-muted/60 p-2.5 text-xs">
                          <div className="mb-1 flex items-center gap-1.5">
                            <Flame className="size-3.5 text-accent" />
                            <span className="tabular font-medium">{summary.currentStreak} day streak</span>
                            <span className="text-muted-foreground">
                              · {summary.totalWorkouts} total · {summary.loggedToday ? "logged today" : "not logged today"}
                            </span>
                          </div>
                          {summary.recentPrs.length > 0 ? (
                            <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                              {summary.recentPrs.map((pr, i) => (
                                <li key={i}>
                                  {pr.exerciseName} — {pr.kind} PR ({pr.value}) on{" "}
                                  {formatInAppTimezone(pr.achievedAt, { dateStyle: "medium" })}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-muted-foreground">No PRs yet.</p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {users.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No users yet.</li>}
      </ul>
    </div>
  );
}
