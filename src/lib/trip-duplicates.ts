/**
 * Employee tasks → Duplicates (the owner, 2026-11-23: "duplicate users kandupidakanum because naama real money employees
 * kuduka porom ... yarula rendu dhadava same ha erukanga check pananum"): applications that may be one person twice, so
 * no employee is paid twice for one applicant. Pure, so the console and the tests use exactly what the server does
 * (lib/server/trip-duplicates.ts reads the rows and the ID files' checksums).
 *
 * Three things join two applications:
 *  - the same mobile number (customerKey): one person. The site refuses a second application from a number, so this
 *    only finds what slipped past that rule (none on 2026-11-23);
 *  - the same ID file: byte for byte the same photo or PDF on both, by S3's own checksum. On 2026-11-23 24 files were on
 *    two applications each, 23 of them from one employee a few minutes apart, every time with a different number;
 *  - the same name in the same city, as typed, with case, accents and dots aside, and either the order of the words
 *    ("Ali Mohamed", "Mohamed Ali") or the spaces between them ("Abdul Rahman", "Abdulrahman") too. Different people
 *    share names, so this one is for the team to look at (the ID proofs side by side), never decided by itself.
 * Applications joined by any chain of these are one group. Spam and deleted applications are in none: they count for
 * nothing. A group with no application through a link is left out: nobody is paid for it.
 *
 * In a group the oldest application is the person's. Every later one through a link that is counted (or waiting), not
 * paid, and not yet decided by the team is to check: Keep (a different person, it counts) or Not counted (the same
 * person again). Either decision is the application's own referral decision, with who made it and when
 * (referralDecidedBy, referralDecidedAt), so nothing new is stored and Employee tasks shows the same.
 */

export type DuplicateReason = "number" | "file" | "name";
export const DUPLICATE_REASONS: readonly DuplicateReason[] = ["number", "file", "name"];
export const DUPLICATE_REASON_LABEL: Record<DuplicateReason, string> = {
  number: "Same mobile number",
  file: "Same ID file",
  name: "Same name and city",
};

/** What the grouping reads of an application. */
export interface DuplicateCandidate {
  id: string;
  /** TRIP-26-00042: the order applications were made in, where two share a second. */
  referenceNo: string;
  fullName: string;
  /** customerKeyOf({ phone }): the number's last ten digits ("email:…" for a row without one, never compared). */
  customerKey: string | null;
  city: string;
  createdAt: Date | string;
  status: string;
  referrerId: string | null;
  referralState: string | null;
  paid: boolean;
  referralDecidedAt: Date | string | null;
}

/** One ID file: whose it is, and its checksum (null when it was not asked, or S3 did not answer). */
export interface DuplicateFile {
  applicationId: string;
  checksum: string | null;
}

export interface DuplicateGroup {
  /** The applications, oldest first: the first is the person's. */
  ids: string[];
  /** What joins them, strongest first. */
  reasons: DuplicateReason[];
  /** Later applications still to decide, oldest first. */
  toCheck: string[];
  /**
   * Later applications that are certainly a repeat of an earlier one, whatever was decided: the same mobile number, or
   * the very same ID file under the same name (2026-11-23, the owner: "overall delete option ... to delete the
   * duplicates"; only these are deleted all at once). One ID file under two names is not among them: which of the two
   * it belongs to needs eyes.
   */
  sure: string[];
  /** Every application here through a link came through one employee's (two or more of them). */
  oneEmployee: boolean;
  /** The shortest time between two of them, in whole minutes. */
  closestMinutes: number;
  /** Two of their mobile numbers differ in one digit only (a typo, or a number changed to get past the rule). */
  numbersOneDigitApart: boolean;
}

/** A name's words, lower case, without accents, dots or anything else that is not a letter. */
const nameWords = (name: string) =>
  (name || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);

/** A name as names are compared, its words in any order ("Ali Mohamed" is "Mohamed Ali"). "" when none. */
export function nameKey(name: string): string {
  return nameWords(name).sort().join("");
}

