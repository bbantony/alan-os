// Everything about how the app behaves that used to be a constant in a file.
//
// The rule, and it matters: nothing reads `profiles.preferences` directly.
// Stored JSON is always partial — an account saves one toggle and the other
// twenty keys are simply absent — so every read goes through
// `resolvePreferences`, which fills the gaps from DEFAULTS. That's the same
// normalise-don't-merge pattern as `resolveModuleAccess` (lib/permissions.ts)
// and `normalizeThemeSettings` (lib/palettes.ts), both of which exist because
// this exact problem bit before.
//
// The defaults below are deliberately the behaviour the app *already had* when
// each value was hardcoded, so turning this on changes nothing for anyone until
// they actually go and change something.

export type WeekStart = "monday" | "sunday";
export type AiBoldness = "notice" | "suggest" | "act";
export type PlanView = "list" | "calendar" | "agenda";
export type ShoppingSort = "category" | "alphabetical" | "recent";

/** Panels on the Today console, in the order they can be arranged. */
export const TODAY_PANEL_IDS = [
  "outlook", "vitals", "bills", "timeline", "console", "focus", "jump",
] as const;

/**
 * Panels that existed before `todayPanelsKnown` was introduced (22 Aug 2026).
 *
 * A saved layout is a list of VISIBLE panels, so "not in the list" has always
 * meant "hidden". That made a newly added panel indistinguishable from a
 * deliberately hidden one, and a new panel would have stayed invisible to
 * anyone who had ever opened Settings → Today — silently, forever. Stored
 * preferences written before this date have no `todayPanelsKnown` key, so they
 * are treated as having known exactly these six.
 */
const PANELS_KNOWN_BEFORE_OUTLOOK: readonly TodayPanelId[] = [
  "vitals", "bills", "timeline", "console", "focus", "jump",
];
export type TodayPanelId = (typeof TODAY_PANEL_IDS)[number];

export const TODAY_PANEL_LABELS: Record<TodayPanelId, string> = {
  outlook: "Today's outlook",
  vitals: "The numbers strip",
  bills: "About to land",
  timeline: "Today so far",
  console: "What's on today",
  focus: "Focus & evening ritual",
  jump: "Jump to",
};

export interface NotificationPreferences {
  /** Nothing is pushed between these two hours, local to the profile timezone. */
  quietHoursStart: number;
  quietHoursEnd: number;
  quietHoursEnabled: boolean;
  taskNudges: boolean;
  routineReminders: boolean;
  crewPrs: boolean;
  billsDue: boolean;
  weeklyReview: boolean;
  /** How many days before a repeating payment lands to say something. */
  billLeadDays: number;
}

export interface Preferences {
  weekStart: WeekStart;

  // Plan — all four were fixed in lib/time.ts and the task form.
  workHoursStart: number;
  workHoursEnd: number;
  workWeekendsOff: boolean;
  eveningRitualHour: number;
  defaultNudgeMinutes: number | null;
  defaultPlanView: PlanView;

  // Shopping
  stapleResurfaceDays: number;
  stapleLearnFromHistory: boolean;
  receiptAutoTick: boolean;
  shoppingSort: ShoppingSort;

  // Money
  defaultAccountId: string | null;
  paydayAnchorDay: number | null;
  recurringAutoPost: boolean;
  reconcileReminder: boolean;

  /**
   * Workout — how much the +/- buttons move the weight, IN THE DISPLAY UNIT
   * (so 2.5 means 2.5 lb on a lbs profile, 2.5 kg on a kg one).
   *
   * Null means "use the default for the unit" — 2.5 lb or 1 kg. It is stored in
   * the display unit rather than kg on purpose: this is the number Alan thinks
   * in when he looks at the plates on the bar, and storing it converted is what
   * produced the 1.1 lb stepper this setting exists to replace.
   */
  weightIncrement: number | null;

  // AI
  aiMonthlyBudgetMicros: number;
  aiBoldness: AiBoldness;
  aiReceipts: boolean;
  aiCsvImport: boolean;
  aiAssistant: boolean;
  aiWeeklyPatterns: boolean;
  aiDailyOutlook: boolean;

