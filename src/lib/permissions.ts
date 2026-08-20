// The one shared source of truth for "can this account open this module" —
// replaces three independently-drifting checks that used to live in
// src/proxy.ts, src/components/nav/nav-items.ts, and settings/page.tsx.
// module_access is always a FULLY RESOLVED grid by the time it reaches here
// (see supabase/migrations/0018_admin_permissions.sql — handle_new_user and
// the admin_set_module_access RPC always write every key), so a missing key
// is a genuine anomaly, not "default to true" — resolveModuleAccess treats it
// as false rather than guessing.

// Journal and Vinyl were removed at Alan's request ("completely remove the
// placeholders ... I don't want any of that"). Their empty tables from
// migration 0024 are left in the database, unused, rather than dropped —
// he said "for now", and dropping tables is not reversible.
export const MODULE_IDS = ["tasks", "shopping", "workout", "calendar", "money"] as const;

export type ModuleId = (typeof MODULE_IDS)[number];
export type ModuleAccess = Record<ModuleId, boolean>;

export const MODULE_LABELS: Record<ModuleId, string> = {
  tasks: "Tasks",
  shopping: "Shopping",
  workout: "Workout",
  calendar: "Calendar & Reminders",
  money: "Money",
};

export const ALL_MODULES_ACCESS: ModuleAccess = {
  tasks: true,
  shopping: true,
  workout: true,
  calendar: true,
  money: true,
};

export const NO_MODULES_ACCESS: ModuleAccess = {
  tasks: false,
  shopping: false,
  workout: false,
  calendar: false,
  money: false,
};

export interface PermissionProfile {
  role: "owner" | "workout_member" | "full_user";
  moduleAccess: Partial<Record<string, unknown>> | null | undefined;
}

export function resolveModuleAccess(profile: PermissionProfile): ModuleAccess {
  if (profile.role === "owner") return ALL_MODULES_ACCESS;
  const raw = profile.moduleAccess ?? {};
  const resolved = { ...NO_MODULES_ACCESS };
  for (const id of MODULE_IDS) {
    resolved[id] = raw[id] === true;
  }
  return resolved;
}

// Routes whose URL doesn't match the module id that gates them.
//
// The rule below works by prefix-matching a path against the module ids, which
// silently stops working the moment a route is named something other than its
// module. `/plan` (Tasks and Calendar merged) is exactly that case: it matched
// nothing, so `moduleForPath` returned null and `canAccessPath` waved it
// through for every account — reopening precisely the direct-URL hole the
// proxy guard exists to close.
const ROUTE_MODULE_ALIASES: { prefix: string; module: ModuleId }[] = [
  { prefix: "/plan", module: "tasks" },
];

// Maps a pathname to the module it belongs to. Returns null for paths that
// aren't module-gated at all (/today, /more, /settings and its
// Appearance/Password sub-pages, /settings/admin) — those are handled by
// their own separate rule in canAccessPath below.
function moduleForPath(pathname: string): ModuleId | null {
  for (const alias of ROUTE_MODULE_ALIASES) {
    if (pathname.startsWith(alias.prefix)) return alias.module;
  }
  for (const id of MODULE_IDS) {
    if (pathname.startsWith(`/${id}`) || pathname.startsWith(`/settings/${id}`)) return id;
  }
  return null;
}

export function canAccessPath(profile: PermissionProfile, pathname: string): boolean {
  if (profile.role === "owner") return true;
  // /settings/admin can never be reached by a non-owner regardless of any
  // module_access toggle — there is no toggle for it, this is the one
  // hardcoded exception, same as the old workout/invite owner-only gate.
  if (pathname.startsWith("/settings/admin")) return false;

  const moduleId = moduleForPath(pathname);
  if (moduleId === null) return true; // /today, /more, /settings, /settings/appearance, /settings/password

  return resolveModuleAccess(profile)[moduleId];
}
