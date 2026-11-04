import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { idProofLabel, idProofOfKey } from "@/lib/trip-referral-shared";
import { IdProofDoor } from "@/components/admin/IdProofLock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ID proof | Affhan Admin",
  robots: { index: false, follow: false },
};

const sfFont = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

/**
 * One applicant's ID proof, where its link lands when it cannot open yet (2026-11-04, the owner: "showing like this
 * how can i see"): opened in a tab while ID proofs are locked (from a console tab older than the lock, after the ten
 * minutes, or pasted), /api/admin/trip-documents/[id] sends it here rather than answer with a line of JSON. It says
 * whose file it is, asks for the password with the console's own form, and once ID proofs are open goes on to the
 * file in this tab (IdProofDoor). The file's key never leaves the server.
 */
export default async function IdProofPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");
  const { id } = await params;
  const doc = await prisma.tripApplicationDocument.findUnique({
    where: { id },
    select: { id: true, key: true, application: { select: { fullName: true, referenceNo: true } } },
  });
  const proof = doc ? idProofOfKey(doc.key) : null;

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link
            href="/admin/trip-applications/"
            aria-label="Back to the Free China Trip"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] rail:hidden"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-[min(100%,15rem)] flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">ID proof</h1>
            <p className="text-[13px] text-[#86868b]">
              {doc ? `${proof ? idProofLabel(proof) : "ID file"} · ${doc.application.fullName} · ${doc.application.referenceNo}` : "Free China Trip"}
            </p>
          </div>
        </div>
        {doc ? (
          <IdProofDoor fileUrl={`/api/admin/trip-documents/${doc.id}/`} />
        ) : (
          <p className="max-w-sm rounded-2xl bg-white p-6 text-[13.5px] leading-relaxed text-[#48484a] shadow-sm ring-1 ring-black/[0.06]">
            This ID proof is not here any more.
          </p>
        )}
      </div>
    </div>
  );
}