/**
 * The same name's letters in the order typed, the spaces aside ("Mohamed Abdul Rahman" is "Mohamed Abdulrahman", which
 * the words in any order miss: "abdul" and "rahman" sort apart round "mohamed"). Two names join on either. "" when none.
 */
export function nameLetters(name: string): string {
  return nameWords(name).join("");
}

/** A city as cities are compared: its letters, with case, accents and spacing aside. "" when none. */
export function cityKey(city: string): string {
  return (city || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}]/gu, "");
}

const time = (v: Date | string) => new Date(v).getTime();
const usableNumber = (key: string | null): key is string => !!key && !key.startsWith("email:");

/** Two numbers of one length that differ in exactly one digit. */
export function oneDigitApart(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  let diff = 0;
  for (let i = 0; i < a.length && diff < 2; i++) if (a[i] !== b[i]) diff++;
  return diff === 1;
}

/** Whether a later application in a group is still to be decided: through a link, earning, unpaid, undecided. */
export function stillToCheck(a: Pick<DuplicateCandidate, "referrerId" | "referralState" | "paid" | "referralDecidedAt" | "status">): boolean {
  return (
    !!a.referrerId &&
    !a.paid &&
    a.status !== "spam" &&
    a.status !== "deleted" &&
    (a.referralState === "counted" || a.referralState === "waiting") &&
    !a.referralDecidedAt
  );
}

/**
 * Every group of applications that may be one person, the ones with something to check first, then the surest (the
 * same number, then the same file, then the same name), then the newest.
 */
