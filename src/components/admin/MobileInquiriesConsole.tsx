"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Package, RefreshCw } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { UserTabs } from "@/components/admin/UserTabs";

const sfFont = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

type Stage = "PENDING" | "CHECKED" | "IN_PROGRESS" | "CUSTOM";

interface InquiryRow {
  id: string;
  productId: number | null;
  productName: string;
  productImage: string | null;
  quantity: number;
  customerName: string;
  email: string | null;
  phone: string;
  country: string;
  /** The office's triage: new, handled or spam. */
  triage: string;
  /** What the customer sees in the app, and its words. */
  stage: Stage;
  label: string;
  createdAt: string;
}

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "CHECKED", label: "Checked" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "CUSTOM", label: "Custom" },
];

// Muted where nothing is owed, warm where the customer is waiting on us.
const STATUS_CHIP: Record<Stage, string> = {
  PENDING: "bg-[#fff4e5] text-[#8a5300]",
  CHECKED: "bg-[#e8f0fe] text-[#1a4fb4]",
  IN_PROGRESS: "bg-[#e6f4ea] text-[#1a7f37]",
  CUSTOM: "bg-[#f3e8ff] text-[#6b21a8]",
};

// The office is in Chennai; showing anything but local time invites mistakes.
function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * App inquiries, inside App users: the quote requests sent from the AFFHAN app. They are ordinary inquiries
 * (Inquiry.source APP, 2026-10-23), in the open pool like the website's, so a row opens the console's own popup,
 * where the customer's place in the pool, Release to pool, matching suppliers, the status they see and the
 * handling history are. The console's Inquiries list has them too, tagged App.
 */
export function MobileInquiriesConsole() {
  const router = useRouter();
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: "50" });
      if (status) qs.set("status", status);
      const res = await fetch(`/api/admin/inquiries/?${qs}`);
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      setRows(json.inquiries ?? []);
      setTotal(json.pagination?.total ?? 0);
      setTotalPages(json.pagination?.totalPages ?? 1);
    } catch (err) {
      console.error("Failed to load app inquiries:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const open = (id: string) => router.push(`/admin/?inquiry=${encodeURIComponent(id)}`);

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/"
              aria-label="Back to the dashboard"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] rail:hidden"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">App Inquiries</h1>
              <p className="text-[13px] text-[#86868b]">
                {total} {total === 1 ? "inquiry" : "inquiries"} from the AFFHAN app · in the open pool, and on the console&apos;s Inquiries, tagged App
              </p>
            </div>
          </div>
          <button
            onClick={() => void fetchRows()}
            className="flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02]"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Inside App users (the owner, 2026-10-23): the same tab bar as the customers' lists. */}
        <UserTabs active="app-inquiries" />

        <div className="mb-5 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setStatus(f.value);
                setPage(1);
              }}
              className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                status === f.value
                  ? "bg-[#1d1d1f] text-white"
                  : "bg-white text-[#1d1d1f] shadow-sm ring-1 ring-black/[0.06] hover:bg-black/[0.02]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-[#f5f5f7] text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
                <tr>
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="whitespace-nowrap px-5 py-3">Quantity</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="whitespace-nowrap px-5 py-3">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <Loader2 size={24} className="mx-auto animate-spin text-[#86868b]" />
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-[#86868b]">
                      {status ? "No inquiries with this status." : "No inquiries yet."}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const img = getCdnUrl(r.productImage, 96);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => open(r.id)}
                        className="cursor-pointer transition-colors hover:bg-black/[0.015]"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            {img ? (
                              <Image
                                src={img}
                                alt={r.productName}
                                width={40}
                                height={40}
                                className="h-10 w-10 shrink-0 rounded-lg bg-[#f5f5f7] object-cover ring-1 ring-black/[0.06]"
                              />
                            ) : (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f5f5f7] ring-1 ring-black/[0.06]">
                                <Package size={16} className="text-[#86868b]" />
                              </div>
                            )}
                            {/* A link too, so the popup can be opened in a new tab or reached by keyboard. */}
                            <Link
                              href={`/admin/?inquiry=${encodeURIComponent(r.id)}`}
                              onClick={(e) => e.stopPropagation()}
                              className={`line-clamp-2 max-w-xs font-medium leading-snug hover:underline ${r.triage !== "new" ? "text-[#86868b] line-through" : ""}`}
                            >
                              {r.productName}
                            </Link>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-medium">{r.customerName}</p>
                          <p className="text-[12px] text-[#86868b]">{r.email ?? r.phone}</p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 font-semibold">{r.quantity.toLocaleString("en-IN")}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-block max-w-[15rem] truncate rounded-full px-3 py-1 text-[12px] font-semibold ${STATUS_CHIP[r.stage]}`}>
                            {r.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-[#86868b]">{fmt(r.createdAt)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="mt-5 flex items-center justify-between text-[13px]">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-full bg-white px-4 py-2 shadow-sm ring-1 ring-black/[0.06] disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-[#86868b]">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-full bg-white px-4 py-2 shadow-sm ring-1 ring-black/[0.06] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
