"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { timeAgo } from "@/lib/relative-time";
import { formatDateTime } from "@/lib/datetime";
import { leadStatusChip, leadStatusLabel } from "@/lib/leadStatus";
import { normalizePhoneKey } from "@/lib/customerGroups";
import { collapseUpdates } from "@/lib/statusBatch";
import { EmployeeForm, type EmployeeRow } from "@/components/admin/EmployeeForm";
import { LiveRefresh } from "@/components/ui/LiveRefresh";

const sfFont = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

export interface StatusUpdateRow {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
  inquiry: { id: string; customerName: string; productName: string; email: string | null; phone: string } | null;
  contact: { id: string; fullName: string; email: string; phone: string } | null;
}

/**
 * One member of staff: who they are, what is assigned to them, and everything
 * they have recorded against a lead.
 *
 * The history is the point of the page. It is append-only by design (see the
 * StatusUpdate model), so this is a record of what was said when, rather than a
 * view of current state: the newest row is the current outcome and the earlier
 * ones stay exactly as they were written.
 */
export function EmployeeDetail({
  employee,
  counts,
  updates,
}: {
  employee: EmployeeRow;
  counts: { inquiries: number; contacts: number; updates: number };
  updates: StatusUpdateRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [row, setRow] = useState(employee);
  // The page refreshes itself (LiveRefresh below); keep the header's facts —
  // last sign-in above all — in step with what the server now says.
  useEffect(() => setRow(employee), [employee]);

  // The rows of one recorded outcome, back together — see lib/statusBatch.ts.
  const history = useMemo(
    () =>
      collapseUpdates(updates, (u) => ({
        status: u.status,
        note: u.note,
        createdAt: u.createdAt,
        scope:
          normalizePhoneKey(u.inquiry?.phone ?? u.contact?.phone ?? "") ||
          u.inquiry?.customerName ||
          u.contact?.fullName ||
          "",
      })),
    [updates]
  );

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/admin/employees/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02]"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{row.name}</h1>
            <p className="text-[13px] text-[#86868b]">{row.email}</p>
          </div>
          <div className="ml-auto hidden md:block">
            <LiveRefresh intervalMs={30_000} />
          </div>
          <button
            onClick={() => setEditing((v) => !v)}
            className="flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02]"
          >
            <Pencil size={14} />
            {editing ? "Close" : "Edit"}
          </button>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.04]">
          <div className="flex flex-wrap items-center gap-4">
            {row.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.image} alt="" className="h-16 w-16 rounded-full bg-[#f5f5f7] object-cover ring-1 ring-black/10" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#f5f5f7] text-lg font-bold text-[#86868b] ring-1 ring-black/10">
                {row.name.charAt(0).toUpperCase()}
              </span>
            )}
            <dl className="grid flex-1 gap-x-8 gap-y-2 text-[13px] sm:grid-cols-3">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">Region</dt>
                <dd className="font-medium">{row.region || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">Rank</dt>
                <dd className="font-medium">{row.role === "ADMIN" ? "Admin" : "Employee"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">Status</dt>
                <dd>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                      row.isActive ? "bg-emerald-500/10 text-emerald-700" : "bg-black/[0.05] text-[#86868b]"
                    }`}
                  >
                    {row.isActive ? "Active" : "Inactive"}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">Last login</dt>
                <dd className="font-medium">
                  {row.lastLoginAt ? timeAgo(row.lastLoginAt) : "never"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">Added</dt>
                <dd className="font-medium">{new Date(row.createdAt).toLocaleDateString("en-GB")}</dd>
              </div>
            </dl>
          </div>

          {editing && (
            <div className="mt-5 border-t border-black/[0.06] pt-5">
              <EmployeeForm
                mode="edit"
                initial={row}
                onSaved={(saved) => {
                  setRow(saved);
                  setEditing(false);
                  // The row the list shows came from the server, so ask for it
                  // again rather than letting the two disagree.
                  router.refresh();
                }}
                onCancel={() => setEditing(false)}
              />
            </div>
          )}
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {[
            ["Assigned inquiries", counts.inquiries],
            ["Assigned contact messages", counts.contacts],
            ["Status updates recorded", counts.updates],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.04]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{value as number}</p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
          <div className="flex items-center justify-between px-5 py-3">
            <h2 className="text-[15px] font-semibold">Status update history</h2>
            <span className="text-[12px] text-[#86868b]">Newest first · append-only</span>
          </div>
          <div className="overflow-x-auto border-t border-black/[0.06]">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#f5f5f7] text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
                <tr>
                  <th className="px-5 py-3">When</th>
                  <th className="px-5 py-3">Lead</th>
                  <th className="px-5 py-3">Outcome</th>
                  <th className="px-5 py-3">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {updates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-[#86868b]">
                      Nothing recorded yet. Outcomes appear here as this person records them
                      against the leads assigned to them.
                    </td>
                  </tr>
                ) : (
                  history.map((batch) => {
                    const u = batch[0];
                    const who = u.inquiry?.customerName ?? u.contact?.fullName ?? "—";
                    // One customer-level outcome is one line, whatever number
                    // of that customer's products it was written against.
                    const items = batch.map((b) => (b.inquiry ? b.inquiry.productName : "Contact message"));
                    const what = items.length === 1 ? items[0] : `${items.length} products · ${items.join(", ")}`;
                    return (
                      <tr key={u.id} className="align-top transition-colors hover:bg-black/[0.015]">
                        <td className="whitespace-nowrap px-5 py-3" title={formatDateTime(u.createdAt)}>
                          {timeAgo(u.createdAt)}
                        </td>
                        <td className="px-5 py-3">
                          {/* Back to the row itself — it lives in the console's
                              list, not on a page of its own. */}
                          {u.inquiry || u.contact ? (
                            <Link
                              href={u.inquiry ? `/admin/?inquiry=${u.inquiry.id}` : `/admin/?contact=${u.contact!.id}`}
                              className="block"
                            >
                              <span className="block font-semibold hover:underline">{who}</span>
                              <span className="line-clamp-2 block text-xs text-[#86868b]">{what}</span>
                            </Link>
                          ) : (
                            <>
                              <span className="block font-semibold">{who}</span>
                              <span className="block text-xs text-[#86868b]">{what}</span>
                            </>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${leadStatusChip(u.status)}`}>
                            {leadStatusLabel(u.status)}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[#515154]">{u.note || "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmployeeDetail;
