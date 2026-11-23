import "server-only";
import { prisma } from "@/lib/prisma";
import { idProofOfKey, type IdProof } from "@/lib/trip-referral-shared";

/**
 * Employee tasks → ID proofs (the owner, 2026-11-23: "some of them applied wrong document like some other images so
 * check that too and insert a filter option to check"): every application through an employee's link, not spam or
 * deleted, newest first, with the ID proof it sent, for the team to look at and mark Wrong document (the referral
 * decision "wrong_document": never counted; Count undoes it). Whether a picture is an ID, and this applicant's, only a
 * person can say, so nothing here reads a file: the console's tiles open each one through
 * /api/admin/trip-documents/<id>/, behind the admin's password as everywhere. Employees come once, by id, beside the
 * list. Admins only (/api/admin/trip-referrals/id-proofs/).
 */

export interface IdProofApplication {
  id: string;
  referenceNo: string;
  fullName: string;
  city: string;
  country: string;
  createdAt: string;
  /** Whose link it came through (`employees` names them). */
  employeeId: string;
  referralState: string | null;
  referralPoints: number | null;
  paid: boolean;
  decidedBy: string | null;
  decidedAt: string | null;
  documents: { id: string; contentType: string; size: number | null; proof: IdProof | null }[];
}

export interface IdProofsView {
  applications: IdProofApplication[];
  employees: Record<string, { name: string; code: string | null }>;
  checkedAt: string;
}

export async function referralIdProofs(): Promise<IdProofsView> {
  const apps = await prisma.tripApplication.findMany({
    where: { referrerId: { not: null }, status: { notIn: ["spam", "deleted"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true, referenceNo: true, fullName: true, city: true, country: true, createdAt: true, referrerId: true,
      referralState: true, referralPoints: true, referralPayoutId: true, referralDecidedBy: true, referralDecidedAt: true,
      documents: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, key: true, contentType: true, size: true } },
    },
  });
  const referrers = [...new Set(apps.map((a) => a.referrerId).filter((x): x is string => !!x))];
  const people = referrers.length
    ? await prisma.employee.findMany({ where: { id: { in: referrers } }, select: { id: true, name: true, tripReferralCode: { select: { code: true } } } })
    : [];
  const employees: IdProofsView["employees"] = {};
  for (const e of people) employees[e.id] = { name: e.name, code: e.tripReferralCode?.code ?? null };
  return {
    applications: apps.map((a) => ({
      id: a.id,
      referenceNo: a.referenceNo,
      fullName: a.fullName,
      city: a.city,
      country: a.country,
      createdAt: a.createdAt.toISOString(),
      employeeId: a.referrerId!,
      referralState: a.referralState,
      referralPoints: a.referralPoints,
      paid: !!a.referralPayoutId,
      decidedBy: a.referralDecidedBy,
      decidedAt: a.referralDecidedAt?.toISOString() ?? null,
      documents: a.documents.map((d) => ({ id: d.id, contentType: d.contentType, size: d.size, proof: idProofOfKey(d.key) })),
    })),
    employees,
    checkedAt: new Date().toISOString(),
  };
}
