"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Mail, MessageCircle, Phone, RefreshCw, Search, X } from "lucide-react";
import { businessStatusBrief } from "@/lib/trip-application";

/**
 * Free China trip applications, for the office.
 *
 * Newest first, in the triage the other leads use (new, handled, spam, and a
 * soft delete). A row opens every answer the applicant gave, grouped the way
 * the form asked them, with call / WhatsApp / email on top so the next step
 * is one tap. Excel export of whatever the filter shows.
 *
 * Step 02 is the applicant's business journey (running a business, planning
 * one, expanding one, or none yet), and only the answers that journey asked
 * are shown. The order is arrival only: nothing here scores or ranks an
 * application, and the winners are drawn at random (Terms, clause 3).
 *
 * Nothing sensitive is collected by the form (no passport numbers, no
 * documents), so there is nothing here to mask.
 */

const sfFont = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

type Status = "new" | "handled" | "spam" | "deleted";

interface Application {
  id: string;
  referenceNo: string;
  createdAt: string;
  status: Status;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  profileUrl: string | null;
  businessStatus: string;
  companyName: string | null;
  role: string | null;
  businessCategory: string | null;
  companyWebsite: string | null;
  yearsInBusiness: string | null;
  businessDescription: string | null;
  businessPlan: string | null;
  areaOfInterest: string | null;
  exploreGoal: string | null;
  interests: string[];
  productsOfInterest: string;
  exploreNotes: string | null;
  nationality: string;
  hasPassport: boolean;
  travelledToChina: boolean;
  consentPrivacy: boolean;
  consentAccuracy: boolean;
  consentTerms: boolean;
  userId: string | null;
  source: string;
}

