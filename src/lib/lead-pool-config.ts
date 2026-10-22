/**
 * The open pool's numbers, in one place (lib/lead-pool.ts applies them).
 *
 * Staff take customers from the pool themselves; these say how many one person may hold, how long a customer
 * waits for them, and when it goes back. Every duration is in office time (lib/office-hours.ts), so nothing runs
 * out overnight or on a Sunday.
 */

/** How many open customers (not yet Lead, No lead or Invalid) one person may hold at once. Taking stops there. */
export const MAX_OPEN_LEADS = 10;

/** Working minutes a taken customer may sit with no update before going back to the pool. */
export const RELEASE_AFTER_OFFICE_MINUTES = 120;

/** Office days an In progress customer may go without a new update before going back to the pool. */
export const STALE_IN_PROGRESS_OFFICE_DAYS = 2;

/** From a customer's first arrival in the pool: still unhandled after this, they are Invalid. */
export const POOL_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** The longest note a Release may carry. */
export const RELEASE_REASON_MAX = 500;
