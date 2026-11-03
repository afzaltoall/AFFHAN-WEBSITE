import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  REFERRAL_CODE_MAX,
  REFERRAL_CODE_MIN,
  REFERRAL_DEFAULTS,
  idProofOfKey,
  normalizeReferralCode,
  referralCounts,
  referralWaiting,
  type IdProof,
  type ReferralState,
} from "@/lib/trip-referral-shared";

/**
 * The Free China Trip's employee referral task, the server's half (the owner, 2026-11-02: every employee gets a code,
 * "1 referral = 100 points", "per employee task -> 100 users", "per user 100 rupee"). The rules both sides share are in
 * lib/trip-referral-shared.ts.
 *
 *  - Every employee has one code, made from their first name and a number (RAHIM7), never two alike, made the first
 *    time anyone needs it: their own My referrals page, or the console's Employee tasks. It travels only in their
 *    link (affhan.com/free-china-trip/apply/?ref=RAHIM7): customers are never shown a code or asked for one (the owner,
 *    2026-11-02: only somebody who came through the employee's link is theirs).
 *  - An application from a browser that came through a link records the code, the employee and the points, fixed
 *    then, and counts at once ("counted"; the owner, 2026-11-02: the link is shared, they apply, it counts). Its
 *    applicant adds ID proof (lib/server/trip-documents.ts). A link that is no employee's, or a former employee's,
 *    credits nobody and stops nothing. While the task is off, or outside its dates, the code is kept but earns
 *    nothing ("not_counted").
 *  - The team can take one out in the console (Not counted) and put it back. Spam and deleted applications never
 *    count (referralCounts), and one application per mobile number already holds, so nobody is counted twice.
 *  - "Mark paid" pays an employee for everything counted and not yet paid, in rupees at the day's rate, and records it.
 */

const SETTINGS_ID = "trip";

export interface ReferralSettings {
  enabled: boolean;
  pointsPerReferral: number;
  rupeesPerPoint: number;
  target: number;
  /** ISO; codes earn points from here (India's midnight of the start date). */
  startsAt: string | null;
  /** ISO; and until here (India's midnight after the end date). */
  endsAt: string | null;
  changedBy: string | null;
  updatedAt: string | null;
}

export async function referralSettings(): Promise<ReferralSettings> {
  const row = await prisma.tripReferralSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) return { ...REFERRAL_DEFAULTS, startsAt: null, endsAt: null, changedBy: null, updatedAt: null };
  return {
    enabled: row.enabled,
    pointsPerReferral: row.pointsPerReferral,
    rupeesPerPoint: row.rupeesPerPoint,
    target: row.target,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    changedBy: row.changedBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Whether a code earns points now: the task is on, and inside its dates where it has them. */
export function taskRunning(s: Pick<ReferralSettings, "enabled" | "startsAt" | "endsAt">, now = Date.now()): boolean {
  return s.enabled && (!s.startsAt || now >= Date.parse(s.startsAt)) && (!s.endsAt || now < Date.parse(s.endsAt));
}

export async function saveReferralSettings(
  s: { enabled: boolean; pointsPerReferral: number; rupeesPerPoint: number; target: number; startsAt: Date | null; endsAt: Date | null },
  by: string,
): Promise<ReferralSettings> {
  const data = { ...s, changedBy: by };
  await prisma.tripReferralSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID, ...data }, update: data });
  return referralSettings();
}

// ---- codes ----------------------------------------------------------------------------------------------------------

/** The letters a code starts with: the first name's, up to six (RAHIM), or AFFHAN for a name without two. */
function codeLetters(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const letters = first.normalize("NFKD").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 6);
  return letters.length >= 2 ? letters : "AFFHAN";
}

