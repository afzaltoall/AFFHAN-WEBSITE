"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, Download, ExternalLink, Mail, MessageCircle, Phone, RefreshCw, Search, X } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { REPLY_MAX, TEAM_STATUSES, TEAM_STATUS_LABEL, moqPhrase, type OfferStatus } from "@/lib/supplier-offer";

/**
 * The supplier portal, for the office (the admin rail's "New Suppliers", 2026-10-21): every application a
 * supplier has sent, "I have this product" with its MOQ, details, photos and contact, and the accounts behind
 * them.
 *
 * The board's vocabulary is the trip board's (TripApplicationsBoard): status tabs with counts, a search, a list
 * that opens one application in a panel with call, WhatsApp, WeChat and email on top. The team's statuses are
 * New, Reviewing, Accepted and Not selected; the supplier sees each (as Sent, Being reviewed, Accepted, Not
 * selected) with the reply written here. Withdrawn is the supplier's own, and stays as they left it.
 *
 * Accounts can be blocked: the supplier is signed out at once and cannot sign in again until unblocked. Their
 * applications stay.
 */

const sfFont = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif',
};

export interface BoardOffer {
  id: string;
  productId: number | null;
  productName: string;
  productImage: string | null;
  categoryName: string | null;
  moq: number;
  moqUnit: string;
  details: string;
  photos: string[];
  contactName: string;
  companyName: string;
  mobile: string;
  wechatId: string;
  companyAddress: string;
  status: OfferStatus;
  reply: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  supplierId: string;
  supplierEmail: string;
  supplierBlocked: boolean;
}

export interface BoardAccount {
  id: string;
  email: string;
  name: string;
  mobile: string;
  companyName: string | null;
  wechatId: string | null;
  companyAddress: string | null;
  status: "ACTIVE" | "BLOCKED";
  lastLoginAt: string | null;
  createdAt: string;
  offers: number;
}

type StatusTab = OfferStatus | "ALL";
const STATUS_TABS: StatusTab[] = ["NEW", "REVIEWING", "ACCEPTED", "REJECTED", "WITHDRAWN", "ALL"];

const statusPill: Record<OfferStatus, string> = {
  NEW: "bg-[#0071e3]/10 text-[#0058b0]",
  REVIEWING: "bg-amber-500/15 text-amber-800",
  ACCEPTED: "bg-emerald-500/10 text-emerald-700",
  REJECTED: "bg-black/[0.06] text-[#48484a]",
  WITHDRAWN: "bg-black/[0.04] text-[#86868b]",
};

