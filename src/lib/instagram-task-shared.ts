import { referralTaskDates, rupees } from "@/lib/trip-referral-shared";

/**
 * The office's Instagram task (the owner, 2026-11-23: "each person have to create a 5 account of instgram in each account
 * have to post 100 post total followers have to reach 1000 ... complete panaita cash price 25000 ... hr adha edha full
 * track pani elaraiyum regular check panuvaaru"), for the server and the browser alike. It is its own task, apart from
 * the Free China Trip's referrals ("dont merge this task to employee task of china trip").
 *
 * Nothing here reads Instagram, and nothing can: Instagram shows an account's counts only to someone looking at it, and
 * its API reads other accounts only for business accounts tied to a Facebook page, through an app Meta has reviewed.
 * So an employee types what their account shows, and a tracker (HR, the owner: "hr track pana maari access kudu") or an
 * admin opens it on Instagram and writes what they saw. Only that check makes an account done; the prize is given
 * when every one of a person's accounts is checked done.
 */

export interface InstagramSettingsView {
  enabled: boolean;
  accountsPerPerson: number;
  postsPerAccount: number;
  followersPerAccount: number;
  prizeRupees: number;
  /** When it starts, and the first moment after its last day (India's calendar), or null. */
  startsAt: string | null;
  endsAt: string | null;
  changedBy: string | null;
  updatedAt: string | null;
}

/** What the task asks until the console changes it (the owner's numbers). */
export const INSTAGRAM_DEFAULTS: InstagramSettingsView = {
  enabled: true,
  accountsPerPerson: 5,
  postsPerAccount: 100,
  followersPerAccount: 1000,
  prizeRupees: 25_000,
  startsAt: null,
  endsAt: null,
  changedBy: null,
  updatedAt: null,
};

/** The largest counts anyone may type, far past any account in the task. */
export const POSTS_MAX = 1_000_000;
export const FOLLOWERS_MAX = 1_000_000_000;
/** How long a rejection's reason may be. */
export const CHECK_NOTE_MAX = 200;

export type CheckState = "checked" | "rejected";

export interface InstagramAccountView {
  id: string;
  employeeId: string;
  handle: string;
  /** The employee's own last report, and when. */
  posts: number;
  followers: number;
  reportedAt: string;
  /** The last check on Instagram, by a tracker or an admin; all null until one. */
  checkState: CheckState | null;
  checkedPosts: number | null;
  checkedFollowers: number | null;
  checkNote: string | null;
  checkedBy: string | null;
  checkedAt: string | null;
  createdAt: string;
  /** When its password was saved, or null: never the password itself, which only the admin's vault reads. */
  passwordSetAt: string | null;
}

export interface InstagramPrizeView {
  amount: number;
  note: string | null;
  givenBy: string;
  givenAt: string;
}

/** PASSWORD: its owner saved or changed its password; PASSWORD_VIEWED: an admin read it (never the password itself). */
export type InstagramEventKind = "ADDED" | "REPORTED" | "CHECKED" | "REJECTED" | "RENAMED" | "REMOVED" | "PASSWORD" | "PASSWORD_VIEWED";

export interface InstagramEventView {
  id: string;
  accountId: string | null;
  handle: string;
  kind: InstagramEventKind;
  posts: number | null;
  followers: number | null;
  note: string | null;
  byName: string;
  at: string;
}

/** One person on the board: an employee still here, or one who left with accounts in the task. */
export interface InstagramPersonRow {
  employeeId: string;
  name: string;
  email: string;
  isActive: boolean;
  /** Whether they check everyone's accounts (HR). */
  tracker: boolean;
  accounts: InstagramAccountView[];
  prize: InstagramPrizeView | null;
}

export interface InstagramBoardView {
  settings: InstagramSettingsView;
  people: InstagramPersonRow[];
  readAt: string;
}

// ---- usernames ----

