"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, Ban, Building2, Check, CheckCircle2, CheckSquare, ChevronRight, Clock, Copy, Download, ExternalLink, Loader2,
  Mail, MapPin, MessageCircle, Moon, Package, Phone, RefreshCw, Search, SlidersHorizontal, Sun, Trash2, User, Users, X,
} from "lucide-react";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { useAdminDark } from "@/lib/useAdminDark";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { timeAgo } from "@/lib/relative-time";
import { getCdnUrl } from "@/lib/cdn";
import { SupplierContacts } from "@/components/admin/SupplierContacts";
import { REPLY_MAX, TEAM_STATUSES, TEAM_STATUS_LABEL, moqPhrase, type OfferStatus } from "@/lib/supplier-offer";

/**
 * New Suppliers (the admin rail, 2026-10-21): everyone who registered on the supplier portal, and every
 * product they applied to supply, kept as the owner asked, "everything stored", in the same shape as the WeChat
 * book beside it (Old Suppliers, SupplierDirectory): the same counters, search, chips and table, the same
 * WhatsApp and copy buttons, the same dark mode. One row is one supplier; their applications are listed in the
 * Products column with where each stands, and pressing one opens it to review: the status the supplier sees
 * (New, Reviewing, Accepted, Not selected), a reply they read beside it, the photos and every contact.
 *
 * Read on the server (the newest 2,000 of each) and filtered here, as the book is, so the search answers on
 * every keystroke. A supplier can be blocked: signed out at once, unable to sign in until unblocked; their
 * applications stay.
 *
 * Rows can be ticked, one by one or every one the search shows, as in the book (the owner, 2026-10-22): the
 * ticked ones can be exported, or deleted for good, account, applications and photos, after a window that
 * says exactly what goes. One application can be deleted from its own panel.
 */

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

type Lens = "all" | "waiting" | "accepted" | "none" | "blocked";
type SortKey = "newest" | "oldest" | "company" | "most";

const LENSES: { key: Lens; label: string; hint: string }[] = [
  { key: "all", label: "All", hint: "Every supplier who registered" },
  { key: "waiting", label: "Waiting", hint: "Has an application nobody has looked at yet" },
  { key: "accepted", label: "Accepted", hint: "Has an accepted application" },
  { key: "none", label: "No applications yet", hint: "Registered, and applied for nothing yet" },
  { key: "blocked", label: "Blocked", hint: "Cannot sign in" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "company", label: "Company A–Z" },
  { key: "most", label: "Most applications" },
];

const PAGE = 60;
/** Products shown in a row before "more". */
const SHOWN = 4;

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
/** "+86 138 0013 8000" for the eye; the E.164 underneath for tel: and wa.me. */
const spaced = (e164: string) => parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;

/** Whether a supplier's row belongs under a chip. */
const inLens = (r: Row, l: Lens) =>
  l === "all" ||
  (l === "waiting" && r.waiting > 0) ||
  (l === "accepted" && r.accepted > 0) ||
  (l === "none" && r.offers.length === 0) ||
  (l === "blocked" && r.account.status === "BLOCKED");

interface Row {
  account: BoardAccount;
  /** Registration order, 1 for the first supplier who registered. */
  serial: number;
  offers: BoardOffer[];
  words: string;
  waiting: number;
  accepted: number;
}

/** What the delete window is about to delete. */
type Pending = { kind: "suppliers"; ids: string[] } | { kind: "application"; id: string };

/** The book's checkbox (SupplierDirectory): a real one, with "some ticked" shown as the indeterminate state. */
function Tick({
  checked, indeterminate = false, onChange, label, dark,
}: {
  checked: boolean; indeterminate?: boolean; onChange: () => void; label: string; dark: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className={`h-4 w-4 shrink-0 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${dark ? "accent-white" : "accent-[#1d1d1f]"}`}
    />
  );
}

