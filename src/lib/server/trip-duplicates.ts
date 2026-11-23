import "server-only";
import { prisma } from "@/lib/prisma";
import { documentChecksums } from "@/lib/server/trip-documents";
import { referralSettings } from "@/lib/server/trip-referrals";
import { deletableByHand, deletableRepeat, duplicateGroups, type DuplicateGroup } from "@/lib/trip-duplicates";
import { idProofOfKey, type IdProof } from "@/lib/trip-referral-shared";

/**
 * Employee tasks → Duplicates, the server's half (the owner, 2026-11-23: "real money employees kuduka porom ... more
 * careful"): every application not spam or deleted, the ID files whose size and type match another application's
 * checksummed by S3, grouped by lib/trip-duplicates.ts, and each group's applications as the console shows them, with
 * the employee each came through and their ID proof (opened only behind the admin's password, as everywhere). Admins
 * only (/api/admin/trip-referrals/duplicates/); read on demand, nothing stored.
 */

export interface DuplicateApplicationView {
  id: string;
  referenceNo: string;
  fullName: string;
  phone: string;
  country: string;
  city: string;
  createdAt: string;
  status: string;
  /** The employee whose link it came through; null for an application sent without one. */
  employee: { id: string; name: string; code: string | null } | null;
  referralState: string | null;
  referralPoints: number | null;
  paid: boolean;
  decidedBy: string | null;
  decidedAt: string | null;
  documents: { id: string; contentType: string; size: number | null; proof: IdProof | null }[];
  /** Drawn in the live lucky draw: never deleted from here, as a deleted winner's seat would empty without a word. */
  drawn: boolean;
}

export interface DuplicateGroupView extends DuplicateGroup {
  applications: DuplicateApplicationView[];
}

export interface DuplicatesView {
  groups: DuplicateGroupView[];
  /** What is still to decide: people (groups), their applications, and what those come to at the day's rate. */
  toCheck: { people: number; applications: number; rupees: number };
  /** Each employee's applications still to decide, by employee id (only those with some). */
  byEmployee: Record<string, number>;
  /** ID files S3 did not answer for just now, so not compared. */
  filesUnchecked: number;
  /** The task's rate, so the console can say what a decision takes off. */
  rupeesPerPoint: number;
  checkedAt: string;
}