/** The first part of an instagram.com address that is a page of the site, never a profile. */
const SITE_PATHS = new Set([
  "p", "reel", "reels", "tv", "explore", "stories", "accounts", "direct", "about", "developer", "legal", "web", "s",
  "share", "challenge", "emails", "session", "privacy", "terms", "ar", "api", "graphql", "oauth", "help", "download",
]);

/**
 * A username as Instagram keeps it, from what was typed or pasted: "@name", "name", or a link to the profile
 * ("instagram.com/name", "https://www.instagram.com/name/?igsh=…"). Lower case, without the @. Null when it is not one:
 * Instagram's are 1 to 30 letters, digits, full stops and underscores, never starting or ending with a full stop or
 * with two together; a link to a post, a reel or a story is not a profile.
 */
export function parseInstagramHandle(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  const link = s.match(/^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:instagram\.com|instagr\.am)(?:\/([^?#]*))?(?:[?#].*)?$/i);
  if (link) {
    const parts = (link[1] ?? "").split("/").filter(Boolean);
    // instagram.com/_u/name is the app's own link to a profile.
    const first = parts[0]?.toLowerCase() === "_u" ? parts[1] : parts[0];
    if (!first || SITE_PATHS.has(first.toLowerCase())) return null;
    s = first;
  } else if (/[\s/]/.test(s)) {
    return null;
  }
  s = s.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(s)) return null;
  if (s.startsWith(".") || s.endsWith(".") || s.includes("..")) return null;
  return s;
}

/** The profile's address, for a tracker to open and look. */
export const instagramLink = (handle: string) => `https://www.instagram.com/${handle}/`;

/**
 * The account an add names, from its two fields (the owner, 2026-11-24: "give usernam ... and url option"): the
 * username, the profile's link, or both, which must then be the same account. Either field takes either form, so a
 * link pasted into the username's field still reads.
 */
export function handleFromInputs(username: unknown, link: unknown): { handle: string } | { error: string } {
  const typed = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const u = typed(username);
  const l = typed(link);
  const fromU = u ? parseInstagramHandle(u) : null;
  const fromL = l ? parseInstagramHandle(l) : null;
  if (u && !fromU) return { error: "That is not an Instagram username: letters, numbers, full stops and underscores only." };
  if (l && !fromL) return { error: "That is not a link to an Instagram profile." };
  if (fromU && fromL && fromU !== fromL) return { error: `The link is for @${fromL}, but the username is @${fromU}.` };
  const handle = fromU ?? fromL;
  return handle ? { handle } : { error: "Type the account's username or paste its profile link." };
}

/** Instagram's own shortest password, and the longest kept (lib/instagram-vault.ts seals it). */
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 128;

/** A password as typed, or why it is not one. Kept exactly as typed: spaces inside a password are part of it. */
export function passwordProblem(v: unknown): string | null {
  if (typeof v !== "string" || v.length === 0) return "Type the account's Instagram password.";
  if (v.length < PASSWORD_MIN) return `An Instagram password has at least ${PASSWORD_MIN} characters.`;
  if (v.length > PASSWORD_MAX) return `Keep the password under ${PASSWORD_MAX} characters.`;
  return null;
}

/** A count as typed: a whole number from 0 to `max`, or null. */
export function countOf(v: unknown, max: number): number | null {
  const n = typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

/** Why an account does not count, as a tracker picks it (or writes their own). */
export const INSTAGRAM_REJECT_REASONS = [
  "Account not found on Instagram",
  "Not a new account",
  "Bought or fake followers",
  "Not their account",
] as const;

// ---- when it runs ----

/** Whether employees can add and change accounts now: on, and inside its dates when it has them. Checks are always open. */
export function instagramTaskRunning(s: Pick<InstagramSettingsView, "enabled" | "startsAt" | "endsAt">, now = Date.now()): boolean {
  if (!s.enabled) return false;
  if (s.startsAt && now < Date.parse(s.startsAt)) return false;
  if (s.endsAt && now >= Date.parse(s.endsAt)) return false;
  return true;
}

/** The task's dates as the pages say them ("1 Dec 2026 to 31 Jan 2027", "until …", "from …"), or null. */
export const instagramTaskDates = (s: Pick<InstagramSettingsView, "startsAt" | "endsAt">) => referralTaskDates(s);

/** The task in one line: "5 accounts · 100 posts and 1,000 followers on each · ₹25,000". */
export function instagramTaskLine(s: Pick<InstagramSettingsView, "accountsPerPerson" | "postsPerAccount" | "followersPerAccount" | "prizeRupees">): string {
  const accounts = `${num(s.accountsPerPerson)} ${s.accountsPerPerson === 1 ? "account" : "accounts"}`;
  return `${accounts} · ${num(s.postsPerAccount)} posts and ${num(s.followersPerAccount)} followers on each · ${rupees(s.prizeRupees)} prize`;
}

export const num = (n: number) => n.toLocaleString("en-IN");

// ---- an account ----

type Rules = Pick<InstagramSettingsView, "accountsPerPerson" | "postsPerAccount" | "followersPerAccount">;
type Counts = Pick<InstagramAccountView, "posts" | "followers" | "reportedAt" | "checkState" | "checkedPosts" | "checkedFollowers" | "checkedAt">;

const reaches = (posts: number, followers: number, r: Rules) => posts >= r.postsPerAccount && followers >= r.followersPerAccount;

/** Done: its last check saw the posts and followers the task asks for. Only a check makes an account done. */
export const accountDone = (a: Counts, r: Rules) =>
  a.checkState === "checked" && reaches(a.checkedPosts ?? 0, a.checkedFollowers ?? 0, r);

/** The employee says it is there: their own counts reach the task's (and no check has turned it down). */
export const accountReportedDone = (a: Counts, r: Rules) => a.checkState !== "rejected" && reaches(a.posts, a.followers, r);

/**
 * Waiting for a check: reported since its last one, or never checked with something on it to see. A new account at 0
 * and 0 waits for nothing (there is nothing yet to look at), and nor does one already checked done: it stays done
 * whatever its owner types next, and HR looks again before the prize if they want to.
 */
export function accountToCheck(a: Counts, r: Rules): boolean {
  if (accountDone(a, r)) return false;
  if (a.checkedAt == null) return a.posts > 0 || a.followers > 0;
  return Date.parse(a.reportedAt) > Date.parse(a.checkedAt);
}

/**
 * How far it has got, 0 to 1: half for posts, half for followers, each capped at the task's; by the employee's count or
 * what its check saw, whichever is further. Done is all the way, whatever its owner typed last (a board read Done 5 / 5
 * beside 80% when one account's own count was never updated after HR saw it done). Turned down counts nothing.
 */
export function accountShare(a: Counts, r: Rules): number {
  if (a.checkState === "rejected") return 0;
  if (accountDone(a, r)) return 1;
  const seen = a.checkState === "checked";
  const posts = Math.max(a.posts, seen ? (a.checkedPosts ?? 0) : 0);
  const followers = Math.max(a.followers, seen ? (a.checkedFollowers ?? 0) : 0);
  return (Math.min(posts / r.postsPerAccount, 1) + Math.min(followers / r.followersPerAccount, 1)) / 2;
}

/** A count against the task's, 0 to 1, for a bar. */
export const shareOf = (n: number, of: number) => (of > 0 ? Math.max(0, Math.min(n / of, 1)) : 0);

// ---- a person ----

export interface PersonProgress {
  /** Accounts in the task. */
  added: number;
  /** Checked done, at most the task's number. */
  done: number;
  /** Their own counts reach the task's. */
  reportedDone: number;
  /** Waiting for a check. */
  toCheck: number;
  /** Turned down at their last check. */
  rejected: number;
  /** Their reported posts and followers, all accounts together. */
  posts: number;
  followers: number;
  /** How far they say they have got over the task's accounts, 0 to 1 (their best ones). */
  share: number;
  /** Every account the task asks for checked done. */
  complete: boolean;
  /** Their newest report, or null. */
  lastReportAt: string | null;
}

export function personProgress(accounts: Counts[], r: Rules): PersonProgress {
  const shares = accounts.map((a) => accountShare(a, r)).sort((x, y) => y - x).slice(0, r.accountsPerPerson);
  const done = Math.min(accounts.filter((a) => accountDone(a, r)).length, r.accountsPerPerson);
  let last: string | null = null;
  for (const a of accounts) if (!last || Date.parse(a.reportedAt) > Date.parse(last)) last = a.reportedAt;
  return {
    added: accounts.length,
    done,
    reportedDone: accounts.filter((a) => accountReportedDone(a, r)).length,
    toCheck: accounts.filter((a) => accountToCheck(a, r)).length,
    rejected: accounts.filter((a) => a.checkState === "rejected").length,
    posts: accounts.reduce((n, a) => n + a.posts, 0),
    followers: accounts.reduce((n, a) => n + a.followers, 0),
    share: r.accountsPerPerson > 0 ? shares.reduce((n, s) => n + s, 0) / r.accountsPerPerson : 0,
    complete: r.accountsPerPerson > 0 && done >= r.accountsPerPerson,
    lastReportAt: last,
  };
}

export type PersonState = "not_started" | "working" | "to_check" | "complete" | "prize_given";

/** Where someone stands, in one word: given their prize, complete (to be given it), waiting for a check, working, not started. */
export function personState(p: PersonProgress, hasPrize: boolean): PersonState {
  if (hasPrize) return "prize_given";
  if (p.complete) return "complete";
  if (p.toCheck > 0) return "to_check";
  return p.added > 0 ? "working" : "not_started";
}

export const PERSON_STATE_LABEL: Record<PersonState, string> = {
  not_started: "Not started",
  working: "Working",
  to_check: "To check",
  complete: "Complete",
  prize_given: "Prize given",
};

/** Best first: most checked done, then most the employee says are done, then furthest along, then by name. */
export function comparePeople(a: { name: string; p: PersonProgress }, b: { name: string; p: PersonProgress }): number {
  return b.p.done - a.p.done || b.p.reportedDone - a.p.reportedDone || b.p.share - a.p.share || a.name.localeCompare(b.name);
}

export interface BoardTotals {
  people: number;
  started: number;
  accounts: number;
  done: number;
  toCheck: number;
  complete: number;
  prizesGiven: number;
  /** Rupees given, and still to give (complete, not given yet, at today's prize). */
  given: number;
  toGive: number;
}

export function boardTotals(people: { prize: InstagramPrizeView | null; p: PersonProgress }[], s: Pick<InstagramSettingsView, "prizeRupees">): BoardTotals {
  const t: BoardTotals = { people: people.length, started: 0, accounts: 0, done: 0, toCheck: 0, complete: 0, prizesGiven: 0, given: 0, toGive: 0 };
  for (const { prize, p } of people) {
    if (p.added > 0) t.started += 1;
    t.accounts += p.added;
    t.done += p.done;
    // A prize given makes their accounts final: nothing of theirs waits for a check.
    if (!prize) t.toCheck += p.toCheck;
    if (p.complete || prize) t.complete += 1;
    if (prize) {
      t.prizesGiven += 1;
      t.given += prize.amount;
    } else if (p.complete) t.toGive += s.prizeRupees;
  }
  return t;
}

/** An account's check in words, for its owner and the board. */
export function checkLine(a: Pick<InstagramAccountView, "checkState" | "checkedPosts" | "checkedFollowers" | "checkNote" | "checkedAt">, r: Rules, day: (iso: string) => string): string {
  if (!a.checkState || !a.checkedAt) return "Not checked yet";
  if (a.checkState === "rejected") return `Doesn't count: ${a.checkNote ?? "turned down"} (${day(a.checkedAt)})`;
  const seen = `${num(a.checkedPosts ?? 0)} posts, ${num(a.checkedFollowers ?? 0)} followers`;
  return reaches(a.checkedPosts ?? 0, a.checkedFollowers ?? 0, r) ? `Done: checked ${day(a.checkedAt)}, ${seen}` : `Checked ${day(a.checkedAt)}: ${seen}`;
}
