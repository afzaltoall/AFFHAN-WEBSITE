/**
 * One recorded outcome, written as several rows.
 *
 * An outcome is recorded against a CUSTOMER — "I called Ravi, he ordered" —
 * but a customer is several inquiries, one per product they asked about. So
 * the workspace writes one StatusUpdate per product, all in one go, with the
 * same employee, status, note and timestamp. That keeps every existing read
 * working unchanged (each lead still carries its own trail, and "latest
 * outcome per lead" is still the newest row against that lead) at the cost of
 * one thing: anywhere the rows are listed as events, one action would appear
 * as five identical lines.
 *
 * This is what puts them back together. Rows belong to the same action when
 * the same person wrote the same status and the same note at the same second.
 * The second is deliberate: the rows are created in one statement so they
 * share a timestamp exactly, but rounding means a batch survives a database
 * that resolves the column differently, and two genuinely separate actions a
 * second apart are indistinguishable from one anyway.
 */

export interface BatchableUpdate {
  status: string;
  note: string | null;
  createdAt: string | Date;
  /** Who recorded it. Omitted where the list is already one person's. */
  employeeId?: string | null;
  /**
   * Anything else the rows must agree on to be one action. The activity feed
   * passes the customer, so that two people marked at the same second with the
   * same note stay two lines rather than becoming one with the wrong name on
   * it.
   */
  scope?: string | null;
}

/** The identity of the action a row belongs to. */
export function batchKeyOf(u: BatchableUpdate): string {
  const at = u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt);
  const second = Math.floor(at.getTime() / 1000);
  return `${u.employeeId ?? ""}|${u.scope ?? ""}|${u.status}|${u.note ?? ""}|${second}`;
}

/**
 * Fold rows into the actions that wrote them, keeping the order they arrived
 * in — so a list already sorted newest-first stays newest-first, and each
 * batch holds its rows in that same order.
 */
export function collapseUpdates<T>(rows: T[], of: (row: T) => BatchableUpdate): T[][] {
  const batches = new Map<string, T[]>();
  for (const row of rows) {
    const key = batchKeyOf(of(row));
    const found = batches.get(key);
    if (found) found.push(row);
    else batches.set(key, [row]);
  }
  return [...batches.values()];
}