/** The employee's code, made now if they have none: their letters and a number no other code has (RAHIM7). */
export async function ensureReferralCode(employee: { id: string; name: string }): Promise<string> {
  const have = await prisma.tripReferralCode.findUnique({ where: { employeeId: employee.id }, select: { code: true } });
  if (have) return have.code;
  const letters = codeLetters(employee.name);
  for (let attempt = 0; attempt < 40; attempt++) {
    const code = normalizeReferralCode(`${letters}${attempt < 30 ? randomInt(2, 100) : randomInt(100, 1000)}`);
    try {
      return (await prisma.tripReferralCode.create({ data: { employeeId: employee.id, code }, select: { code: true } })).code;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      // Taken: by somebody else (another number), or this employee's own, made a moment ago by another request.
      const mine = await prisma.tripReferralCode.findUnique({ where: { employeeId: employee.id }, select: { code: true } });
      if (mine) return mine.code;
    }
  }
  throw new Error("No free referral code could be made.");
}

/**
 * Make or change an employee's code from the console (the owner, 2026-11-03: "give the access to admin to create the
 * code for employee or change the referral code"). Written as codes are read, letters and digits in capitals, 3 to 20
 * of them; never two alike. Empty: one made from their name, as everyone gets. Applications already recorded keep the
 * code they came with and stay theirs (referrerId); links shared with the old code credit nobody from now on.
 */
export async function setReferralCode(
  employeeId: string,
  raw: unknown,
): Promise<{ ok: true; code: string } | { ok: false; status: 400 | 404 | 409; error: string }> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, name: true } });
  if (!employee) return { ok: false, status: 404, error: "That employee was not found." };
  if (typeof raw !== "string" || !raw.trim()) return { ok: true, code: await ensureReferralCode(employee) };
  const code = normalizeReferralCode(raw);
  if (code.length < REFERRAL_CODE_MIN) return { ok: false, status: 400, error: `A code is ${REFERRAL_CODE_MIN} to ${REFERRAL_CODE_MAX} letters and numbers.` };
  const taken = await prisma.tripReferralCode.findUnique({ where: { code }, select: { employeeId: true, employee: { select: { name: true } } } });
  if (taken && taken.employeeId !== employeeId) return { ok: false, status: 409, error: `${code} is already ${taken.employee.name}'s code.` };
  try {
    await prisma.tripReferralCode.upsert({ where: { employeeId }, create: { employeeId, code }, update: { code } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, status: 409, error: `${code} was taken a moment ago. Try another.` };
    throw e;
  }
  return { ok: true, code };
}

/** A code for every active employee who has none, so the console lists everyone's. */
async function ensureCodesForActive(): Promise<void> {
  const without = await prisma.employee.findMany({ where: { isActive: true, tripReferralCode: { is: null } }, select: { id: true, name: true } });
  for (const e of without) await ensureReferralCode(e);
}

// ---- an application's code ------------------------------------------------------------------------------------------

/** What an application stores about its code. */
export interface ReferralFields {
  referralCode: string;
  referrerId: string;
  referralPoints: number;
  referralState: ReferralState;
  referralDecidedAt?: Date;
  referralDecidedBy?: string;
}

/**
 * What to store about the employee's link an application came through: nothing when there was none (and nothing is
 * read), or when the code is no employee's or a former employee's. The applicant never sees the code (the owner,
 * 2026-11-02: only the employee's link credits them, nobody is shown anything), so nothing about it can stop an
 * application: a link that no longer credits anyone is simply not counted.
 */
export async function referralForApplication(raw: unknown): Promise<ReferralFields | null> {
  const live = await liveReferralCode(raw);
  if (!live) return null;
  const { code, employeeId } = live;
  const settings = await referralSettings();
  // Counted as it arrives (the owner, 2026-11-02: it counts for the employee as it counts for the trip); the team can
  // still take it out in Employee tasks before it is paid.
  if (taskRunning(settings)) return { referralCode: code, referrerId: employeeId, referralPoints: settings.pointsPerReferral, referralState: "counted" };
  return { referralCode: code, referrerId: employeeId, referralPoints: 0, referralState: "not_counted", referralDecidedAt: new Date(), referralDecidedBy: "Task not running" };
}

