"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { timeAgo } from "@/lib/relative-time";
import { EmployeeForm, type EmployeeRow } from "@/components/admin/EmployeeForm";

const sfFont = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

export interface StatusUpdateRow {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
  inquiry: { id: string; customerName: string; productName: string; email: string | null } | null;
  contact: { id: string; fullName: string; email: string } | null;
}

const STATUS_TONE: Record<string, string> = {
  CONVERTED: "bg-emerald-500/10 text-emerald-700",
  NOT_CONVERTED: "bg-red-500/10 text-red-700",
  IN_PROGRESS: "bg-sky-500/10 text-sky-700",
  FOLLOW_UP: "bg-amber-500/10 text-amber-700",
};

/**
 * One member of staff: who they are, what is assigned to them, and everything
 * they have recorded against a lead.
 *
 * The history is the point of the page. It is append-only by design (see the
 * StatusUpdate model), so this is a record rather than a view of current
 * state — and it stays empty until phases 4 and 5 give the sales team a way to
 * write to it.
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

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
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
          <button
            onClick={() => setEditing((v) => !v)}
            className="ml-auto flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02]"
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
                      Nothing recorded yet. Status updates start once the sales workspace can write
                      them.
                    </td>
                  </tr>
                ) : (
                  updates.map((u) => {
                    const who = u.inquiry?.customerName ?? u.contact?.fullName ?? "—";
                    const what = u.inquiry ? u.inquiry.productName : "Contact message";
                    return (
                      <tr key={u.id} className="align-top transition-colors hover:bg-black/[0.015]">
                        <td className="whitespace-nowrap px-5 py-3" title={new Date(u.createdAt).toLocaleString("en-GB")}>
                          {timeAgo(u.createdAt)}
                        </td>
                        <td className="px-5 py-3">
                          <span className="block font-semibold">{who}</span>
                          <span className="block text-xs text-[#86868b]">{what}</span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                              STATUS_TONE[u.status] ?? "bg-black/[0.05] text-[#86868b]"
                            }`}
                          >
                            {u.status.replace(/_/g, " ").toLowerCase()}
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
