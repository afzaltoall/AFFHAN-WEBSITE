import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { timeAgo } from "@/lib/relative-time";
import { leadStatusChip, leadStatusLabel } from "@/lib/leadStatus";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Activity | Affhan Admin",
  robots: { index: false, follow: false },
};

const PER_PAGE = 50;

const sfFont = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

/**
 * What the sales team has been recording, newest first, across everybody.
 *
 * The point of the page is trust: an administrator can see that Karan marked a
 * customer converted two hours ago without opening Karan's page, and without
 * taking anyone's word for it. It reads the same append-only rows the employee
 * wrote, so there is one version of events rather than a summary of one.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  const page = Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1);

  const [total, rows] = await Promise.all([
    prisma.statusUpdate.count(),
    prisma.statusUpdate.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        status: true,
        note: true,
        createdAt: true,
        employee: { select: { id: true, name: true, image: true, region: true } },
        inquiry: { select: { id: true, customerName: true, productName: true, country: true } },
        contact: { select: { id: true, fullName: true, companyName: true, country: true } },
      },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/admin/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02]"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
            <p className="text-[13px] text-[#86868b]">
              {total === 0
                ? "Nothing recorded yet. Outcomes appear here as the team records them."
                : `${total} ${total === 1 ? "update" : "updates"} recorded · newest first`}
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-2xl bg-white px-5 py-12 text-center text-[13px] text-[#86868b] shadow-sm ring-1 ring-black/[0.04]">
            When somebody records an outcome against a lead assigned to them, it shows up here.
          </p>
        ) : (
          <ol className="space-y-2">
            {rows.map((r) => {
              const who = r.employee.name;
              const lead = r.inquiry
                ? { name: r.inquiry.customerName, detail: r.inquiry.productName, href: `/admin/?inquiry=${r.inquiry.id}`, country: r.inquiry.country }
                : r.contact
                  ? { name: r.contact.fullName, detail: r.contact.companyName ?? "Contact message", href: `/admin/?contact=${r.contact.id}`, country: r.contact.country }
                  : null;
              return (
                <li key={r.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.04]">
                  <div className="flex items-start gap-3">
                    {r.employee.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.employee.image} alt="" className="h-8 w-8 shrink-0 rounded-full bg-[#f5f5f7] object-cover ring-1 ring-black/10" />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f5f5f7] text-xs font-bold text-[#86868b] ring-1 ring-black/10">
                        {who.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] leading-snug">
                        <Link href={`/admin/employees/${r.employee.id}/`} className="font-semibold hover:underline">
                          {who}
                        </Link>{" "}
                        marked{" "}
                        {lead ? (
                          <Link href={lead.href} className="font-semibold hover:underline">
                            {lead.name}
                          </Link>
                        ) : (
                          <span className="font-semibold">a lead since removed</span>
                        )}{" "}
                        as{" "}
                        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${leadStatusChip(r.status)}`}>
                          {leadStatusLabel(r.status)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[12px] text-[#86868b]">
                        {lead ? `${lead.detail}${lead.country ? ` · ${lead.country}` : ""} · ` : ""}
                        <span title={r.createdAt.toLocaleString("en-GB")}>{timeAgo(r.createdAt)}</span>
                        {r.employee.region ? ` · ${r.employee.region}` : ""}
                      </p>
                      {r.note && (
                        <p className="mt-2 whitespace-pre-line rounded-xl bg-[#f5f5f7] px-3 py-2 text-[12.5px] text-[#48484a]">
                          {r.note}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[12.5px] text-[#86868b]">
              Page {page} of {pages}
            </span>
            <div className="flex items-center gap-2">
              {page > 1 && (
                <Link
                  href={`/admin/activity/?page=${page - 1}`}
                  className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02]"
                >
                  Newer
                </Link>
              )}
              {page < pages && (
                <Link
                  href={`/admin/activity/?page=${page + 1}`}
                  className="rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02]"
                >
                  Older
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