/**
 * The code, as stored, and its employee, when it is an active employee's; null for anything else. A link that credits
 * somebody is also the one whose applicant is asked for ID proof (the owner, 2026-11-02), so the form, the upload and
 * the application all ask this one question.
 */
export async function liveReferralCode(raw: unknown): Promise<{ code: string; employeeId: string } | null> {
  const code = normalizeReferralCode(raw);
  if (!code) return null;
  const row = await prisma.tripReferralCode.findUnique({ where: { code }, select: { employeeId: true, employee: { select: { isActive: true } } } });
  return row && row.employee.isActive ? { code, employeeId: row.employeeId } : null;
}

// ---- reading ----------------------------------------------------------------------------------------------------------

/** One employee's line in the console. Money in rupees: paid as recorded, unpaid at the day's rate. */
export interface ReferralBoardRow {
  employeeId: string;
  name: string;
  email: string;
  isActive: boolean;
  code: string | null;
  /** Applications that came with their code, not deleted. */
  referred: number;
  waiting: number;
  counted: number;
  /** Declined, spam, or sent while the task was off. */
  notCounted: number;
  /** Points of the counted ones. */
  points: number;
  paidRupees: number;
  /** Counted and not yet paid: how many, and what they come to now. */
  unpaid: number;
  unpaidRupees: number;
  lastAt: string | null;
}

interface CountedRow {
  referrerId: string | null;
  referralState: string | null;
  referralPoints: number | null;
  referralPayoutId: string | null;
  status: string;
  createdAt: Date;
}

function tally(rows: CountedRow[], rupeesPerPoint: number) {
  let referred = 0, waiting = 0, counted = 0, points = 0, unpaid = 0, unpaidPoints = 0;
  let lastAt: Date | null = null;
  for (const r of rows) {
    if (r.status === "deleted") continue;
    referred++;
    if (!lastAt || r.createdAt > lastAt) lastAt = r.createdAt;
    if (referralWaiting(r)) waiting++;
    if (referralCounts(r)) {
      counted++;
      points += r.referralPoints ?? 0;
      if (!r.referralPayoutId) {
        unpaid++;
        unpaidPoints += r.referralPoints ?? 0;
      }
    }
  }
  return { referred, waiting, counted, notCounted: referred - waiting - counted, points, unpaid, unpaidRupees: unpaidPoints * rupeesPerPoint, lastAt: lastAt?.toISOString() ?? null };
}

/** One employee's figures, as their page and the console's detail show them. */
export type ReferralTotals = ReturnType<typeof tally> & { paidRupees: number };

/** The console's Employee tasks: the settings, and every active employee (and any former one with referrals), best first. */
export async function referralBoard(): Promise<{ settings: ReferralSettings; rows: ReferralBoardRow[] }> {
  await ensureCodesForActive();
  const [settings, employees, apps, paid] = await Promise.all([
    referralSettings(),
    prisma.employee.findMany({
      where: { OR: [{ isActive: true }, { tripReferrals: { some: {} } }] },
      select: { id: true, name: true, email: true, isActive: true, tripReferralCode: { select: { code: true } } },
    }),
    prisma.tripApplication.findMany({
      where: { referrerId: { not: null } },
      select: { referrerId: true, referralState: true, referralPoints: true, referralPayoutId: true, status: true, createdAt: true },
    }),
    prisma.tripReferralPayout.groupBy({ by: ["employeeId"], _sum: { amount: true } }),
  ]);
  const byEmployee = new Map<string, CountedRow[]>();
  for (const a of apps) if (a.referrerId) byEmployee.set(a.referrerId, [...(byEmployee.get(a.referrerId) ?? []), a]);
  const paidOf = new Map(paid.map((p) => [p.employeeId, p._sum.amount ?? 0]));
  const rows = employees.map((e) => ({
    employeeId: e.id,
    name: e.name,
    email: e.email,
    isActive: e.isActive,
    code: e.tripReferralCode?.code ?? null,
    ...tally(byEmployee.get(e.id) ?? [], settings.rupeesPerPoint),
    paidRupees: paidOf.get(e.id) ?? 0,
  }));
  rows.sort((a, b) => b.counted - a.counted || b.referred - a.referred || a.name.localeCompare(b.name));
  return { settings, rows };
}

