"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Mail,
  Package,
  PencilLine,
  RefreshCw,
  X,
} from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";

const sfFont = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

type Status = "PENDING" | "CHECKED" | "IN_PROGRESS" | "CUSTOM";

interface MoqHistoryEntry {
  id?: string;
  oldMOQ: number;
  newMOQ: number;
  changedByUserId?: string | null;
  createdAt: string;
}

interface InquiryRow {
  id: string;
  productId: number | null;
  productName: string;
  productImage: string | null;
  requestedMOQ: number;
  status: Status;
  statusNote: string | null;
  label: string;
  message: string;
  moqEditedAt: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
  moqEditCount: number;
  lastMoqEdit: MoqHistoryEntry | null;
}

interface InquiryDetail extends Omit<InquiryRow, "moqEditCount" | "lastMoqEdit"> {
  user: { id: string; name: string; email: string; authProvider: string; createdAt: string };
  moqHistory: MoqHistoryEntry[];
  originalMOQ: number;
  updatedAt: string;
}

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "CHECKED", label: "Checked" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "CUSTOM", label: "Custom" },
];

// Muted where nothing is owed, warm where the customer is waiting on us.
const STATUS_CHIP: Record<Status, string> = {
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
  });
}

export function MobileInquiriesConsole() {
  const [rows, setRows] = useState<InquiryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: "50" });
      if (status) qs.set("status", status);
      const res = await fetch(`/api/admin/inquiries?${qs}`);
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

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02]"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">App Inquiries</h1>
              <p className="text-[13px] text-[#86868b]">
                {total} {total === 1 ? "inquiry" : "inquiries"} from the mobile app
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
                    const img = getCdnUrl(r.productImage);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setOpenId(r.id)}
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
                            <p className="line-clamp-2 max-w-xs font-medium leading-snug">
                              {r.productName}
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-medium">{r.user.name}</p>
                          <p className="text-[12px] text-[#86868b]">{r.user.email}</p>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3">
                          <span className="font-semibold">{r.requestedMOQ.toLocaleString("en-IN")}</span>
                          {/* The one thing that must not be missed on a scan: the
                              customer moved the number after we first saw it. */}
                          {r.moqEditCount > 0 && r.lastMoqEdit && (
                            <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-[#8a5300]">
                              <PencilLine size={11} />
                              was {r.lastMoqEdit.oldMOQ.toLocaleString("en-IN")}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-block max-w-[15rem] truncate rounded-full px-3 py-1 text-[12px] font-semibold ${STATUS_CHIP[r.status]}`}
                          >
                            {r.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-[#86868b]">
                          {fmt(r.createdAt)}
                        </td>
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

      {openId && (
        <InquiryDetailPanel
          id={openId}
          onClose={() => setOpenId(null)}
          onSaved={() => void fetchRows()}
        />
      )}
    </div>
  );
}

function InquiryDetailPanel({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<InquiryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>("PENDING");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/inquiries/${id}`);
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!alive) return;
        setData(json.inquiry);
        setStatus(json.inquiry.status);
        setNote(json.inquiry.statusNote ?? "");
      } catch (err) {
        console.error("Failed to load inquiry:", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // Escape closes, as it does everywhere else in the console.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inquiries/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, statusNote: note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? "Could not save.");
        return;
      }
      setData((d) => (d ? { ...d, ...json.inquiry } : d));
      onSaved();
      onClose();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const img = getCdnUrl(data?.productImage);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        style={sfFont}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/[0.06] bg-white/90 px-6 py-4 backdrop-blur">
          <h2 className="text-[15px] font-semibold">Inquiry</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/[0.05]"
          >
            <X size={16} />
          </button>
        </div>

        {loading || !data ? (
          <div className="py-20 text-center">
            <Loader2 size={24} className="mx-auto animate-spin text-[#86868b]" />
          </div>
        ) : (
          <div className="space-y-6 px-6 py-5">
            <div className="flex gap-4">
              {img ? (
                <Image
                  src={img}
                  alt={data.productName}
                  width={88}
                  height={88}
                  className="h-[88px] w-[88px] shrink-0 rounded-xl bg-[#f5f5f7] object-cover ring-1 ring-black/[0.06]"
                />
              ) : (
                <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-xl bg-[#f5f5f7] ring-1 ring-black/[0.06]">
                  <Package size={22} className="text-[#86868b]" />
                </div>
              )}
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold leading-snug">{data.productName}</h3>
                {data.productId ? (
                  <Link
                    href={`/products/${data.productId}`}
                    target="_blank"
                    className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-[#1a4fb4] hover:underline"
                  >
                    Product #{data.productId} <ArrowRight size={11} />
                  </Link>
                ) : (
                  // productId is nulled when a product leaves the catalogue; the
                  // name and image above are the copies kept on the inquiry.
                  <p className="mt-1 text-[12px] text-[#86868b]">
                    No longer in the catalogue
                  </p>
                )}
                <p className="mt-2 text-[12px] text-[#86868b]">
                  Submitted {fmt(data.createdAt)}
                </p>
              </div>
            </div>

            <Section title="Customer">
              <div className="rounded-xl bg-[#f5f5f7] px-4 py-3">
                <p className="font-medium">{data.user.name}</p>
                <a
                  href={`mailto:${data.user.email}`}
                  className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#1a4fb4] hover:underline"
                >
                  <Mail size={12} /> {data.user.email}
                </a>
                <p className="mt-2 text-[12px] text-[#86868b]">
                  Signed up {fmt(data.user.createdAt)} · {data.user.authProvider.replace(/_/g, " ").toLowerCase()}
                </p>
              </div>
            </Section>

            <Section title="Quantity requested">
              <div className="rounded-xl bg-[#f5f5f7] px-4 py-3">
                <p className="text-2xl font-semibold tracking-tight">
                  {data.requestedMOQ.toLocaleString("en-IN")}
                </p>
                {data.moqHistory.length === 0 ? (
                  <p className="mt-1 text-[12px] text-[#86868b]">
                    Unchanged since it was submitted.
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-[12px] text-[#86868b]">
                      Originally asked for {data.originalMOQ.toLocaleString("en-IN")}.
                    </p>
                    <ul className="mt-3 space-y-2 border-t border-black/[0.06] pt-3">
                      {data.moqHistory.map((e, i) => (
                        <li key={e.id ?? i} className="flex items-start gap-2 text-[13px]">
                          <PencilLine size={13} className="mt-0.5 shrink-0 text-[#8a5300]" />
                          <span>
                            User changed quantity from{" "}
                            <strong>{e.oldMOQ.toLocaleString("en-IN")}</strong> to{" "}
                            <strong>{e.newMOQ.toLocaleString("en-IN")}</strong>
                            <span className="text-[#86868b]"> · {fmt(e.createdAt)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </Section>

            <Section title="Status">
              <div className="space-y-3">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status)}
                  className="w-full rounded-xl bg-[#f5f5f7] px-4 py-2.5 text-[13px] outline-none ring-1 ring-transparent transition-all focus:bg-white focus:ring-black/[0.08]"
                >
                  <option value="PENDING">Pending</option>
                  <option value="CHECKED">Checked</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="CUSTOM">Custom message…</option>
                </select>

                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder={
                    status === "CUSTOM"
                      ? "What the customer will see, e.g. Quote sent to your email"
                      : "Optional note shown under the status (leave blank for none)"
                  }
                  className="w-full resize-none rounded-xl bg-[#f5f5f7] px-4 py-3 text-[13px] outline-none ring-1 ring-transparent transition-all placeholder:text-[#86868b] focus:bg-white focus:ring-black/[0.08]"
                />
                <p className="text-[12px] text-[#86868b]">
                  This text is shown to the customer in the app, not an internal note.
                </p>

                {error && (
                  <p className="rounded-xl bg-[#ffeceb] px-4 py-2.5 text-[13px] text-[#b3261e]">
                    {error}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={onClose}
                    className="rounded-full px-5 py-2.5 text-[13px] font-medium text-[#1d1d1f] transition-colors hover:bg-black/[0.05]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void save()}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-full bg-[#1d1d1f] px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {saving && <Loader2 size={13} className="animate-spin" />}
                    Save status
                  </button>
                </div>
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
        {title}
      </h4>
      {children}
    </section>
  );
}
