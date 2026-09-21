import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ChevronRight, MessageSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { timeAgo } from "@/lib/relative-time";
import { formatDateTime } from "@/lib/datetime";
import { leadStatusChip, leadStatusLabel } from "@/lib/leadStatus";
import { getCdnUrl } from "@/lib/cdn";
import { normalizePhoneKey } from "@/lib/customerGroups";
import { collapseUpdates } from "@/lib/statusBatch";
import { handoffsFor } from "@/lib/lead-handoff";
import { LiveRefresh } from "@/components/ui/LiveRefresh";

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
 *
 * Each row is one link, to the lead itself in the console — the whole card, not
 * just the name in it, which is what made the feed feel unclickable. The staff
 * member's name inside stays its own link (to their page), lifted above the
 * row's so the two never nest. The page refreshes itself while it is open.
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
        inquiry: {
          select: { id: true, customerName: true, productName: true, country: true, phone: true, customerKey: true, product: { select: { imageUrl: true } } },
        },
        contact: { select: { id: true, fullName: true, companyName: true, country: true, phone: true, customerKey: true } },
      },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  /**
   * One line per action, not per row.
   *
   * An outcome is recorded against a customer and stored against each of the
   * products they asked about (see the status route), so one thing somebody
   * did arrives here as three or four identical rows. They are folded back
   * together on the same terms the workspace wrote them: same person, same
   * customer, same outcome, same note, same second.
   */
  const feed = collapseUpdates(rows, (r) => ({
    status: r.status,
    note: r.note,
    createdAt: r.createdAt,
    employeeId: r.employee.id,
    scope:
      normalizePhoneKey(r.inquiry?.phone ?? r.contact?.phone ?? "") ||
      r.inquiry?.customerName ||
      r.contact?.fullName ||
      "",
  }));

  /**
   * And then what?
   *
   * "Not attended" is the one outcome that does something on its own: the
   * customer leaves the person who recorded it that second and is offered to
   * somebody else. The feed used to stop at the recording, which reads as a
   * dead end — the administrator's next question is always who has them now,
   * and answering it meant opening the Queue and matching up timestamps.
   *
   * One line per decline, keyed on the batch's first row, and one query for
   * the page however many declines are on it. Where the record says nothing
   * the line says nothing: see lib/lead-handoff.ts.
   */
  const handoffs = await handoffsFor(
    feed
      .map((batch) => batch[0])
      .filter((r) => r.status === "NOT_ATTENDED")
      .map((r) => ({
        id: r.id,
        customerKey: r.inquiry?.customerKey ?? r.contact?.customerKey ?? null,
        employeeId: r.employee.id,
        at: r.createdAt,
      })),
  );

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/admin/"
            aria-label="Back to the dashboard"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] lg:hidden"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
            <p className="text-[13px] text-[#86868b]">
              {total === 0
                ? "Nothing recorded yet. Outcomes appear here as the team records them."
                : `${total} ${total === 1 ? "update" : "updates"} recorded · newest first${
                    feed.length !== rows.length ? " · one line per outcome, however many products it covered" : ""
                  }`}
            </p>
          </div>
          <LiveRefresh intervalMs={30_000} />
        </div>

        {rows.length === 0 ? (
          <p className="rounded-2xl bg-white px-5 py-12 text-center text-[13px] text-[#86868b] shadow-sm ring-1 ring-black/[0.04]">
            When somebody records an outcome against a lead assigned to them, it shows up here.
          </p>
        ) : (
          <ol className="space-y-2">
            {feed.map((batch) => {
              const r = batch[0];
              const who = r.employee.name;
              // What the whole action covered: the products named on its rows,
              // and the first photograph among them.
              const items = batch
                .map((b) => (b.inquiry ? b.inquiry.productName : b.contact ? "Contact message" : null))
                .filter((x): x is string => Boolean(x));
              const image = batch.find((b) => b.inquiry?.product?.imageUrl)?.inquiry?.product?.imageUrl ?? null;
              const lead = r.inquiry
                ? { name: r.inquiry.customerName, detail: items.join(" · "), href: `/admin/?inquiry=${r.inquiry.id}`, country: r.inquiry.country, image }
                : r.contact
                  ? { name: r.contact.fullName, detail: r.contact.companyName ?? "Contact message", href: `/admin/?contact=${r.contact.id}`, country: r.contact.country, image: null }
                  : null;
              const thumb = lead?.image ? getCdnUrl(lead.image, 128) : null;
              const handoff = handoffs.get(r.id);
              return (
                <li key={r.id} className="group relative rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.04] transition-shadow hover:shadow-md">
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
                        <Link href={`/admin/employees/${r.employee.id}/`} className="relative z-10 font-semibold hover:underline">
                          {who}
                        </Link>{" "}
                        marked{" "}
                        {lead ? (
                          <Link href={lead.href} className="font-semibold after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover:underline">
                            {lead.name}
                          </Link>
                        ) : (
                          <span className="font-semibold">a lead since removed</span>
                        )}{" "}
                        as{" "}
                        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${leadStatusChip(r.status)}`}>
                          {leadStatusLabel(r.status)}
                        </span>
                        {batch.length > 1 && (
                          <span className="text-[#86868b]">
                            {" "}
                            across {batch.length} products
                          </span>
                        )}
                        {/* Where the customer went next, in the same sentence.
                            The arrow does the work a second line would, and
                            keeps one action on one line. */}
                        {handoff && (
                          <span className="text-[#48484a]">
                            {" → "}
                            {handoff.kind === "passed" ? (
                              <>
                                passed to{" "}
                                {handoff.toEmployeeId ? (
                                  <Link
                                    href={`/admin/employees/${handoff.toEmployeeId}/`}
                                    className="relative z-10 font-semibold hover:underline"
                                  >
                                    {handoff.toName}
                                  </Link>
                                ) : (
                                  <span className="font-semibold">{handoff.toName}</span>
                                )}
                              </>
                            ) : handoff.kind === "waiting" ? (
                              <>
                                waiting in the queue
                                {handoff.reason && <span className="text-[#86868b]"> · {handoff.reason}</span>}
                              </>
                            ) : (
                              <>nobody on the team took it on</>
                            )}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-[#86868b]">
                        {lead ? `${lead.detail}${lead.country ? ` · ${lead.country}` : ""} · ` : ""}
                        <span title={formatDateTime(r.createdAt)}>{timeAgo(r.createdAt)}</span>
                        {r.employee.region ? ` · ${r.employee.region}` : ""}
                      </p>
                      {r.note && (
                        <p className="mt-2 whitespace-pre-line rounded-xl bg-[#f5f5f7] px-3 py-2 text-[12.5px] text-[#48484a]">
                          {r.note}
                        </p>
                      )}
                    </div>
                    {lead && (
                      <div className="flex shrink-0 items-center gap-2">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-12 w-12 rounded-xl bg-[#f5f5f7] object-cover ring-1 ring-black/[0.06]" />
                        ) : r.contact ? (
                          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f5f5f7] text-[#86868b]">
                            <MessageSquare className="h-5 w-5" />
                          </span>
                        ) : null}
                        <ChevronRight className="hidden h-4 w-4 text-[#86868b] sm:block" />
                      </div>
                    )}
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