  notifications: NotificationPreferences;
  todayPanels: TodayPanelId[];
  /**
   * Every panel id this account's settings have ever been shown. Anything in
   * TODAY_PANEL_IDS but not in here is NEW, and is made visible rather than
   * treated as hidden. See PANELS_KNOWN_BEFORE_OUTLOOK.
   */
  todayPanelsKnown: TodayPanelId[];
}

export const DEFAULT_PREFERENCES: Preferences = {
  weekStart: "monday",

  // 8am-6pm weekdays — what `isOutsideWorkHours` hardcoded.
  workHoursStart: 8,
  workHoursEnd: 18,
  workWeekendsOff: true,
  // 8pm — what `isEveningPlanningTime` hardcoded.
  eveningRitualHour: 20,
  defaultNudgeMinutes: null,
  defaultPlanView: "list",

  // 14 days for everything — what `STAPLE_RESURFACE_DAYS` hardcoded. Now only
  // the fallback for items without enough purchase history to learn from.
  stapleResurfaceDays: 14,
  stapleLearnFromHistory: true,
  receiptAutoTick: true,
  shoppingSort: "category",

  defaultAccountId: null,
  paydayAnchorDay: null,
  recurringAutoPost: true,
  reconcileReminder: true,

  // Null = 2.5 lb / 1 kg, matching what the steppers were always meant to do.
  weightIncrement: null,

  // $5 — what `MONTHLY_BUDGET_MICROS` hardcoded.
  aiMonthlyBudgetMicros: 5_000_000,
  // Alan's own choice: it may offer a one-tap action, never act unprompted.
  aiBoldness: "suggest",
  aiReceipts: true,
  aiCsvImport: true,
  aiAssistant: true,
  aiWeeklyPatterns: true,
  aiDailyOutlook: true,

  notifications: {
    quietHoursEnabled: true,
    quietHoursStart: 22,
    quietHoursEnd: 7,
    taskNudges: true,
    routineReminders: true,
    crewPrs: true,
    billsDue: true,
    weeklyReview: true,
    billLeadDays: 2,
  },

  todayPanels: [...TODAY_PANEL_IDS],
  todayPanelsKnown: [...TODAY_PANEL_IDS],
};

function num(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Turns whatever is in the database into a complete, in-range Preferences.
 *
 * Every value is clamped as well as defaulted. That isn't paranoia about the UI
 * — it's that these numbers drive real behaviour (an hour of 30 would make
 * "evening" never arrive, a staple interval of 0 would resurface everything
 * every day), and a stored value from an older shape of this file should
 * degrade to something sane rather than break a screen.
 */