const digits = (phone: string) => phone.replace(/[^\d]/g, "");
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export function NewSuppliersBoard({
  offers: initialOffers,
  accounts: initialAccounts,
  initialTab,
  capped,
}: {
  offers: BoardOffer[];
  accounts: BoardAccount[];
  initialTab: "applications" | "accounts";
  capped: boolean;
}) {
  const router = useRouter();
  const [offers, setOffers] = useState(initialOffers);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [view, setView] = useState<"applications" | "accounts">(initialTab);
  const [tab, setTab] = useState<StatusTab>("NEW");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // A refresh (router.refresh) hands new rows down: take them.
  useEffect(() => setOffers(initialOffers), [initialOffers]);
  useEffect(() => setAccounts(initialAccounts), [initialAccounts]);
  useEffect(() => setRefreshing(false), [initialOffers, initialAccounts]);

  // The view in the address, so a reload or a link opens the same one.
  useEffect(() => {
    const url = `${window.location.pathname}${view === "accounts" ? "?tab=accounts" : ""}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
  }, [view]);

  const needle = q.trim().toLowerCase();
  const offerWords = useMemo(
    () =>
      new Map(
        offers.map((o) => [
          o.id,
          [o.productName, o.categoryName, o.contactName, o.companyName, o.mobile, o.wechatId, o.supplierEmail, o.details, o.productId]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        ]),
      ),
    [offers],
  );

  const tabCounts = useMemo(() => {
    const c: Record<StatusTab, number> = { NEW: 0, REVIEWING: 0, ACCEPTED: 0, REJECTED: 0, WITHDRAWN: 0, ALL: 0 };
    for (const o of offers) {
      if (needle && !(offerWords.get(o.id) ?? "").includes(needle)) continue;
      c[o.status]++;
      c.ALL++;
    }
    return c;
  }, [offers, offerWords, needle]);

  const list = offers.filter((o) => (tab === "ALL" || o.status === tab) && (!needle || (offerWords.get(o.id) ?? "").includes(needle)));
  const accountList = accounts.filter(
    (a) => !needle || [a.name, a.email, a.mobile, a.companyName, a.wechatId, a.companyAddress].filter(Boolean).join(" ").toLowerCase().includes(needle),
  );

  const waiting = offers.filter((o) => o.status === "NEW").length;
  const stats = useMemo(
    () => [
      ["Applications", offers.length],
      ["Waiting", offers.filter((o) => o.status === "NEW").length],
      ["Accepted", offers.filter((o) => o.status === "ACCEPTED").length],
      ["Suppliers", accounts.length],
    ] as const,
    [offers, accounts],
  );

  const open = offers.find((o) => o.id === openId) ?? null;

  const saveOffer = async (id: string, change: { status?: OfferStatus; reply?: string }) => {
    const before = offers;
    setOffers((all) => all.map((o) => (o.id === id ? { ...o, ...change, reply: change.reply !== undefined ? change.reply || null : o.reply } : o)));
    setError(null);
    try {
      const res = await fetch(`/api/admin/supplier-offers/${id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 401 ? "Your admin session has ended. Sign in again." : data?.error ?? "That change did not save.");
      setOffers((all) => all.map((o) => (o.id === id ? { ...o, status: data.status, reply: data.reply, reviewedAt: data.reviewedAt, reviewedBy: data.reviewedBy } : o)));
      return true;
    } catch (e) {
      setOffers(before);
      setError(e instanceof Error ? e.message : "That change did not save. Try again.");
      return false;
    }
  };

  const setBlocked = async (account: BoardAccount, block: boolean) => {
    const verb = block ? "Block" : "Unblock";
    if (!window.confirm(`${verb} ${account.companyName ?? account.name} (${account.email})?${block ? " They are signed out at once and cannot sign in until unblocked." : ""}`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/supplier-accounts/${account.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: block ? "BLOCKED" : "ACTIVE" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "That change did not save.");
      setAccounts((all) => all.map((a) => (a.id === account.id ? { ...a, status: block ? "BLOCKED" : "ACTIVE" } : a)));
      setOffers((all) => all.map((o) => (o.supplierId === account.id ? { ...o, supplierBlocked: block } : o)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That change did not save. Try again.");
    }
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const headers = [
      "Sent", "Status", "Product", "Product ID", "Category", "MOQ", "Unit", "Product details", "Photos",
      "Contact name", "Company", "Mobile", "WeChat ID", "Company address", "Account email", "Reply", "Reviewed by", "Reviewed",
    ];
    const rows = list.map((o) => [
      fmtDate(o.createdAt), TEAM_STATUS_LABEL[o.status], o.productName, o.productId ?? "Their own product", o.categoryName ?? "", o.moq, o.moqUnit,
      o.details, o.photos.join("\n"), o.contactName, o.companyName, o.mobile, o.wechatId, o.companyAddress, o.supplierEmail,
      o.reply ?? "", o.reviewedBy ?? "", o.reviewedAt ? fmtDate(o.reviewedAt) : "",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    // Mobile numbers as text, or Excel shows 8613800138000 as 8.61E+12.
    for (let r = 1; r <= rows.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: headers.indexOf("Mobile") })];
      if (cell) {
        cell.t = "s";
        cell.z = "@";
        cell.v = String(cell.v ?? "");
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Supplier applications");
    const status = tab === "ALL" ? "" : `-${TEAM_STATUS_LABEL[tab].toLowerCase().replace(/\s+/g, "-")}`;
    XLSX.writeFile(wb, `supplier-applications-${new Date().toISOString().slice(0, 10)}${status}.xlsx`);
  };

  const refresh = () => {
    setRefreshing(true);
    router.refresh();
  };

  return (
    <div style={sfFont} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <div className="px-5 py-8 sm:px-8 lg:px-10">
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <Link
            href="/admin/"
            aria-label="Back to the dashboard"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06] transition-colors hover:bg-black/[0.02] rail:hidden"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-[min(100%,15rem)] flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">New Suppliers</h1>
            <p className="text-[13px] text-[#86868b]">
              Suppliers who registered on the supplier portal, and the products they applied to supply
              {waiting ? ` · ${waiting} waiting` : ""}
            </p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06] hover:bg-black/[0.02] disabled:cursor-wait"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin motion-reduce:animate-none" : ""} /> {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            {view === "applications" && (
              <button
                type="button"
                onClick={() => void exportExcel()}
                disabled={!list.length}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06] hover:bg-black/[0.02] disabled:opacity-50"
              >
                <Download size={14} /> Export
              </button>
            )}
          </div>
        </div>

        <dl className="mb-5 grid grid-cols-4 gap-2 sm:gap-3">
          {stats.map(([label, n]) => (
            <div key={label} className="min-w-0 rounded-2xl bg-white px-2.5 py-2 shadow-sm ring-1 ring-black/[0.06] sm:px-4 sm:py-3">
              <dt className="truncate text-[11px] text-[#86868b] sm:text-[12px]">{label}</dt>
              <dd className="mt-0.5 text-[19px] font-semibold tabular-nums tracking-tight sm:text-[24px]">{n}</dd>
            </div>
          ))}
        </dl>

        {capped && (
          <p className="mb-4 rounded-xl bg-amber-500/10 px-4 py-2.5 text-[13px] font-medium text-amber-800">
            Showing the newest 2,000. Older ones are in the database and in no list here yet.
          </p>
        )}
        {error && <p className="mb-4 rounded-xl bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-700">{error}</p>}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="What to show" className="flex rounded-full bg-white p-1 shadow-sm ring-1 ring-black/[0.06]">
            {(["applications", "accounts"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                type="button"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${view === v ? "bg-[#1d1d1f] text-white" : "hover:bg-black/[0.04]"}`}
              >
                {v === "applications" ? "Applications" : "Accounts"}{" "}
                <span className={view === v ? "text-white/70" : "text-[#86868b]"}>{v === "applications" ? offers.length : accounts.length}</span>
              </button>
            ))}
          </div>
          <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <span className="sr-only">Search</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={view === "applications" ? "Search product, company, WeChat, mobile…" : "Search company, name, email, WeChat…"}
              className="h-9 w-full rounded-full bg-white pl-9 pr-4 text-[13px] shadow-sm ring-1 ring-black/[0.06] outline-none focus:ring-2 focus:ring-[#0071e3]/40"
            />
          </label>
        </div>

        {view === "applications" ? (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {STATUS_TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  aria-pressed={tab === t}
                  className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-black/[0.06] transition-colors ${
                    tab === t ? "bg-[#1d1d1f] text-white" : "bg-white hover:bg-black/[0.03]"
                  }`}
                >
                  {t === "ALL" ? "All" : TEAM_STATUS_LABEL[t]} <span className={tab === t ? "text-white/70" : "text-[#86868b]"}>{tabCounts[t]}</span>
                </button>
              ))}
            </div>

            {list.length === 0 ? (
              <div className="rounded-2xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-black/[0.06]">
                <p className="text-[15px] font-medium">{needle ? "No applications match." : offers.length ? `No applications marked ${tab === "ALL" ? "" : TEAM_STATUS_LABEL[tab].toLowerCase()}.` : "No applications yet."}</p>
                {!offers.length && <p className="mt-1 text-[13px] text-[#86868b]">Applications from suppliers on /supplier/ arrive here.</p>}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.06]">
                <ul className="divide-y divide-black/[0.06]">
                  {list.map((o) => {
                    const picture = getCdnUrl(o.productImage, 120) ?? o.photos[0] ?? null;
                    return (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => setOpenId(o.id)}
                          className="flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-black/[0.02] lg:px-5"
                        >
                          <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#f5f5f7] ring-1 ring-black/[0.05]">
                            {picture ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={picture} alt="" className="h-full w-full object-cover" />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-semibold">{o.productName}</span>
                            <span className="block truncate text-[12.5px] text-[#86868b]">
                              {o.companyName} · {o.contactName}
                              {o.productId === null ? " · their own product" : ""}
                            </span>
                          </span>
                          <span className="hidden shrink-0 text-right text-[13px] sm:block">
                            <span className="block font-medium tabular-nums">MOQ {moqPhrase(o.moq, o.moqUnit)}</span>
                            <span className="block text-[12px] text-[#86868b]">
                              {shortDate(o.createdAt)}
                              {o.photos.length ? ` · ${o.photos.length} photo${o.photos.length === 1 ? "" : "s"}` : ""}
                            </span>
                          </span>
                          <span className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium ${statusPill[o.status]}`}>{TEAM_STATUS_LABEL[o.status]}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        ) : accountList.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-black/[0.06]">
            <p className="text-[15px] font-medium">{needle ? "No accounts match." : "No supplier has registered yet."}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.06]">
            <ul className="divide-y divide-black/[0.06]">
              {accountList.map((a) => (
                <li key={a.id} className="grid gap-2 px-4 py-3.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-4 lg:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{a.companyName ?? <span className="text-[#86868b]">No company yet</span>}</p>
                    <p className="truncate text-[12.5px] text-[#86868b]">
                      {a.name} · {a.email}
                    </p>
                  </div>
                  <div className="min-w-0 text-[13px]">
                    <p className="truncate">
                      {a.mobile}
                      {a.wechatId ? <span className="text-[#86868b]"> · WeChat {a.wechatId}</span> : null}
                    </p>
                    <p className="truncate text-[12px] text-[#86868b]">{a.companyAddress ?? "Address not given yet"}</p>
                  </div>
                  <div className="text-[12.5px] text-[#86868b]">
                    <p>
                      {a.offers} application{a.offers === 1 ? "" : "s"} · joined {shortDate(a.createdAt)}
                    </p>
                    <p>{a.lastLoginAt ? `Last signed in ${shortDate(a.lastLoginAt)}` : "Never signed in again"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status === "BLOCKED" && <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-[12px] font-medium text-red-700">Blocked</span>}
                    <button
                      type="button"
                      onClick={() => void setBlocked(a, a.status !== "BLOCKED")}
                      className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-black/[0.06] ${a.status === "BLOCKED" ? "bg-white hover:bg-black/[0.03]" : "text-red-600 hover:bg-red-500/10"}`}
                    >
                      {a.status === "BLOCKED" ? "Unblock" : "Block"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {open && (
        <Detail
          offer={open}
          account={accounts.find((a) => a.id === open.supplierId) ?? null}
          onClose={() => setOpenId(null)}
          onSave={(change) => saveOffer(open.id, change)}
        />
      )}
    </div>
  );
}

function Detail({
  offer: o,
  account,
  onClose,
  onSave,
}: {
  offer: BoardOffer;
  account: BoardAccount | null;
  onClose: () => void;
  onSave: (change: { status?: OfferStatus; reply?: string }) => Promise<boolean>;
}) {
  const [reply, setReply] = useState(o.reply ?? "");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedReply, setSavedReply] = useState(false);
  const withdrawn = o.status === "WITHDRAWN";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const status = async (s: OfferStatus) => {
    setBusy(true);
    await onSave({ status: s });
    setBusy(false);
  };
  const saveReply = async () => {
    setBusy(true);
    setSavedReply(await onSave({ reply }));
    setBusy(false);
  };
  const copyWechat = async () => {
    try {
      await navigator.clipboard.writeText(o.wechatId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard refused (an insecure context); the ID is on screen to copy by hand.
    }
  };

  const picture = getCdnUrl(o.productImage, 300);
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
        aria-labelledby="supplier-offer-title"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-[#f5f5f7] shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-black/[0.06] bg-[#f5f5f7]/95 px-6 py-4 backdrop-blur">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-[#86868b]">Sent {fmtDate(o.createdAt)}</p>
            <h2 id="supplier-offer-title" className="mt-0.5 line-clamp-2 text-xl font-semibold tracking-tight">{o.productName}</h2>
            <p className="truncate text-[13px] text-[#86868b]">
              {o.companyName} · {o.contactName}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/[0.06]">
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={() => void copyWechat()}
              className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#07c160] px-4 text-[13px] font-medium text-white sm:h-9"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "WeChat ID copied" : `WeChat ${o.wechatId}`}
            </button>
            <a href={`tel:${o.mobile}`} className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#1d1d1f] px-4 text-[13px] font-medium text-white sm:h-9">
              <Phone size={14} /> Call
            </a>
            <a
              href={`https://wa.me/${digits(o.mobile)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06] sm:h-9"
            >
              <MessageCircle size={14} /> WhatsApp
            </a>
            <a
              href={`mailto:${o.supplierEmail}?subject=${encodeURIComponent(`Your AFFHAN supplier application: ${o.productName.slice(0, 80)}`)}`}
              className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium shadow-sm ring-1 ring-black/[0.06] sm:h-9"
            >
              <Mail size={14} /> Email
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-[#86868b]">Status:</span>
            {withdrawn ? (
              <span className={`rounded-full px-3 py-1.5 font-medium ${statusPill.WITHDRAWN}`}>Withdrawn by the supplier</span>
            ) : (
              TEAM_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy || o.status === s}
                  onClick={() => void status(s)}
                  className={`rounded-full px-3 py-1.5 font-medium ring-1 ring-black/[0.06] ${o.status === s ? statusPill[s] : "bg-white hover:bg-black/[0.03]"} disabled:cursor-default`}
                >
                  {TEAM_STATUS_LABEL[s]}
                </button>
              ))
            )}
          </div>

          <section className="flex gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.06]">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#f5f5f7]">
              {picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={picture} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-[#86868b]">{o.productId === null ? "Their own product (not in the catalogue)" : o.categoryName ?? "Catalogue product"}</p>
              <p className="mt-0.5 text-[15px] font-semibold leading-snug">{o.productName}</p>
              <p className="mt-1.5 text-[14px]">
                MOQ <span className="font-semibold tabular-nums">{moqPhrase(o.moq, o.moqUnit)}</span>
              </p>
              {o.productId !== null && (
                <a href={`/products/${o.productId}/`} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-[#0058b0] hover:underline">
                  Open the product <ExternalLink size={13} />
                </a>
              )}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.06]">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#86868b]">Product details</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-relaxed">{o.details}</p>
            {o.photos.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {o.photos.map((p) => (
                  <a key={p} href={p} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-xl ring-1 ring-black/[0.06]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" className="h-full w-full object-cover transition-transform hover:scale-105" />
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.06]">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#86868b]">Reply to the supplier</h3>
            <p className="mt-1 text-[12.5px] text-[#86868b]">The supplier reads this beside the status, in My applications.</p>
            <textarea
              value={reply}
              onChange={(e) => {
                setSavedReply(false);
                setReply(e.target.value);
              }}
              maxLength={REPLY_MAX}
              rows={3}
              disabled={withdrawn}
              placeholder={withdrawn ? "The supplier withdrew this application." : "e.g. Please send a sample to our Guangzhou office."}
              className="mt-2.5 w-full resize-y rounded-xl bg-[#f5f5f7] px-3.5 py-2.5 text-[14px] outline-none ring-1 ring-black/[0.06] focus:bg-white focus:ring-2 focus:ring-[#0071e3]/40 disabled:opacity-60"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void saveReply()}
                disabled={busy || withdrawn || reply.trim() === (o.reply ?? "")}
                className="rounded-full bg-[#1d1d1f] px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
              >
                Save reply
              </button>
              {savedReply && (
                <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-emerald-700">
                  <Check size={14} /> Saved
                </span>
              )}
              {o.reviewedBy && o.reviewedAt && (
                <span className="ml-auto text-[12px] text-[#86868b]">
                  Last changed by {o.reviewedBy}, {fmtDate(o.reviewedAt)}
                </span>
              )}
            </div>
          </section>

          {section("Contact on this application", [
            ["Name", o.contactName],
            ["Company", o.companyName],
            ["Mobile", o.mobile],
            ["WeChat ID", o.wechatId],
            ["Company address", o.companyAddress],
          ])}
          {section("Supplier account", [
            ["Sign-in email", o.supplierEmail],
            ["Registered", account ? fmtDate(account.createdAt) : null],
            ["Applications", account ? String(account.offers) : null],
            ["Account", o.supplierBlocked ? "Blocked" : "Active"],
          ])}
        </div>
      </aside>
    </div>
  );
}