export function NewSuppliersBoard({
  offers: initialOffers,
  accounts: initialAccounts,
  capped,
}: {
  offers: BoardOffer[];
  accounts: BoardAccount[];
  capped: boolean;
}) {
  const router = useRouter();
  const [offers, setOffers] = useState(initialOffers);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [q, setQ] = useState("");
  const [lens, setLens] = useState<Lens>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  /** The supplier whose account panel is open (from their company name). */
  const [accountId, setAccountId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  /** Ticked suppliers, by account id; kept across searches and chips, as in the book. */
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dark, setDark] = useAdminDark();
  const searchRef = useRef<HTMLInputElement>(null);

  // Live, as the console's lists are (the owner, 2026-10-23: a supplier's application took too long to show here):
  // the page reads itself again every twenty seconds while it is on screen, and at once on coming back to the tab.
  // Each refresh hands new rows down: take them. An open panel keeps what is being typed in it.
  const { refresh, refreshing, updatedAt } = useLiveRefresh(20_000);
  useEffect(() => setOffers(initialOffers), [initialOffers]);
  useEffect(() => setAccounts(initialAccounts), [initialAccounts]);

  // /admin/new-suppliers/?offer=<id> opens that application: the inquiry panel's new suppliers link here. Once, on
  // arrival; the address is then put back as it was.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("offer");
    if (!wanted) return;
    if (initialOffers.some((o) => o.id === wanted)) setOpenId(wanted);
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "/" focuses the search, as in the book, unless something is being typed already.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const t = dark
    ? {
        page: "bg-[#0b0b0c] text-[#f2f2f4]", card: "bg-[#151517] ring-white/[0.08]",
        soft: "text-[#8a8a8e]", body2: "text-[#b5b5ba]",
        border: "border-white/[0.08]", divide: "divide-white/[0.06]",
        hover: "hover:bg-white/[0.03]", input: "bg-white/[0.05] text-white placeholder:text-[#8a8a8e]",
        pill: "bg-white/[0.06] text-[#e5e5e7] ring-white/[0.1] hover:bg-white/[0.1]",
        pillOn: "bg-white text-[#1d1d1f] ring-transparent", head: "bg-white/[0.03]",
        bar: "bg-[#151517]/90 border-white/10", sheet: "bg-[#0f0f11]", well: "bg-white/[0.04]", ink: "text-[#f2f2f4]",
      }
    : {
        page: "bg-[#f5f5f7] text-[#1d1d1f]", card: "bg-white ring-black/[0.04]",
        soft: "text-[#6e6e73]", body2: "text-[#4e4e53]",
        border: "border-black/[0.06]", divide: "divide-black/[0.06]",
        hover: "hover:bg-black/[0.015]", input: "bg-[#f5f5f7] text-[#1d1d1f] placeholder:text-[#86868b]",
        pill: "bg-white text-[#1d1d1f] ring-black/[0.06] hover:bg-black/[0.02]",
        pillOn: "bg-[#1d1d1f] text-white ring-transparent", head: "bg-black/[0.02]",
        bar: "bg-white/80 border-black/[0.06]", sheet: "bg-[#f5f5f7]", well: "bg-black/[0.03]", ink: "text-[#1d1d1f]",
      };
  const status: Record<OfferStatus, string> = dark
    ? {
        NEW: "bg-[#0a84ff]/15 text-[#64a8ff]",
        REVIEWING: "bg-amber-400/15 text-amber-300",
        ACCEPTED: "bg-emerald-400/15 text-emerald-300",
        REJECTED: "bg-white/[0.08] text-[#c7c7cc]",
        WITHDRAWN: "bg-white/[0.05] text-[#8a8a8e]",
      }
    : {
        NEW: "bg-[#0071e3]/10 text-[#0058b0]",
        REVIEWING: "bg-amber-500/15 text-amber-800",
        ACCEPTED: "bg-emerald-500/10 text-emerald-700",
        REJECTED: "bg-black/[0.06] text-[#48484a]",
        WITHDRAWN: "bg-black/[0.04] text-[#86868b]",
      };

  /** One row per supplier, their applications newest first, numbered in the order they registered. */
  const rows = useMemo<Row[]>(() => {
    const byAccount = new Map<string, BoardOffer[]>();
    for (const o of offers) {
      const list = byAccount.get(o.supplierId) ?? [];
      list.push(o);
      byAccount.set(o.supplierId, list);
    }
    const order = [...accounts].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return order.map((account, i) => {
      const own = (byAccount.get(account.id) ?? []).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      return {
        account,
        serial: i + 1,
        offers: own,
        waiting: own.filter((o) => o.status === "NEW").length,
        accepted: own.filter((o) => o.status === "ACCEPTED").length,
        words: [
          account.companyName, account.name, account.email, account.mobile, account.wechatId, account.companyAddress,
          ...own.flatMap((o) => [o.productName, o.categoryName, o.details, o.companyName, o.wechatId, o.mobile]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      };
    });
  }, [accounts, offers]);

  const needle = q.trim().toLowerCase();

  const searched = useMemo(() => (needle ? rows.filter((r) => r.words.includes(needle) || r.account.mobile.includes(needle.replace(/[\s()-]/g, ""))) : rows), [rows, needle]);
  const lensCounts = useMemo(() => {
    const c = { all: 0, waiting: 0, accepted: 0, none: 0, blocked: 0 } as Record<Lens, number>;
    for (const r of searched) for (const l of LENSES) if (inLens(r, l.key)) c[l.key]++;
    return c;
  }, [searched]);
  const results = useMemo(() => {
    const list = searched.filter((r) => inLens(r, lens));
    const name = (r: Row) => (r.account.companyName ?? r.account.name).toLowerCase();
    if (sort === "newest") list.sort((a, b) => b.serial - a.serial);
    else if (sort === "oldest") list.sort((a, b) => a.serial - b.serial);
    else if (sort === "company") list.sort((a, b) => name(a).localeCompare(name(b)));
    else list.sort((a, b) => b.offers.length - a.offers.length || b.serial - a.serial);
    return list;
  }, [searched, lens, sort]);
  const visible = results.slice(0, limit);
  const filtered = needle !== "" || lens !== "all";

  // Ticked suppliers that still exist, whether or not this search shows them (the book's rule: a selection
  // outlives a search, and the bar says how many it is not showing).
  const pickedRows = useMemo(() => rows.filter((r) => picked.has(r.account.id)), [rows, picked]);
  const resultIds = useMemo(() => new Set(results.map((r) => r.account.id)), [results]);
  const allMatchingPicked = results.length > 0 && results.every((r) => picked.has(r.account.id));
  const someMatchingPicked = !allMatchingPicked && results.some((r) => picked.has(r.account.id));
  const pickedOffscreen = pickedRows.filter((r) => !resultIds.has(r.account.id)).length;
  const togglePick = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllMatching = () =>
    setPicked((s) => {
      const next = new Set(s);
      for (const r of results) {
        if (allMatchingPicked) next.delete(r.account.id);
        else next.add(r.account.id);
      }
      return next;
    });

  // A done-delete's line, for a moment.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

  /** The delete the window asked about: null when done, or the sentence to show when it was not. */
  const runDelete = async (): Promise<string | null> => {
    if (!pending) return null;
    try {
      if (pending.kind === "suppliers") {
        const res = await fetch("/api/admin/supplier-accounts/delete/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: pending.ids }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return res.status === 401 ? "Your admin session has ended. Sign in again." : data?.error ?? "The suppliers were not deleted.";
        const gone = new Set<string>(Array.isArray(data.ids) ? data.ids : pending.ids);
        setAccounts((all) => all.filter((a) => !gone.has(a.id)));
        setOffers((all) => all.filter((o) => !gone.has(o.supplierId)));
        setPicked((s) => new Set([...s].filter((id) => !gone.has(id))));
        if (openId && offers.some((o) => o.id === openId && gone.has(o.supplierId))) setOpenId(null);
        if (accountId && gone.has(accountId)) setAccountId(null);
        setNotice(`Deleted ${plural(Number(data.deleted) || gone.size, "supplier")}${data.applications ? ` and ${plural(Number(data.applications), "application")}` : ""}.`);
      } else {
        const res = await fetch(`/api/admin/supplier-offers/${pending.id}/`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return res.status === 401 ? "Your admin session has ended. Sign in again." : data?.error ?? "The application was not deleted.";
        const gone = offers.find((o) => o.id === pending.id);
        setOffers((all) => all.filter((o) => o.id !== pending.id));
        if (gone) setAccounts((all) => all.map((a) => (a.id === gone.supplierId ? { ...a, offers: Math.max(0, a.offers - 1) } : a)));
        setOpenId(null);
        setNotice(`Deleted the application${gone ? ` for ${gone.productName.slice(0, 80)}` : ""}.`);
      }
      setPending(null);
      router.refresh();
      return null;
    } catch {
      return "Network error: nothing was deleted. Try again.";
    }
  };

  /** What the delete window says about what it is about to delete. */
  const pendingView = (() => {
    if (!pending) return null;
    if (pending.kind === "suppliers") {
      const chosen = rows.filter((r) => pending.ids.includes(r.account.id));
      const apps = chosen.reduce((n, r) => n + r.offers.length, 0);
      const photos = chosen.reduce((n, r) => n + r.offers.reduce((m, o) => m + o.photos.length, 0), 0);
      const names = chosen.slice(0, 5).map((r) => `${r.account.companyName ?? r.account.name} · ${r.account.email}`);
      if (chosen.length > 5) names.push(`and ${plural(chosen.length - 5, "more", "more")}`);
      // Only what there is: "The account is deleted", "The account, 2 applications and 1 photo are deleted".
      const parts = [chosen.length === 1 ? "The account" : "Their accounts", apps ? plural(apps, "application") : "", photos ? plural(photos, "photo") : ""].filter(Boolean);
      const what = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
      return {
        title: `Delete ${plural(chosen.length, "supplier")}?`,
        lines: [
          `${what} ${parts.length > 1 || chosen.length > 1 ? "are" : "is"} deleted for good. This cannot be undone.`,
          `${chosen.length === 1 ? "They are" : "Each is"} signed out at once, and can register again with the same email.`,
        ],
        names,
      };
    }
    const o = offers.find((x) => x.id === pending.id);
    return {
      title: "Delete this application?",
      lines: [
        `${o ? `${o.productName} from ${o.companyName}` : "The application"}${o?.photos.length ? `, with ${plural(o.photos.length, "photo")},` : ""} is deleted for good. This cannot be undone.`,
        "The supplier's account and their other applications stay.",
      ],
      names: [],
    };
  })();

  const counters = [
    { label: "Suppliers", value: accounts.length, Icon: Users, tint: "text-sky-500" },
    { label: "Applications", value: offers.length, Icon: Package, tint: "text-violet-500" },
    { label: "Waiting", value: offers.filter((o) => o.status === "NEW").length, Icon: Clock, tint: "text-amber-500" },
    { label: "Accepted", value: offers.filter((o) => o.status === "ACCEPTED").length, Icon: CheckCircle2, tint: "text-emerald-500" },
  ] as const;

  const open = offers.find((o) => o.id === openId) ?? null;
  const openAccount = accounts.find((a) => a.id === accountId) ?? null;

  const saveOffer = async (id: string, change: { status?: OfferStatus; reply?: string }) => {
    const before = offers;
    setOffers((all) => all.map((o) => (o.id === id ? { ...o, ...change, reply: change.reply !== undefined ? change.reply.trim() || null : o.reply } : o)));
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
      router.refresh();
      return true;
    } catch (e) {
      setOffers(before);
      setError(e instanceof Error ? e.message : "That change did not save. Try again.");
      return false;
    }
  };

  const setBlocked = async (account: BoardAccount, block: boolean) => {
    const who = `${account.companyName ?? account.name} (${account.email})`;
    if (!window.confirm(block ? `Block ${who}? They are signed out at once and cannot sign in until unblocked.` : `Unblock ${who}?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/supplier-accounts/${account.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: block ? "BLOCKED" : "ACTIVE" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 401 ? "Your admin session has ended. Sign in again." : data?.error ?? "That change did not save.");
      setAccounts((all) => all.map((a) => (a.id === account.id ? { ...a, status: block ? "BLOCKED" : "ACTIVE" } : a)));
      setOffers((all) => all.map((o) => (o.supplierId === account.id ? { ...o, supplierBlocked: block } : o)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That change did not save. Try again.");
    }
  };

  /** Two sheets: the suppliers shown, one a row; and their applications, one a row. Numbers as text for Excel. */
  const exportRows = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const asText = (ws: import("xlsx").WorkSheet, headers: string[], column: string, count: number) => {
        const c = headers.indexOf(column);
        for (let r = 1; r <= count; r++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell) {
            cell.t = "s";
            cell.z = "@";
            cell.v = String(cell.v ?? "");
          }
        }
      };
      const sHead = ["S.No", "Company", "Name", "Email", "Mobile", "WeChat ID", "Company address", "Registered", "Last signed in", "Account", "Applications", "Products applied for"];
      // The ticked suppliers when there are any, as the book exports; otherwise the list as it stands.
      const list = pickedRows.length ? pickedRows : results;
      const sRows = list.map((r) => [
        r.serial, r.account.companyName ?? "", r.account.name, r.account.email, r.account.mobile, r.account.wechatId ?? "", r.account.companyAddress ?? "",
        stamp(r.account.createdAt), r.account.lastLoginAt ? stamp(r.account.lastLoginAt) : "", r.account.status === "BLOCKED" ? "Blocked" : "Active",
        r.offers.length, r.offers.map((o) => `${o.productName} (MOQ ${moqPhrase(o.moq, o.moqUnit)}, ${TEAM_STATUS_LABEL[o.status]})`).join("\n"),
      ]);
      const aHead = ["Sent", "Status", "Product", "Product ID", "Category", "MOQ", "Unit", "Product details", "Photos", "Contact name", "Company", "Mobile", "WeChat ID", "Company address", "Account email", "Reply", "Reviewed by", "Reviewed"];
      const aRows = list.flatMap((r) =>
        r.offers.map((o) => [
          stamp(o.createdAt), TEAM_STATUS_LABEL[o.status], o.productName, o.productId ?? "Their own product", o.categoryName ?? "", o.moq, o.moqUnit,
          o.details, o.photos.join("\n"), o.contactName, o.companyName, o.mobile, o.wechatId, o.companyAddress, o.supplierEmail,
          o.reply ?? "", o.reviewedBy ?? "", o.reviewedAt ? stamp(o.reviewedAt) : "",
        ]),
      );
      const suppliers = XLSX.utils.aoa_to_sheet([sHead, ...sRows]);
      asText(suppliers, sHead, "Mobile", sRows.length);
      const applications = XLSX.utils.aoa_to_sheet([aHead, ...aRows]);
      asText(applications, aHead, "Mobile", aRows.length);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, suppliers, "New suppliers");
      XLSX.utils.book_append_sheet(book, applications, "Applications");
      const tag = pickedRows.length ? "-selected" : filtered ? "-filtered" : "";
      XLSX.writeFile(book, `affhan-new-suppliers-${new Date().toISOString().slice(0, 10)}${tag}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? `Export failed: ${e.message}` : "Export failed.");
    } finally {
      setExporting(false);
    }
  }, [results, pickedRows, exporting, filtered]);

  const phoneOf = (e164: string) => [{ value: spaced(e164), label: null, tags: [], e164, assumed: false, incomplete: false }];
  const wechatOf = (id: string | null) => (id ? [{ value: id, label: "WeChat ID", tags: [] }] : []);

  // The row reads as the book's does (the owner, 2026-10-23: the old row was the one to match): the supplier, what
  // they supply, how to reach them, where they are. Everything else about the account (when they joined, Block,
  // Delete) is one press away, on their name.
  const productsCell = (r: Row, big = false) => {
    if (!r.offers.length) return <span className={`text-[12px] ${t.soft}`}>No applications yet</span>;
    const all = expanded.has(r.account.id);
    const shown = all ? r.offers : r.offers.slice(0, SHOWN);
    return (
      // One line an application, the product in the book's plain text and where it stands at the line's end, so the
      // statuses make one column down the cell. The MOQ, photos and the day it came are on hover and in the application.
      <ul className="space-y-1">
        {shown.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => setOpenId(o.id)}
              title={[
                o.productName,
                `MOQ ${moqPhrase(o.moq, o.moqUnit)}`,
                o.photos.length ? plural(o.photos.length, "photo") : "",
                o.productId === null ? "their own product" : "",
                `sent ${day(o.createdAt)}`,
              ].filter(Boolean).join(" · ")}
              className="group flex w-full min-w-0 cursor-pointer items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className={`min-w-0 flex-1 truncate leading-snug underline-offset-2 group-hover:underline ${big ? "text-[13px]" : "text-[12.5px]"}`}>
                {o.productName}
              </span>
              <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold ${status[o.status]}`}>{TEAM_STATUS_LABEL[o.status]}</span>
            </button>
          </li>
        ))}
        {r.offers.length > SHOWN && (
          <li>
            <button
              type="button"
              onClick={() =>
                setExpanded((s) => {
                  const next = new Set(s);
                  if (all) next.delete(r.account.id);
                  else next.add(r.account.id);
                  return next;
                })
              }
              className={`text-[12px] font-semibold underline-offset-2 hover:underline ${t.body2}`}
            >
              {all ? "Show fewer" : `${r.offers.length - SHOWN} more`}
            </button>
          </li>
        )}
      </ul>
    );
  };

  // The book's Supplier cell: the company (the person until a first application gives one), opening the supplier as
  // the book's opens its page; the person under it, then the email they sign in with (the book has none, so it is
  // here rather than a third line in Contact, which keeps the rows the book's height); a flag only when there is
  // something to know.
  const supplierCell = (r: Row, big = false) => {
    const Mark = r.account.companyName ? Building2 : User;
    return (
      <>
        <span className="flex items-start gap-1.5">
          <Mark size={big ? 13 : 12} aria-hidden="true" className={`mt-[3.5px] shrink-0 ${t.soft}`} />
          <button
            type="button"
            onClick={() => setAccountId(r.account.id)}
            title={`Registered ${day(r.account.createdAt)}${r.account.lastLoginAt ? ` · last signed in ${day(r.account.lastLoginAt)}` : ""}`}
            className={`cursor-pointer rounded text-left font-semibold leading-snug tracking-tight underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${big ? "text-[14px]" : "text-[13px]"}`}
          >
            <span className="sr-only">{r.account.companyName ? "Company: " : "Contact person: "}</span>
            {r.account.companyName ?? r.account.name}
          </button>
        </span>
        {r.account.companyName && (
          <span className="mt-1 flex items-center gap-1.5">
            <User size={big ? 13 : 12} aria-hidden="true" className={`shrink-0 ${t.soft}`} />
            <span className={`text-[12px] ${t.body2}`}>
              <span className="sr-only">Contact person: </span>
              {r.account.name}
            </span>
          </span>
        )}
        <span className="mt-1 flex min-w-0 items-center gap-1.5">
          <Mail size={big ? 13 : 12} aria-hidden="true" className={`shrink-0 ${t.soft}`} />
          <a
            href={`mailto:${r.account.email}`}
            title={r.account.email}
            className={`min-w-0 truncate rounded text-[12px] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.body2}`}
          >
            <span className="sr-only">Email: </span>
            {r.account.email}
          </a>
        </span>
        {r.account.status === "BLOCKED" && (
          <span className="mt-1 inline-flex rounded-full bg-red-500/10 px-1.5 py-px text-[10px] font-bold text-red-600">Blocked</span>
        )}
      </>
    );
  };

  // The book's Contact cell: the number with WhatsApp and Copy, the WeChat ID with Copy.
  const contactCell = (r: Row) => (
    <SupplierContacts phones={phoneOf(r.account.mobile)} handles={wechatOf(r.account.wechatId)} webs={[]} raw="" dark={dark} />
  );

  return (
    <div className={`min-h-screen ${t.page}`} style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif' }}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${t.bar}`}>
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <Link
            href="/admin/"
            className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rail:hidden ${t.pill}`}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg rail:hidden">
            <Image src="/logo.png" alt="" width={22} height={22} className="object-contain" />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-[15px] font-semibold tracking-tight">New Suppliers</h1>
            <p className={`text-[11px] ${t.soft}`}>{accounts.length.toLocaleString("en-US")} registered on the supplier portal</p>
          </div>
          {/* How fresh the board is: it refreshes itself (above), and the button is for "now". */}
          <span className={`ml-auto hidden text-[12px] sm:inline ${t.soft}`} aria-live="polite">
            {refreshing ? "Updating…" : `Updated ${timeAgo(new Date(updatedAt))}`}
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className={`ml-auto inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-wait sm:ml-0 ${t.pill}`}
          >
            <RefreshCw size={15} aria-hidden="true" className={refreshing ? "animate-spin motion-reduce:animate-none" : ""} />
            <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            aria-pressed={dark}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pill}`}
          >
            {dark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
            <span className="hidden sm:inline">{dark ? "Light" : "Dark"}</span>
          </button>
        </div>
      </header>

      <div className="px-4 py-6 sm:px-6 lg:px-10">
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {counters.map(({ label, value, Icon, tint }) => (
            <div key={label} className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 ring-1 ${t.card}`}>
              <Icon size={18} className={tint} aria-hidden="true" />
              <div className="min-w-0 leading-tight">
                <p className="text-[19px] font-semibold tracking-tight tabular-nums">{value.toLocaleString("en-US")}</p>
                <p className={`truncate text-[11.5px] ${t.soft}`}>{label}</p>
              </div>
            </div>
          ))}
        </div>

        {capped && (
          <p className="mb-4 rounded-xl bg-amber-500/10 px-4 py-2.5 text-[13px] font-medium text-amber-700">
            Showing the newest 2,000 suppliers and applications. Older ones are in the database.
          </p>
        )}

        <div className={`rounded-2xl p-3.5 ring-1 ${t.card}`}>
          <form role="search" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="new-supplier-search" className="sr-only">
              Search new suppliers by company, name, product, number, WeChat ID, email or address
            </label>
            <div className="relative">
              <Search size={17} aria-hidden="true" className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 ${t.soft}`} />
              <input
                id="new-supplier-search"
                ref={searchRef}
                type="search"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setLimit(PAGE);
                }}
                autoComplete="off"
                placeholder="Search company, name, product, number, WeChat ID, email or address…"
                className={`h-12 w-full rounded-xl border-0 pl-11 pr-24 text-[14px] outline-none ring-1 ring-transparent transition-shadow focus:ring-2 focus:ring-brand [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden ${t.input}`}
              />
              <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
                {q && (
                  <button
                    type="button"
                    onClick={() => {
                      setQ("");
                      searchRef.current?.focus();
                    }}
                    aria-label="Clear search"
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${t.soft} ${t.hover}`}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
                <kbd className={`hidden rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 sm:inline ${t.pill}`}>/</kbd>
              </span>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {LENSES.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => {
                  setLens(l.key);
                  setLimit(PAGE);
                }}
                aria-pressed={lens === l.key}
                title={l.hint}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${lens === l.key ? t.pillOn : t.pill}`}
              >
                {l.label}
                <span className={`ml-1.5 tabular-nums ${lens === l.key ? "opacity-70" : t.soft}`}>{lensCounts[l.key].toLocaleString("en-US")}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SlidersHorizontal size={15} aria-hidden="true" className={t.soft} />
            <label htmlFor="new-supplier-sort" className="sr-only">Sort suppliers</label>
            <select
              id="new-supplier-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className={`h-9 rounded-xl border-0 px-3 text-[12.5px] font-semibold outline-none ring-1 transition-shadow focus:ring-2 focus:ring-brand ${t.pill}`}
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setLens("all");
                }}
                className={`h-9 rounded-xl px-3 text-[12.5px] font-semibold ring-1 transition-colors ${t.pill}`}
              >
                Reset
              </button>
            )}
            <button
              type="button"
              onClick={() => void exportRows()}
              disabled={exporting || !results.length}
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl bg-[#1d1d1f] px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {exporting ? <Loader2 size={14} aria-hidden="true" className="animate-spin" /> : <Download size={14} aria-hidden="true" />}
              {exporting
                ? "Building Excel file…"
                : pickedRows.length
                  ? `Export ${pickedRows.length.toLocaleString("en-US")} selected`
                  : `Export ${filtered ? `these ${results.length.toLocaleString("en-US")}` : "all"}`}
            </button>
          </div>
        </div>

        {/* The selection, as the book shows it, with what can be done to it: export (the button above) or delete. */}
        {pickedRows.length > 0 && (
          <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-4 py-3 ring-1 ${t.card}`}>
            <CheckSquare size={16} aria-hidden="true" className="shrink-0 text-brand" />
            <p className="text-[13px] font-semibold">
              {pickedRows.length.toLocaleString("en-US")} selected
              {pickedOffscreen > 0 && (
                <span className={`ml-1.5 font-normal ${t.soft}`}>({pickedOffscreen.toLocaleString("en-US")} not in this list)</span>
              )}
            </p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPending({ kind: "suppliers", ids: pickedRows.map((r) => r.account.id) })}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <Trash2 size={13} aria-hidden="true" /> Delete {pickedRows.length.toLocaleString("en-US")}
              </button>
              <button
                type="button"
                onClick={() => setPicked(new Set())}
                className={`rounded-xl px-3 py-1.5 text-[12px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pill}`}
              >
                Clear selection
              </button>
            </div>
          </div>
        )}

        {error && <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-600">{error}</p>}
        {notice && (
          <p role="status" className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-[13px] font-medium text-emerald-600">
            <Check size={15} aria-hidden="true" /> {notice}
          </p>
        )}

        <p aria-live="polite" className={`px-1 py-3 text-[12.5px] ${t.soft}`}>
          {results.length === 0
            ? accounts.length
              ? "No suppliers match."
              : "No supplier has registered yet."
            : `Showing ${visible.length.toLocaleString("en-US")} of ${results.length.toLocaleString("en-US")}${filtered ? ` matching (${accounts.length.toLocaleString("en-US")} in total)` : ""}`}
        </p>

        {results.length === 0 ? (
          <div className={`rounded-2xl px-6 py-16 text-center ring-1 ${t.card}`}>
            {accounts.length && needle ? (
              <>
                <p className="text-[14px] font-semibold">Nothing matched that.</p>
                <p className={`mt-1 text-[13px] ${t.soft}`}>Try part of a company name, a product, or any run of digits from a number.</p>
              </>
            ) : accounts.length ? (
              <>
                <p className="text-[14px] font-semibold">No suppliers under {LENSES.find((l) => l.key === lens)?.label ?? "this"} right now.</p>
                <button
                  type="button"
                  onClick={() => setLens("all")}
                  className={`mt-3 rounded-xl px-4 py-2 text-[13px] font-semibold ring-1 transition-colors ${t.pill}`}
                >
                  Show all {accounts.length.toLocaleString("en-US")}
                </button>
              </>
            ) : (
              <>
                <p className="text-[14px] font-semibold">No supplier has registered yet.</p>
                <p className={`mt-1 text-[13px] ${t.soft}`}>
                  Suppliers register at /supplier/register/ (the footer&apos;s Supplier Login), and everything they apply for arrives here.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className={`hidden overflow-hidden rounded-2xl ring-1 lg:block ${t.card}`}>
              <table className="w-full table-fixed border-collapse text-left">
                <caption className="sr-only">New suppliers, showing {visible.length} of {results.length}</caption>
                <colgroup>
                  <col className="w-[44px]" />
                  <col className="w-[54px]" />
                  <col className="w-[23%]" />
                  <col className="w-[30%]" />
                  <col className="w-[24%]" />
                  <col />
                </colgroup>
                <thead className={`${t.head} border-b ${t.border}`}>
                  <tr className={`text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>
                    <th scope="col" className="py-2.5 pl-4 pr-1">
                      <Tick
                        checked={allMatchingPicked}
                        indeterminate={someMatchingPicked}
                        onChange={toggleAllMatching}
                        label={allMatchingPicked ? `Clear all ${results.length} suppliers shown` : `Select all ${results.length} suppliers shown`}
                        dark={dark}
                      />
                    </th>
                    <th scope="col" className="px-2 py-2.5">S.No</th>
                    <th scope="col" className="px-3 py-2.5">Supplier</th>
                    <th scope="col" className="px-3 py-2.5">Products</th>
                    <th scope="col" className="px-3 py-2.5">Contact</th>
                    <th scope="col" className="px-3 py-2.5">Address</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${t.divide}`}>
                  {visible.map((r) => (
                    <tr key={r.account.id} className={`align-top transition-colors ${picked.has(r.account.id) ? "bg-brand/[0.06]" : t.hover}`}>
                      <td className="py-3.5 pl-4 pr-1">
                        <Tick
                          checked={picked.has(r.account.id)}
                          onChange={() => togglePick(r.account.id)}
                          label={`Select ${r.account.companyName ?? r.account.name}`}
                          dark={dark}
                        />
                      </td>
                      <td className={`px-2 py-3.5 text-[12px] tabular-nums ${t.soft}`}>{r.serial}</td>
                      <td className="px-3 py-3.5">{supplierCell(r)}</td>
                      <td className="px-3 py-3.5">{productsCell(r)}</td>
                      <td className="px-3 py-3.5">{contactCell(r)}</td>
                      <td className={`px-3 py-3.5 text-[12.5px] leading-relaxed ${r.account.companyAddress ? t.body2 : t.soft}`}>
                        {r.account.companyAddress || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {visible.map((r) => (
                <li key={r.account.id} className={`rounded-2xl p-4 ring-1 ${t.card} ${picked.has(r.account.id) ? "ring-brand/40" : ""}`}>
                  <div className="flex items-start gap-3">
                    <span className="pt-0.5">
                      <Tick
                        checked={picked.has(r.account.id)}
                        onChange={() => togglePick(r.account.id)}
                        label={`Select ${r.account.companyName ?? r.account.name}`}
                        dark={dark}
                      />
                    </span>
                    <div className="min-w-0 flex-1">{supplierCell(r, true)}</div>
                    <span className={`shrink-0 text-[11px] tabular-nums ${t.soft}`}>#{r.serial}</span>
                  </div>
                  <div className="mt-2.5">{productsCell(r, true)}</div>
                  <div className={`mt-3 border-t pt-3 ${t.border}`}>{contactCell(r)}</div>
                  {r.account.companyAddress && (
                    <p className={`mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed ${t.body2}`}>
                      <MapPin size={13} aria-hidden="true" className={`mt-0.5 shrink-0 ${t.soft}`} />
                      {r.account.companyAddress}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setAccountId(r.account.id)}
                    className="mt-3 inline-flex cursor-pointer items-center gap-1 rounded text-[12px] font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    Open supplier <ChevronRight size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>

            {visible.length < results.length && (
              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => setLimit((n) => n + PAGE * 2)}
                  className={`rounded-xl px-5 py-2.5 text-[13px] font-semibold ring-1 transition-colors ${t.pill}`}
                >
                  Show {Math.min(PAGE * 2, results.length - visible.length).toLocaleString("en-US")} more
                  <span className={`ml-1.5 ${t.soft}`}>({(results.length - visible.length).toLocaleString("en-US")} left)</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* The supplier under an application opened from it: closing the application comes back to them. */}
      {openAccount && (
        <AccountPanel
          key={openAccount.id}
          account={openAccount}
          offers={rows.find((r) => r.account.id === openAccount.id)?.offers ?? []}
          t={t}
          pill={status}
          covered={open !== null}
          onClose={() => setAccountId(null)}
          onOpenOffer={setOpenId}
          onBlock={(block) => void setBlocked(openAccount, block)}
          onDelete={() => setPending({ kind: "suppliers", ids: [openAccount.id] })}
        />
      )}

      {open && (
        <Review
          key={open.id}
          offer={open}
          account={accounts.find((a) => a.id === open.supplierId) ?? null}
          t={t}
          pill={status}
          onClose={() => setOpenId(null)}
          onSave={(change) => saveOffer(open.id, change)}
          onDelete={() => setPending({ kind: "application", id: open.id })}
          onOpenSupplier={() => {
            setOpenId(null);
            setAccountId(open.supplierId);
          }}
        />
      )}

      {pending && pendingView && (
        <ConfirmDelete
          title={pendingView.title}
          lines={pendingView.lines}
          names={pendingView.names}
          t={t}
          onCancel={() => setPending(null)}
          onConfirm={runDelete}
        />
      )}
    </div>
  );
}

type Theme = { [K in "page" | "card" | "soft" | "body2" | "border" | "divide" | "hover" | "pill" | "pillOn" | "sheet" | "well" | "input" | "ink"]: string };

/**
 * The window before a delete: what goes, in words and by name, and that it cannot be undone. Cancel has the
 * focus, so Enter does not delete by accident; Escape cancels. If the delete fails, it says why and stays.
 */
function ConfirmDelete({
  title,
  lines,
  names,
  t,
  onCancel,
  onConfirm,
}: {
  title: string;
  lines: string[];
  names: string[];
  t: Theme;
  onCancel: () => void;
  /** Resolves to null when done, or to the sentence to show when not. */
  onConfirm: () => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancel.current?.focus();
  }, []);
  // Escape answers this window only: caught on the way down, so the review panel under it stays open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (!busy) onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, busy]);

  const go = async () => {
    setBusy(true);
    setProblem(null);
    const answer = await onConfirm();
    if (answer) {
      setProblem(answer);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 px-4" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        aria-describedby="delete-body"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-2xl p-6 shadow-2xl ring-1 ${t.card} ${t.ink}`}
      >
        <div className="flex items-start gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600">
            <AlertTriangle size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="delete-title" className="text-[16px] font-semibold tracking-tight">
              {title}
            </h2>
            <div id="delete-body" className={`mt-1.5 space-y-1.5 text-[13.5px] leading-relaxed ${t.body2}`}>
              {lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            {names.length > 0 && (
              <ul className={`mt-3 space-y-1 rounded-xl px-3 py-2.5 text-[12.5px] font-medium ${t.well}`}>
                {names.map((name) => (
                  <li key={name} className="truncate">
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {problem && (
          <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-[13px] font-medium text-red-600">
            {problem}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancel}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className={`rounded-xl px-4 py-2 text-[13px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 ${t.pill}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void go()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} aria-hidden="true" className="animate-spin" /> : <Trash2 size={14} aria-hidden="true" />}
            {busy ? "Deleting…" : "Delete for good"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One application, opened from the Products column: the decision, the reply, the product and every contact. */
function Review({
  offer: o,
  account,
  t,
  pill,
  onClose,
  onSave,
  onDelete,
  onOpenSupplier,
}: {
  offer: BoardOffer;
  account: BoardAccount | null;
  t: Theme;
  pill: Record<OfferStatus, string>;
  onClose: () => void;
  onSave: (change: { status?: OfferStatus; reply?: string }) => Promise<boolean>;
  /** Asks the board's delete window about this application. */
  onDelete: () => void;
  /** Closes this and opens the supplier: their account and everything they applied for. */
  onOpenSupplier: () => void;
}) {
  const [reply, setReply] = useState(o.reply ?? "");
  const [busy, setBusy] = useState(false);
  const [savedReply, setSavedReply] = useState(false);
  const [copied, setCopied] = useState(false);
  const withdrawn = o.status === "WITHDRAWN";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const decide = async (s: OfferStatus) => {
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
      // The clipboard refused (an insecure origin): the ID is on screen to copy by hand.
    }
  };

  const picture = getCdnUrl(o.productImage, 300);
  const button = `inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold ring-1 sm:h-9 ${t.pill}`;
  const section = (title: string, children: React.ReactNode) => <Section title={title} t={t}>{children}</Section>;
  const facts = (rows: Array<[string, React.ReactNode]>) => <Facts rows={rows} t={t} />;

  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-black/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-offer-title"
        onClick={(e) => e.stopPropagation()}
        className={`flex h-full w-full max-w-2xl flex-col overflow-y-auto shadow-2xl ${t.sheet} ${t.ink}`}
      >
        <div className={`sticky top-0 z-10 flex items-start gap-3 border-b px-6 py-4 backdrop-blur ${t.border} ${t.sheet}`}>
          <div className="min-w-0 flex-1">
            <p className={`text-[12px] ${t.soft}`}>Sent {stamp(o.createdAt)}</p>
            <h2 id="supplier-offer-title" className="mt-0.5 line-clamp-2 text-xl font-semibold tracking-tight">
              {o.productName}
            </h2>
            <p className={`truncate text-[13px] ${t.soft}`}>
              {o.companyName} · {o.contactName}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={`flex h-9 w-9 items-center justify-center rounded-full ring-1 ${t.pill}`}>
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={() => void copyWechat()}
              className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#07c160] px-4 text-[13px] font-semibold text-white sm:h-9"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "WeChat ID copied" : `WeChat ${o.wechatId}`}
            </button>
            <a href={`tel:${o.mobile}`} className={button}>
              <Phone size={14} /> Call
            </a>
            <a href={`https://wa.me/${o.mobile.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className={button}>
              <MessageCircle size={14} /> WhatsApp
            </a>
            <a
              href={`mailto:${o.supplierEmail}?subject=${encodeURIComponent(`Your AFFHAN supplier application: ${o.productName.slice(0, 80)}`)}`}
              className={`col-span-2 ${button}`}
            >
              <Mail size={14} /> Email
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className={t.soft}>Status:</span>
            {withdrawn ? (
              <span className={`rounded-full px-3 py-1.5 font-semibold ${pill.WITHDRAWN}`}>Withdrawn by the supplier</span>
            ) : (
              TEAM_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy || o.status === s}
                  onClick={() => void decide(s)}
                  aria-pressed={o.status === s}
                  className={`rounded-full px-3 py-1.5 font-semibold ring-1 disabled:cursor-default ${o.status === s ? `${pill[s]} ring-transparent` : t.pill}`}
                >
                  {TEAM_STATUS_LABEL[s]}
                </button>
              ))
            )}
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold text-red-600 hover:bg-red-500/10 disabled:opacity-50"
            >
              <Trash2 size={14} aria-hidden="true" /> Delete application
            </button>
          </div>

          <section className={`flex gap-4 rounded-2xl p-5 ring-1 ${t.card}`}>
            <div className={`h-24 w-24 shrink-0 overflow-hidden rounded-xl ${t.well}`}>
              {picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={picture} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-[12px] ${t.soft}`}>{o.productId === null ? "Their own product (not in the catalogue)" : o.categoryName ?? "Catalogue product"}</p>
              <p className="mt-0.5 text-[15px] font-semibold leading-snug">{o.productName}</p>
              <p className="mt-1.5 text-[14px]">
                MOQ <span className="font-semibold tabular-nums">{moqPhrase(o.moq, o.moqUnit)}</span>
              </p>
              {o.productId !== null && (
                <a href={`/products/${o.productId}/`} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-dark hover:underline">
                  Open the product <ExternalLink size={13} />
                </a>
              )}
            </div>
          </section>

          {section(
            "Product details",
            <>
              <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{o.details}</p>
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
            </>,
          )}

          {section(
            "Reply to the supplier",
            <>
              <p className={`text-[12.5px] ${t.soft}`}>The supplier reads this beside the status, in My applications.</p>
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
                className={`mt-2.5 w-full resize-y rounded-xl px-3.5 py-2.5 text-[14px] outline-none ring-1 ring-transparent focus:ring-2 focus:ring-brand disabled:opacity-60 ${t.input}`}
              />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void saveReply()}
                  disabled={busy || withdrawn || reply.trim() === (o.reply ?? "")}
                  className="rounded-full bg-[#1d1d1f] px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  Save reply
                </button>
                {savedReply && (
                  <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-emerald-600">
                    <Check size={14} /> Saved
                  </span>
                )}
                {o.reviewedBy && o.reviewedAt && (
                  <span className={`ml-auto text-[12px] ${t.soft}`}>
                    Last changed by {o.reviewedBy}, {stamp(o.reviewedAt)}
                  </span>
                )}
              </div>
            </>,
          )}

          {section(
            "Contact on this application",
            facts([
              ["Name", o.contactName],
              ["Company", o.companyName],
              ["Mobile", spaced(o.mobile)],
              ["WeChat ID", o.wechatId],
              ["Company address", o.companyAddress],
            ]),
          )}
          {section(
            "Supplier account",
            <>
              {facts([
                ["Sign-in email", o.supplierEmail],
                ["Registered", account ? stamp(account.createdAt) : null],
                ["Applications", account ? String(account.offers) : null],
                ["Account", o.supplierBlocked ? "Blocked" : "Active"],
              ])}
              {account && (
                <button
                  type="button"
                  onClick={onOpenSupplier}
                  className="mt-4 inline-flex cursor-pointer items-center gap-1 rounded text-[13px] font-semibold text-brand-dark underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Open the supplier <ChevronRight size={14} aria-hidden="true" />
                </button>
              )}
            </>,
          )}
        </div>
      </aside>
    </div>
  );
}

/**
 * One supplier, opened from their name in the row, as the book opens a supplier's page: how to reach them, every
 * application they sent and where each stands, and the account: when they joined and last signed in, Block and
 * Delete, which the row used to carry. An application opened from here opens over it; closing that comes back here.
 */
function AccountPanel({
  account: a,
  offers,
  t,
  pill,
  covered,
  onClose,
  onOpenOffer,
  onBlock,
  onDelete,
}: {
  account: BoardAccount;
  /** Their applications, newest first. */
  offers: BoardOffer[];
  t: Theme;
  pill: Record<OfferStatus, string>;
  /** An application is open over this panel: Escape is that one's to answer. */
  covered: boolean;
  onClose: () => void;
  onOpenOffer: (id: string) => void;
  /** Asks first (the board's confirm), then blocks or unblocks. */
  onBlock: (block: boolean) => void;
  /** Asks the board's delete window about this supplier. */
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const blocked = a.status === "BLOCKED";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !covered && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, covered]);

  const copyWechat = async () => {
    if (!a.wechatId) return;
    try {
      await navigator.clipboard.writeText(a.wechatId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // The clipboard refused (an insecure origin): the ID is on screen to copy by hand.
    }
  };

  const button = `inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold ring-1 sm:h-9 ${t.pill}`;

  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-black/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="supplier-account-title"
        onClick={(e) => e.stopPropagation()}
        className={`flex h-full w-full max-w-2xl flex-col overflow-y-auto shadow-2xl ${t.sheet} ${t.ink}`}
      >
        <div className={`sticky top-0 z-10 flex items-start gap-3 border-b px-6 py-4 backdrop-blur ${t.border} ${t.sheet}`}>
          <div className="min-w-0 flex-1">
            <p className={`text-[12px] ${t.soft}`}>Registered {stamp(a.createdAt)}</p>
            <h2 id="supplier-account-title" className="mt-0.5 line-clamp-2 text-xl font-semibold tracking-tight">
              {a.companyName ?? a.name}
            </h2>
            <p className={`truncate text-[13px] ${t.soft}`}>
              {a.companyName ? `${a.name} · ` : ""}
              {a.email}
            </p>
          </div>
          {blocked && <span className="mt-1.5 shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-600">Blocked</span>}
          <button type="button" onClick={onClose} aria-label="Close" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ${t.pill}`}>
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {a.wechatId && (
              <button
                type="button"
                onClick={() => void copyWechat()}
                className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#07c160] px-4 text-[13px] font-semibold text-white sm:h-9"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "WeChat ID copied" : `WeChat ${a.wechatId}`}
              </button>
            )}
            <a href={`tel:${a.mobile}`} className={button}>
              <Phone size={14} /> Call
            </a>
            <a href={`https://wa.me/${a.mobile.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className={button}>
              <MessageCircle size={14} /> WhatsApp
            </a>
            <a href={`mailto:${a.email}`} className={`col-span-2 ${button}`}>
              <Mail size={14} /> Email
            </a>
          </div>

          <Section title={offers.length ? `Applications · ${offers.length.toLocaleString("en-US")}` : "Applications"} t={t}>
            {offers.length ? (
              <ul className={`-mx-2 divide-y ${t.divide}`}>
                {offers.map((o) => {
                  const picture = getCdnUrl(o.productImage ?? o.photos[0] ?? null, 120);
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => onOpenOffer(o.id)}
                        className={`group flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.hover}`}
                      >
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg ${t.well}`}>
                          {picture ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={picture} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                          ) : (
                            <Package size={16} aria-hidden="true" className={t.soft} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold leading-snug underline-offset-2 group-hover:underline">{o.productName}</span>
                          <span className={`mt-0.5 block truncate text-[12px] ${t.soft}`}>
                            MOQ {moqPhrase(o.moq, o.moqUnit)} · sent {day(o.createdAt)}
                            {o.productId === null ? " · their own product" : ""}
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${pill[o.status]}`}>{TEAM_STATUS_LABEL[o.status]}</span>
                        <ChevronRight size={15} aria-hidden="true" className={`shrink-0 ${t.soft}`} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={`text-[13.5px] ${t.soft}`}>Nothing yet. Whatever they apply for arrives here.</p>
            )}
          </Section>

          <Section title="Contact" t={t}>
            <Facts
              rows={[
                ["Name", a.name],
                ["Company", a.companyName],
                ["Mobile", spaced(a.mobile)],
                ["WeChat ID", a.wechatId],
                ["Sign-in email", a.email],
                ["Company address", a.companyAddress],
              ]}
              t={t}
            />
          </Section>

          <Section title="Account" t={t}>
            <Facts
              rows={[
                ["Registered", stamp(a.createdAt)],
                ["Last signed in", a.lastLoginAt ? stamp(a.lastLoginAt) : null],
                ["Account", blocked ? "Blocked: cannot sign in" : "Active"],
              ]}
              t={t}
            />
            <div className={`mt-4 flex flex-wrap items-center gap-2 border-t pt-4 text-[13px] ${t.border}`}>
              {blocked ? (
                <button
                  type="button"
                  onClick={() => onBlock(false)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pill}`}
                >
                  <CheckCircle2 size={14} aria-hidden="true" /> Unblock
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onBlock(true)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold text-red-600 ring-1 ring-red-500/30 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <Ban size={14} aria-hidden="true" /> Block
                </button>
              )}
              <button
                type="button"
                onClick={onDelete}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold text-red-600 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <Trash2 size={14} aria-hidden="true" /> Delete supplier
              </button>
            </div>
            <p className={`mt-2 text-[12.5px] ${t.soft}`}>
              {blocked
                ? "Unblocked, they can sign in again at once."
                : "Blocked, they are signed out at once and cannot sign in until unblocked. Their applications stay."}
            </p>
          </Section>
        </div>
      </aside>
    </div>
  );
}

/** A panel's card: a small heading, then what it holds. */
function Section({ title, t, children }: { title: string; t: Theme; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl p-5 ring-1 ${t.card}`}>
      <h3 className={`text-[11px] font-bold uppercase tracking-[0.1em] ${t.soft}`}>{title}</h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** Label over value, two columns from a small screen up; a dash for what was never given. */
function Facts({ rows, t }: { rows: Array<[string, React.ReactNode]>; t: Theme }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className={`text-[12px] ${t.soft}`}>{k}</dt>
          <dd className="mt-0.5 whitespace-pre-wrap break-words text-[14px]">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