export function resolvePreferences(raw: unknown): Preferences {
  const p = (raw ?? {}) as Record<string, unknown>;
  const n = (p.notifications ?? {}) as Record<string, unknown>;
  const d = DEFAULT_PREFERENCES;

  const isPanelId = (id: unknown): id is TodayPanelId =>
    typeof id === "string" && (TODAY_PANEL_IDS as readonly string[]).includes(id);

  const savedPanels = Array.isArray(p.todayPanels)
    ? (p.todayPanels.filter(isPanelId) as TodayPanelId[])
    : null;

  // Which ids this account's settings have already had the chance to hide.
  // Absent key = preferences written before the concept existed.
  const known = Array.isArray(p.todayPanelsKnown)
    ? (p.todayPanelsKnown.filter(isPanelId) as TodayPanelId[])
    : PANELS_KNOWN_BEFORE_OUTLOOK;

  // A panel nobody has ever been offered cannot have been hidden on purpose, so
  // it goes in — at the front, because a new panel that lands below the fold of
  // an already-full dashboard may as well not exist. Anything missing that IS
  // known stays missing: that is a deliberate hide and must be respected.
  const panels = savedPanels
    ? [...TODAY_PANEL_IDS.filter((id) => !known.includes(id) && !savedPanels.includes(id)), ...savedPanels]
    : d.todayPanels;

  return {
    weekStart: oneOf(p.weekStart, ["monday", "sunday"] as const, d.weekStart),

    workHoursStart: num(p.workHoursStart, d.workHoursStart, 0, 23),
    workHoursEnd: num(p.workHoursEnd, d.workHoursEnd, 1, 24),
    workWeekendsOff: bool(p.workWeekendsOff, d.workWeekendsOff),
    eveningRitualHour: num(p.eveningRitualHour, d.eveningRitualHour, 12, 23),
    defaultNudgeMinutes:
      p.defaultNudgeMinutes === null || p.defaultNudgeMinutes === undefined
        ? d.defaultNudgeMinutes
        : num(p.defaultNudgeMinutes, 0, 0, 20160),
    defaultPlanView: oneOf(p.defaultPlanView, ["list", "calendar", "agenda"] as const, d.defaultPlanView),

    stapleResurfaceDays: num(p.stapleResurfaceDays, d.stapleResurfaceDays, 1, 365),
    stapleLearnFromHistory: bool(p.stapleLearnFromHistory, d.stapleLearnFromHistory),
    receiptAutoTick: bool(p.receiptAutoTick, d.receiptAutoTick),
    shoppingSort: oneOf(p.shoppingSort, ["category", "alphabetical", "recent"] as const, d.shoppingSort),

    defaultAccountId: typeof p.defaultAccountId === "string" ? p.defaultAccountId : null,
    paydayAnchorDay:
      p.paydayAnchorDay === null || p.paydayAnchorDay === undefined
        ? null
        : num(p.paydayAnchorDay, 1, 1, 31),
    recurringAutoPost: bool(p.recurringAutoPost, d.recurringAutoPost),
    reconcileReminder: bool(p.reconcileReminder, d.reconcileReminder),

    // Not clamped through `num`, which rounds to whole numbers — 2.5 is the
    // single most likely value here. Bounded to something a plate could
    // plausibly be so a stray keystroke can't make the buttons useless.
    weightIncrement:
      typeof p.weightIncrement === "number" &&
      Number.isFinite(p.weightIncrement) &&
      p.weightIncrement > 0
        ? Math.min(50, Math.max(0.1, Math.round(p.weightIncrement * 100) / 100))
        : null,

    // Floor of 50 cents: a cap low enough to block everything would look like
    // the AI features are broken rather than switched off.
    aiMonthlyBudgetMicros: num(p.aiMonthlyBudgetMicros, d.aiMonthlyBudgetMicros, 500_000, 100_000_000),
    aiBoldness: oneOf(p.aiBoldness, ["notice", "suggest", "act"] as const, d.aiBoldness),
    aiReceipts: bool(p.aiReceipts, d.aiReceipts),
    aiCsvImport: bool(p.aiCsvImport, d.aiCsvImport),
    aiAssistant: bool(p.aiAssistant, d.aiAssistant),
    aiWeeklyPatterns: bool(p.aiWeeklyPatterns, d.aiWeeklyPatterns),
    aiDailyOutlook: bool(p.aiDailyOutlook, d.aiDailyOutlook),

    notifications: {
      quietHoursEnabled: bool(n.quietHoursEnabled, d.notifications.quietHoursEnabled),
      quietHoursStart: num(n.quietHoursStart, d.notifications.quietHoursStart, 0, 23),
      quietHoursEnd: num(n.quietHoursEnd, d.notifications.quietHoursEnd, 0, 23),
      taskNudges: bool(n.taskNudges, d.notifications.taskNudges),
      routineReminders: bool(n.routineReminders, d.notifications.routineReminders),
      crewPrs: bool(n.crewPrs, d.notifications.crewPrs),
      billsDue: bool(n.billsDue, d.notifications.billsDue),
      weeklyReview: bool(n.weeklyReview, d.notifications.weeklyReview),
      billLeadDays: num(n.billLeadDays, d.notifications.billLeadDays, 0, 14),
    },

    // An empty saved list means "I hid everything", which is a legitimate if
    // odd choice; a *missing* list means never configured, and gets the lot.
    todayPanels: panels,
    // Resolving is not saving: this reports every id that now exists, and the
    // Today settings screen persists it on the next change. Until then a new
    // panel keeps being treated as new, which only means it keeps being shown.
    todayPanelsKnown: [...TODAY_PANEL_IDS],
  };
}

/**
 * Is `hour` inside the quiet window?
 *
 * Handles the overnight case, which is the normal one — 22:00 to 07:00 wraps
 * past midnight, so a naive `start <= h && h < end` would be false all night
 * and true all day, i.e. exactly backwards.
 */
export function isQuietHour(hour: number, prefs: NotificationPreferences): boolean {
  if (!prefs.quietHoursEnabled) return false;
  const { quietHoursStart: start, quietHoursEnd: end } = prefs;
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