const TABS: { key: "new" | "handled" | "spam" | "all"; label: string }[] = [
  { key: "new", label: "New" },
  { key: "handled", label: "Handled" },
  { key: "spam", label: "Spam" },
  { key: "all", label: "All" },
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const statusPill: Record<Status, string> = {
  new: "bg-[#0071e3]/10 text-[#0058b0]",
  handled: "bg-emerald-500/10 text-emerald-700",
  spam: "bg-amber-500/15 text-amber-800",
  deleted: "bg-black/[0.06] text-[#86868b]",
};

const digits = (phone: string) => phone.replace(/[^\d]/g, "");
const href = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

export function TripApplicationsBoard() {
  const [rows, setRows] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("new");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/trip-applications/", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 401 ? "Your admin session has ended. Sign in again." : "Could not load applications.");
      const body = (await res.json()) as { applications: Application[] };
      setRows(body.applications);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load applications.");
      setRows((r) => r ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { new: 0, handled: 0, spam: 0, all: 0 };
    for (const r of rows ?? []) {
      c.all++;
      if (r.status === "new" || r.status === "handled" || r.status === "spam") c[r.status]++;
    }
    return c;
  }, [rows]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (tab !== "all" && r.status !== tab) return false;
      if (!needle) return true;
      return [r.referenceNo, r.fullName, r.email, r.phone, r.companyName, r.city, r.country, r.businessCategory, r.areaOfInterest, businessStatusBrief(r.businessStatus)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, tab, q]);

  const open = rows?.find((r) => r.id === openId) ?? null;

  const setStatus = async (id: string, status: Status) => {
    if (!rows) return;
    if (status === "deleted" && !window.confirm("Delete this application? It will be hidden from this list.")) return;
    const before = rows;
    setRows(status === "deleted" ? rows.filter((r) => r.id !== id) : rows.map((r) => (r.id === id ? { ...r, status } : r)));
    if (status === "deleted") setOpenId(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/trip-applications/${id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setRows(before);
      setError("That change did not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const headers = [
      "Reference", "Received", "Status", "Full name", "Email", "Mobile", "Country", "City", "Website / LinkedIn",
      "Business journey", "Company / brand", "Role", "Business category / area", "Company website", "Years in business",
      "About the business", "Planning to build", "Area of interest", "Would like to explore",
      "Interested in", "Products of interest", "Hoping to explore", "Nationality", "Valid passport", "Been to China",
      "Privacy Policy", "Accurate & complete", "Terms & Conditions",
    ];
    const yes = (v: boolean) => (v ? "Yes" : "No");
    const data = list.map((r) => [
      r.referenceNo, fmtDate(r.createdAt), r.status, r.fullName, r.email, r.phone, r.country, r.city, r.profileUrl ?? "",
      businessStatusBrief(r.businessStatus), r.companyName ?? "", r.role ?? "", r.businessCategory ?? "", r.companyWebsite ?? "", r.yearsInBusiness ?? "",
      r.businessDescription ?? "", r.businessPlan ?? "", r.areaOfInterest ?? "", r.exploreGoal ?? "",
      r.interests.join(", "), r.productsOfInterest, r.exploreNotes ?? "", r.nationality, yes(r.hasPassport), yes(r.travelledToChina),
      yes(r.consentPrivacy), yes(r.consentAccuracy), yes(r.consentTerms),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    // Mobile numbers as text, or Excel shows 919876543210 as 9.19E+11.
    for (let row = 1; row <= data.length; row++) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: 5 })];
      if (cell) {
        cell.t = "s";
        cell.z = "@";
        cell.v = String(cell.v ?? "");
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Trip applications");
    XLSX.writeFile(wb, `trip-applications-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Link
            href="/admin/"
            aria-label="Back to the dashboard"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] lg:hidden"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Trip applications</h1>
            <p className="text-[13px] text-[#86868b]">
              Applications for the free China business trip, from affhan.com/free-china-trip/apply
              {rows ? ` · ${counts.new} new` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06] hover:bg-black/[0.02]"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={!list.length}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06] hover:bg-black/[0.02] disabled:opacity-50"
          >
            <Download size={14} /> Export
          </button>
        </div>

        {error && <p className="mb-4 rounded-xl bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-700">{error}</p>}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Filter by status" className="flex rounded-full bg-white p-1 shadow-sm ring-1 ring-black/[0.06]">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${tab === t.key ? "bg-[#1d1d1f] text-white" : "text-[#1d1d1f] hover:bg-black/[0.04]"}`}
              >
                {t.label} <span className={tab === t.key ? "text-white/70" : "text-[#86868b]"}>{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <span className="sr-only">Search applications</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, company, email, reference…"
              className="h-9 w-full rounded-full bg-white pl-9 pr-4 text-[13px] shadow-sm ring-1 ring-black/[0.06] outline-none focus:ring-2 focus:ring-[#0071e3]/40"
            />
          </label>
        </div>

        {rows === null ? (
          <p className="py-16 text-center text-[13px] text-[#86868b]">Loading…</p>
        ) : list.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-black/[0.06]">
            <p className="text-[15px] font-medium">No applications {tab === "all" ? "yet" : `marked ${tab}`}.</p>
            <p className="mt-1 text-[13px] text-[#86868b]">Applications from the free China business trip page arrive here.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.06]">
            <ul className="divide-y divide-black/[0.06]">
              {list.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(r.id)}
                    className="grid w-full grid-cols-1 gap-1 px-5 py-4 text-left transition-colors hover:bg-black/[0.02] sm:grid-cols-[9rem_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_6rem] sm:items-center sm:gap-4"
                  >
                    <span className="font-mono text-[12px] text-[#86868b]">{r.referenceNo}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{r.fullName}</span>
                      <span className="block truncate text-[12px] text-[#86868b]">{r.email}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px]">{r.companyName || businessStatusBrief(r.businessStatus)}</span>
                      <span className="block truncate text-[12px] text-[#86868b]">{r.businessCategory || r.areaOfInterest}</span>
                    </span>
                    <span className="min-w-0 text-[13px]">
                      <span className="block truncate">{r.city}, {r.country}</span>
                      <span className="block text-[12px] text-[#86868b]">{fmtDate(r.createdAt)}</span>
                    </span>
                    <span className={`w-fit rounded-full px-2.5 py-1 text-[12px] font-medium capitalize ${statusPill[r.status]}`}>{r.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {open && <Detail a={open} busy={busy} onClose={() => setOpenId(null)} onStatus={(s) => void setStatus(open.id, s)} />}
    </div>
  );
}

/** Step 02's answers, as the applicant's business journey asked them (BUSINESS_FIELDS in lib/trip-application.ts). */
function businessRows(a: Application): Array<[string, React.ReactNode]> {
  const site = (url: string | null) =>
    url ? <a className="text-[#0058b0] underline" href={href(url)} target="_blank" rel="noopener noreferrer">{url}</a> : null;
  const journey: [string, React.ReactNode] = ["Business journey", businessStatusBrief(a.businessStatus) || a.businessStatus];
  if (a.businessStatus === "planning_business") {
    return [journey, ["Business / brand name", a.companyName], ["Category / area", a.businessCategory], ["Company website", site(a.companyWebsite)], ["Planning to build", a.businessPlan]];
  }
  if (a.businessStatus === "no_business_yet") {
    return [journey, ["Area of interest", a.areaOfInterest], ["Would like to explore in China", a.exploreGoal]];
  }
  return [
    journey,
    ["Company", a.companyName],
    ["Role", a.role],
    ["Category", a.businessCategory],
    ["Years in business", a.yearsInBusiness],
    ["Company website", site(a.companyWebsite)],
    ["About the business", a.businessDescription],
  ];
}

function Detail({ a, busy, onClose, onStatus }: { a: Application; busy: boolean; onClose: () => void; onStatus: (s: Status) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const section = (title: string, rows: Array<[string, React.ReactNode]>) => (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.06]">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#86868b]">{title}</h3>
      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[12px] text-[#86868b]">{k}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap break-words text-[14px]">{v || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );

  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-app-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-[#f5f5f7] shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-black/[0.06] bg-[#f5f5f7]/95 px-6 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[12px] text-[#86868b]">{a.referenceNo} · {fmtDate(a.createdAt)}</p>
            <h2 id="trip-app-title" className="mt-0.5 truncate text-xl font-semibold tracking-tight">{a.fullName}</h2>
            <p className="truncate text-[13px] text-[#86868b]">{[a.role, a.companyName].filter(Boolean).join(", ") || businessStatusBrief(a.businessStatus)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06]">
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-4 px-6 py-5">
          <div className="flex flex-wrap gap-2">
            <a href={`tel:${a.phone.replace(/\s+/g, "")}`} className="inline-flex h-9 items-center gap-2 rounded-full bg-[#1d1d1f] px-4 text-[13px] font-medium text-white">
              <Phone size={14} /> Call {a.phone}
            </a>
            <a href={`https://wa.me/${digits(a.phone)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06]">
              <MessageCircle size={14} /> WhatsApp
            </a>
            <a href={`mailto:${a.email}?subject=${encodeURIComponent(`Your Free China Business Trip application (${a.referenceNo})`)}`} className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06]">
              <Mail size={14} /> Email
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-[#86868b]">Status:</span>
            {(["new", "handled", "spam"] as const).map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy || a.status === s}
                onClick={() => onStatus(s)}
                className={`rounded-full px-3 py-1.5 font-medium capitalize ring-1 ring-black/[0.06] ${a.status === s ? statusPill[s] : "bg-white hover:bg-black/[0.03]"} disabled:cursor-default`}
              >
                {s === "handled" ? "Handled" : s === "spam" ? "Spam" : "New"}
              </button>
            ))}
            <button type="button" disabled={busy} onClick={() => onStatus("deleted")} className="ml-auto rounded-full px-3 py-1.5 font-medium text-red-600 hover:bg-red-500/10">
              Delete
            </button>
          </div>

          {section("About the applicant", [
            ["Email", a.email],
            ["Mobile", a.phone],
            ["City", a.city],
            ["Country", a.country],
            ["Website / LinkedIn", a.profileUrl ? <a className="text-[#0058b0] underline" href={href(a.profileUrl)} target="_blank" rel="noopener noreferrer">{a.profileUrl}</a> : null],
            ["Signed in", a.userId ? "Yes, with an Affhan account" : "No"],
          ])}
          {section("Business journey", businessRows(a))}
          {section("Business profile", [
            ["Interested in", a.interests.join(", ")],
            ["Products or categories", a.productsOfInterest],
            ["Hoping to explore in China", a.exploreNotes],
          ])}
          {section("Travel profile", [
            ["Nationality", a.nationality],
            ["Holds a valid passport", a.hasPassport ? "Yes" : "No"],
            ["Been to China before", a.travelledToChina ? "Yes" : "No"],
          ])}
          {section("Consent", [
            ["Privacy Policy", a.consentPrivacy ? "Consented" : "Not given"],
            ["Information is accurate", a.consentAccuracy ? "Confirmed" : "Not given"],
            ["Terms & Conditions", a.consentTerms ? "Agreed" : "Not given"],
          ])}
        </div>
      </aside>
    </div>
  );
}