export async function referralDuplicates(): Promise<DuplicatesView> {
  const [apps, docs, settings, draws] = await Promise.all([
    prisma.tripApplication.findMany({
      where: { status: { notIn: ["spam", "deleted"] } },
      select: {
        id: true, referenceNo: true, fullName: true, phone: true, customerKey: true, country: true, city: true, createdAt: true, status: true,
        referrerId: true, referralState: true, referralPoints: true, referralPayoutId: true, referralDecidedAt: true, referralDecidedBy: true,
      },
    }),
    prisma.tripApplicationDocument.findMany({
      where: { application: { status: { notIn: ["spam", "deleted"] } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, applicationId: true, key: true, contentType: true, size: true },
    }),
    referralSettings(),
    // Read in plain SQL, as the lucky draw reads it (lib/server/lucky-draw.ts): a database without the table has no draws.
    prisma.$queryRaw<{ applicationId: string }[]>`SELECT "applicationId" FROM "TripDraw" WHERE mode = 'live'`.catch(() => [] as { applicationId: string }[]),
  ]);
  const drawnIds = new Set(draws.map((d) => d.applicationId));
  const { checksums, unchecked } = await documentChecksums(docs);
  const groups = duplicateGroups(
    apps.map((a) => ({
      id: a.id,
      referenceNo: a.referenceNo,
      fullName: a.fullName,
      customerKey: a.customerKey,
      city: a.city,
      createdAt: a.createdAt,
      status: a.status,
      referrerId: a.referrerId,
      referralState: a.referralState,
      paid: !!a.referralPayoutId,
      referralDecidedAt: a.referralDecidedAt,
    })),
    docs.map((d) => ({ applicationId: d.applicationId, checksum: checksums.get(d.id) ?? null })),
  );

  const byId = new Map(apps.map((a) => [a.id, a]));
  const inGroups = new Set(groups.flatMap((g) => g.ids));
  const referrers = [...new Set(groups.flatMap((g) => g.ids.map((id) => byId.get(id)?.referrerId).filter((x): x is string => !!x)))];
  const employees = referrers.length
    ? await prisma.employee.findMany({ where: { id: { in: referrers } }, select: { id: true, name: true, tripReferralCode: { select: { code: true } } } })
    : [];
  const employeeOf = new Map(employees.map((e) => [e.id, { id: e.id, name: e.name, code: e.tripReferralCode?.code ?? null }]));
  const filesOf = new Map<string, DuplicateApplicationView["documents"]>();
  for (const d of docs) {
    if (!inGroups.has(d.applicationId)) continue;
    const list = filesOf.get(d.applicationId) ?? [];
    list.push({ id: d.id, contentType: d.contentType, size: d.size, proof: idProofOfKey(d.key) });
    filesOf.set(d.applicationId, list);
  }

  const view = (id: string): DuplicateApplicationView => {
    const a = byId.get(id)!;
    return {
      id: a.id,
      referenceNo: a.referenceNo,
      fullName: a.fullName,
      phone: a.phone,
      country: a.country,
      city: a.city,
      createdAt: a.createdAt.toISOString(),
      status: a.status,
      employee: a.referrerId ? (employeeOf.get(a.referrerId) ?? { id: a.referrerId, name: "Former employee", code: null }) : null,
      referralState: a.referralState,
      referralPoints: a.referralPoints,
      paid: !!a.referralPayoutId,
      decidedBy: a.referralDecidedBy,
      decidedAt: a.referralDecidedAt?.toISOString() ?? null,
      documents: filesOf.get(a.id) ?? [],
      drawn: drawnIds.has(a.id),
    };
  };

  const byEmployee: Record<string, number> = {};
  let applications = 0;
  let points = 0;
  for (const g of groups) {
    for (const id of g.toCheck) {
      const a = byId.get(id)!;
      applications++;
      points += a.referralPoints ?? 0;
      if (a.referrerId) byEmployee[a.referrerId] = (byEmployee[a.referrerId] ?? 0) + 1;
    }
  }
  return {
    groups: groups.map((g) => ({ ...g, applications: g.ids.map(view) })),
    toCheck: { people: groups.filter((g) => g.toCheck.length > 0).length, applications, rupees: points * settings.rupeesPerPoint },
    byEmployee,
    filesUnchecked: unchecked,
    rupeesPerPoint: settings.rupeesPerPoint,
    checkedAt: new Date().toISOString(),
  };
}


/**
 * Delete repeats (2026-11-23, the owner: "give a overall delete option ... to delete the duplicates"): the later
 * applications of a person who applied more than once, as the console's Delete does (status "deleted": Free China Trip →
 * Participants → Deleted, where any can be restored; out of the lucky draw and the counts). Each is also taken out of
 * the referral count, with who and when, so one restored later is not paid again without a decision. Only what is a
 * later application in a group right now, worked out again here, and deletable (deletableRepeat); anything else sent is
 * left as it is and counted as refused. Never the first of a group, a paid one, or one drawn in the live draw.
 * `byHand` (2026-11-23, "give a manual delete option on each one"): one row's own Delete, asked in its window: any
 * application in a group now, the first or one sent without a link too, but still never a paid or live-drawn one
 * (deletableByHand).
 */
export async function deleteRepeats(ids: readonly string[], by: string, byHand = false): Promise<{ deleted: number; refused: number }> {
  const asked = [...new Set(ids)];
  const now = await referralDuplicates();
  const allowed = new Set(
    now.groups.flatMap((g) => (byHand ? g.applications.filter(deletableByHand) : g.applications.slice(1).filter(deletableRepeat)).map((a) => a.id)),
  );
  const take = asked.filter((id) => allowed.has(id));
  if (!take.length) return { deleted: 0, refused: asked.length };
  const at = new Date();
  const done = await prisma.$transaction([
    prisma.tripApplication.updateMany({
      where: { id: { in: take }, referrerId: { not: null }, referralPayoutId: null },
      data: { referralState: "not_counted", referralDecidedAt: at, referralDecidedBy: by },
    }),
    prisma.tripApplication.updateMany({ where: { id: { in: take }, referralPayoutId: null, status: { notIn: ["deleted"] } }, data: { status: "deleted" } }),
  ]);
  const deleted = done[1].count;
  return { deleted, refused: asked.length - deleted };
}
