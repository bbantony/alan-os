/**
 * Turns a Postgres error into a sentence Alan can act on.
 *
 * WHY THIS EXISTS. CLAUDE.md's first rule is that Alan is not a programmer and
 * cannot read an error message. Most of the app already honours that, because
 * most failures were network blips with hand-written messages. Then migration
 * 0035 added real constraints — a unique index on reconciliations, positivity
 * checks on budgets and goals — which turned "the database says no" into an
 * ORDINARY, EXPECTED outcome of a second tap or a typo. Passing `error.message`
 * straight through, as several actions did, would have put
 *
 *   duplicate key value violates unique constraint
 *   "reconciliations_user_account_date_idx"
 *
 * on his screen. A constraint that protects the data and then explains itself
 * in Postgres' voice has traded one bug for another.
 *
 * Every server action that can now hit a constraint runs its error through
 * here. Anything unrecognised falls back to a plain sentence rather than the
 * raw text — an unfamiliar failure is still not something he can read.
 */

/** The shape supabase-js returns. Kept loose: only these fields are read. */
export interface DbErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  constraint?: string;
}

// Constraint name -> what a person should be told. Keyed on the names created
// in the migrations, so a renamed constraint fails over to the generic message
// for its error class rather than leaking anything.
const BY_CONSTRAINT: Record<string, string> = {
  reconciliations_user_account_date_idx:
    "You've already balanced this account against a statement for that date. Open the earlier check instead of starting a new one.",
  routine_completions_user_routine_date_key:
    "This routine is already ticked off for today.",
  push_subscriptions_user_endpoint_key:
    "Notifications are already switched on for this device.",
  shopping_categories_user_name_idx:
    "You already have a shopping category with that name.",
  budgets_amount_positive: "Enter a budget amount bigger than zero.",
  savings_goals_target_positive: "Enter a goal amount bigger than zero.",
  transactions_amount_positive: "Enter an amount bigger than zero.",
  transactions_transfer_direction_valid:
    "Something about that transfer didn't add up. Reload the page and try again.",
  // Not constraints — tokens raised by delete_transfer (migration 0038). The
  // matcher below searches the whole message text, so they work the same way.
  transfer_direction_missing:
    "This transfer was logged before directions were recorded — log an opposite transfer to cancel it out.",
  transfer_legs_incomplete:
    "One half of this transfer is missing, so it can't be removed as a pair. Check both accounts on the Money screen.",
};

// Fallbacks by SQLSTATE class, used when the constraint isn't one we named.
const BY_CODE: Record<string, string> = {
  "23505": "That's already been saved once — check the list before adding it again.",
  "23514": "One of those numbers isn't allowed. Check the amount and try again.",
  "23503": "Something this depends on has been deleted. Reload the page and try again.",
  "23502": "Something required is missing. Fill in every field and try again.",
  "22003": "That number is too big.",
  "40001": "Something else changed at the same time. Try that again.",
  "42501": "You don't have permission to change that.",
};

/**
 * `null` when there is no error, so a caller can write:
 *
 *   const message = friendlyDbError(error);
 *   if (message) return { error: message };
 */
export function friendlyDbError(error: DbErrorLike | null | undefined): string | null {
  if (!error) return null;

  // supabase-js doesn't always populate `constraint`, but the constraint name
  // is reliably inside the message text, so match on that too.
  const haystack = `${error.constraint ?? ""} ${error.message ?? ""} ${error.details ?? ""}`;
  for (const [constraint, friendly] of Object.entries(BY_CONSTRAINT)) {
    if (haystack.includes(constraint)) return friendly;
  }

  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];

  // Deliberately NOT error.message. An unrecognised database error is exactly
  // the case where the raw text is least readable and most alarming.
  return "That didn't save. Try again, and if it keeps happening tell whoever looks after this app.";
}
