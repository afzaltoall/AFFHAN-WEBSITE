/**
 * Free China Trip applications sent with the same mobile number: the
 * console's "Registered again" (the owner, 2026-10-29: with no sign-in and no
 * email, people can apply "again and again" from any browser, so the team
 * should see who; and, the same day, "name vachu pakadha mobile number same
 * haa matu paru": by the mobile number only, never the name, which many
 * people share). Pure, so it is tested on its own (tests/trip-repeats) and run
 * by /api/admin/trip-applications/repeats/ over every application still
 * counted.
 *
 * The number is compared as customerKeyOf keys it (the dial code and number,
 * whatever the spacing or a leading 0), so "+91 93603 97986" and
 * "+91 9360397986" are one number. The API already refuses a second
 * application from a number that has one, so a group here is one that slipped
 * past that rule (two sent at the same moment, say); none at all is that rule
 * holding.
 */

export interface RepeatKeys {
  id: string;
  /** customerKeyOf({ phone }): the number's key, or "email:…" for a row keyed by its email (no usable number). */
  customerKey: string | null;
  createdAt: Date | string;
}

export interface RepeatGroup {
  /** The applications with one mobile number, newest first. */
  ids: string[];
}

/** The numbers with more than one application, the one with the newest application first. */
export function repeatGroups(rows: readonly RepeatKeys[]): RepeatGroup[] {
  const byNumber = new Map<string, RepeatKeys[]>();
  for (const r of rows) {
    if (!r.customerKey || r.customerKey.startsWith("email:")) continue;
    const list = byNumber.get(r.customerKey);
    if (list) list.push(r);
    else byNumber.set(r.customerKey, [r]);
  }
  const time = (r: RepeatKeys) => new Date(r.createdAt).getTime();
  return [...byNumber.values()]
    .filter((list) => list.length > 1)
    .map((list) => [...list].sort((a, b) => time(b) - time(a)))
    .sort((a, b) => time(b[0]) - time(a[0]))
    .map((list) => ({ ids: list.map((r) => r.id) }));
}