/** One application referred by an employee, as their page and the console list it. */
export interface ReferredApplication {
  id: string;
  referenceNo: string;
  fullName: string;
  phone: string;
  country: string;
  city: string;
  createdAt: string;
  status: string;
  notVerified: boolean;
  referralState: string | null;
  referralPoints: number | null;
  paid: boolean;
  decidedBy: string | null;
  decidedAt: string | null;
  /** Its ID proof (2026-11-02), for the console only: the employee's own page never reads it. */
  documents?: { id: string; contentType: string; size: number | null; proof: IdProof | null }[];
}

export interface ReferralPayoutView {
  id: string;
  referrals: number;
  points: number;
  amount: number;
  note: string | null;
  paidBy: string;
  paidAt: string;
}

/**
 * Everything about one employee's referrals: their code, their applications newest first, and their payments. With
 * `withDocuments` (the console's, never the employee's own page), each application's ID proof too.
 */
export async function employeeReferrals(employee: { id: string; name: string }, { withDocuments = false } = {}) {
  const code = await ensureReferralCode(employee);
  const [settings, apps, payouts] = await Promise.all([
    referralSettings(),
    prisma.tripApplication.findMany({
      where: { referrerId: employee.id, status: { not: "deleted" } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true, referenceNo: true, fullName: true, phone: true, country: true, city: true, createdAt: true, status: true, source: true,
        referralState: true, referralPoints: true, referralPayoutId: true, referralDecidedBy: true, referralDecidedAt: true, referrerId: true,
      },
    }),
    prisma.tripReferralPayout.findMany({ where: { employeeId: employee.id }, orderBy: { paidAt: "desc" } }),
  ]);
  const totals = { ...tally(apps, settings.rupeesPerPoint), paidRupees: payouts.reduce((s, p) => s + p.amount, 0) };
  const documents = new Map<string, NonNullable<ReferredApplication["documents"]>>();
  if (withDocuments && apps.length) {
    const rows = await prisma.tripApplicationDocument.findMany({
      where: { applicationId: { in: apps.map((a) => a.id) } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, applicationId: true, key: true, contentType: true, size: true },
    });
    for (const d of rows) {
      documents.set(d.applicationId, [...(documents.get(d.applicationId) ?? []), { id: d.id, contentType: d.contentType, size: d.size, proof: idProofOfKey(d.key) }]);
    }
  }
  return {
    code,
    settings,
    totals,
    applications: apps.map(
      (a): ReferredApplication => ({
        id: a.id,
        referenceNo: a.referenceNo,
        fullName: a.fullName,
        phone: a.phone,
        country: a.country,
        city: a.city,
        createdAt: a.createdAt.toISOString(),
        status: a.status,
        notVerified: /not verified/i.test(a.source),
        referralState: a.referralState,
        referralPoints: a.referralPoints,
        paid: !!a.referralPayoutId,
        decidedBy: a.referralDecidedBy,
        decidedAt: a.referralDecidedAt?.toISOString() ?? null,
        ...(withDocuments ? { documents: documents.get(a.id) ?? [] } : {}),
      }),
    ),
    payouts: payouts.map((p): ReferralPayoutView => ({ id: p.id, referrals: p.referrals, points: p.points, amount: p.amount, note: p.note, paidBy: p.paidBy, paidAt: p.paidAt.toISOString() })),
  };
}