export function duplicateGroups(apps: readonly DuplicateCandidate[], files: readonly DuplicateFile[]): DuplicateGroup[] {
  const live = apps.filter((a) => a.status !== "spam" && a.status !== "deleted");
  const at = new Map(live.map((a, i) => [a.id, i]));
  const parent = live.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const edges: [number, number, DuplicateReason][] = [];
  const join = (buckets: Map<string, number[]>, reason: DuplicateReason) => {
    for (const members of buckets.values()) {
      const distinct = [...new Set(members)];
      for (let k = 1; k < distinct.length; k++) {
        edges.push([distinct[0], distinct[k], reason]);
        parent[find(distinct[k])] = find(distinct[0]);
      }
    }
  };
  const bucket = (pairs: Iterable<[string, number]>) => {
    const m = new Map<string, number[]>();
    for (const [key, i] of pairs) {
      const list = m.get(key);
      if (list) list.push(i);
      else m.set(key, [i]);
    }
    return m;
  };

  join(bucket(live.flatMap((a, i): [string, number][] => (usableNumber(a.customerKey) ? [[a.customerKey, i]] : []))), "number");
  const checksumsOf = new Map<string, Set<string>>();
  for (const f of files) {
    if (!f.checksum) continue;
    const set = checksumsOf.get(f.applicationId) ?? new Set<string>();
    set.add(f.checksum);
    checksumsOf.set(f.applicationId, set);
  }
  /** Whether b repeats a for certain: one number, or one ID file under one name. */
  const certainRepeat = (a: DuplicateCandidate, b: DuplicateCandidate) => {
    if (usableNumber(a.customerKey) && a.customerKey === b.customerKey) return true;
    const mine = checksumsOf.get(b.id);
    const shared = !!mine && [...(checksumsOf.get(a.id) ?? [])].some((c) => mine.has(c));
    const sameName =
      (!!nameKey(a.fullName) && nameKey(a.fullName) === nameKey(b.fullName)) || (!!nameLetters(a.fullName) && nameLetters(a.fullName) === nameLetters(b.fullName));
    return shared && sameName;
  };
  join(
    bucket(
      files.flatMap((f): [string, number][] => {
        const i = at.get(f.applicationId);
        return f.checksum && i !== undefined ? [[f.checksum, i]] : [];
      }),
    ),
    "file",
  );
  for (const key of [nameKey, nameLetters]) {
    join(
      bucket(
        live.flatMap((a, i): [string, number][] => {
          const n = key(a.fullName);
          const c = cityKey(a.city);
          return n && c ? [[`${n}|${c}`, i]] : [];
        }),
      ),
      "name",
    );
  }

  const members = new Map<number, number[]>();
  for (let i = 0; i < live.length; i++) {
    const root = find(i);
    const list = members.get(root);
    if (list) list.push(i);
    else members.set(root, [i]);
  }
  const reasonsOf = new Map<number, Set<DuplicateReason>>();
  for (const [a, , reason] of edges) {
    const root = find(a);
    const set = reasonsOf.get(root) ?? new Set<DuplicateReason>();
    set.add(reason);
    reasonsOf.set(root, set);
  }

  const order = (x: DuplicateCandidate, y: DuplicateCandidate) => time(x.createdAt) - time(y.createdAt) || x.referenceNo.localeCompare(y.referenceNo, "en", { numeric: true });
  const groups: (DuplicateGroup & { strength: number; newest: number })[] = [];
  for (const [root, list] of members) {
    if (list.length < 2) continue;
    const rows = list.map((i) => live[i]).sort(order);
    const linked = rows.filter((a) => a.referrerId);
    if (!linked.length) continue;
    const reasons = DUPLICATE_REASONS.filter((r) => reasonsOf.get(root)?.has(r));
    let closest = Infinity;
    for (let k = 1; k < rows.length; k++) closest = Math.min(closest, time(rows[k].createdAt) - time(rows[k - 1].createdAt));
    const numbers = [...new Set(rows.map((a) => a.customerKey).filter(usableNumber))];
    let close = false;
    for (let x = 0; x < numbers.length && !close; x++) for (let y = x + 1; y < numbers.length && !close; y++) close = oneDigitApart(numbers[x], numbers[y]);
    const oneEmployee = linked.length > 1 && new Set(linked.map((a) => a.referrerId)).size === 1;
    const closestMinutes = Math.max(0, Math.floor(closest / 60_000));
    groups.push({
      ids: rows.map((a) => a.id),
      reasons,
      toCheck: rows.slice(1).filter(stillToCheck).map((a) => a.id),
      sure: rows.filter((b, k) => k > 0 && rows.slice(0, k).some((a) => certainRepeat(a, b))).map((a) => a.id),
      oneEmployee,
      closestMinutes,
      numbersOneDigitApart: close,
      strength:
        (reasons.includes("number") ? 300 : reasons.includes("file") ? 200 : 100) +
        (oneEmployee ? 20 : 0) +
        (closestMinutes < 60 ? 10 : 0) +
        (close ? 10 : 0),
      newest: time(rows[rows.length - 1].createdAt),
    });
  }
  groups.sort((a, b) => Number(b.toCheck.length > 0) - Number(a.toCheck.length > 0) || b.strength - a.strength || b.newest - a.newest);
  return groups.map((g) => ({
    ids: g.ids,
    reasons: g.reasons,
    toCheck: g.toCheck,
    sure: g.sure,
    oneEmployee: g.oneEmployee,
    closestMinutes: g.closestMinutes,
    numbersOneDigitApart: g.numbersOneDigitApart,
  }));
}

/**
 * Whether a later application in a group may be deleted as a repeat (2026-11-23): not paid (a payment stands), not drawn
 * in the live lucky draw (deleting a winner would empty their seat without a word), and not kept by the team (Keep, or
 * No, different people: counted with a decision).
 */
export function deletableRepeat(a: { paid: boolean; drawn: boolean; referralState: string | null; decidedAt: Date | string | null }): boolean {
  return !a.paid && !a.drawn && !(a.referralState === "counted" && !!a.decidedAt);
}

/**
 * Whether one application in a group may be deleted by hand, from its own row (2026-11-23, the owner: "give a manual
 * delete option on each one"): any of them, the first and one sent without a link too, once the admin has said so in
 * the window; never a paid one (a payment stands) or one drawn in the live lucky draw (its seat would empty).
 */
export function deletableByHand(a: { paid: boolean; drawn: boolean }): boolean {
  return !a.paid && !a.drawn;
}

/** "2 minutes apart", "3 hours apart"; "" from a day on, where it says nothing. */
export function apartLabel(minutes: number): string {
  if (minutes < 1) return "less than a minute apart";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} apart`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    return `${h} ${h === 1 ? "hour" : "hours"} apart`;
  }
  return "";
}