/** Every referred application with its employee, for the console's Excel export. */
export async function allReferredApplications() {
  const apps = await prisma.tripApplication.findMany({
    where: { referrerId: { not: null }, status: { not: "deleted" } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      referenceNo: true, fullName: true, phone: true, country: true, city: true, createdAt: true, status: true, source: true,
      referralCode: true, referralState: true, referralPoints: true, referralPayoutId: true, referralDecidedBy: true,
      referrer: { select: { name: true } },
    },
  });
  return apps.map((a) => ({
    referenceNo: a.referenceNo,
    fullName: a.fullName,
    phone: a.phone,
    country: a.country,
    city: a.city,
    createdAt: a.createdAt.toISOString(),
    status: a.status,
    notVerified: /not verified/i.test(a.source),
    code: a.referralCode,
    employee: a.referrer?.name ?? "",
    referralState: a.referralState,
    points: a.referralPoints,
    paid: !!a.referralPayoutId,
    decidedBy: a.referralDecidedBy,
  }));
}

// ---- writing ----------------------------------------------------------------------------------------------------------

/**
 * Count, decline, or set back to waiting. Only applications that came with a code and are not yet paid: a payment
 * stands as recorded. Returns how many changed. Counting one that earned nothing when it came (the task was off, or
 * outside its dates) gives it today's points: the team has decided it counts.
 */
export async function decideReferrals(ids: string[], state: ReferralState, by: string): Promise<number> {
  const waiting = state === "waiting";
  const open = { id: { in: ids }, referrerId: { not: null }, referralPayoutId: null };
  const writes = [];
  if (state === "counted") {
    const { pointsPerReferral } = await referralSettings();
    writes.push(prisma.tripApplication.updateMany({ where: { ...open, OR: [{ referralPoints: null }, { referralPoints: 0 }] }, data: { referralPoints: pointsPerReferral } }));
  }
  writes.push(
    prisma.tripApplication.updateMany({
      where: open,
      data: { referralState: state, referralDecidedAt: waiting ? null : new Date(), referralDecidedBy: waiting ? null : by },
    }),
  );
  const done = await prisma.$transaction(writes);
  return done[done.length - 1].count;
}

/**
 * Pay an employee for every counted application not yet paid (not spam or deleted), at the day's rate, and record it:
 * the payment row, and each application pointing at it. Nothing to pay, nothing written.
 */
export async function payReferrals(employeeId: string, by: string, note: string | null): Promise<{ ok: true; payout: ReferralPayoutView } | { ok: false; error: string }> {
  const settings = await referralSettings();
  return prisma.$transaction(
    async (tx) => {
      const apps = await tx.tripApplication.findMany({
        where: { referrerId: employeeId, referralState: "counted", referralPayoutId: null, status: { notIn: ["spam", "deleted"] } },
        select: { id: true, referralPoints: true },
      });
      if (!apps.length) return { ok: false as const, error: "Nothing counted is waiting to be paid." };
      const points = apps.reduce((s, a) => s + (a.referralPoints ?? 0), 0);
      const payout = await tx.tripReferralPayout.create({
        data: { employeeId, referrals: apps.length, points, amount: points * settings.rupeesPerPoint, note, paidBy: by },
      });
      const { count } = await tx.tripApplication.updateMany({ where: { id: { in: apps.map((a) => a.id) }, referralPayoutId: null }, data: { referralPayoutId: payout.id } });
      // Somebody paid or changed one of these in the meantime: nothing of this payment is kept.
      if (count !== apps.length) throw new Error("The referrals changed while they were being paid. Try again.");
      return {
        ok: true as const,
        payout: { id: payout.id, referrals: payout.referrals, points: payout.points, amount: payout.amount, note: payout.note, paidBy: payout.paidBy, paidAt: payout.paidAt.toISOString() },
      };
    },
    { maxWait: 10_000, timeout: 20_000 },
  );
}
