"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Building2, Check, CheckCircle2, CheckSquare, ChevronRight, Clock, Download, Loader2,
  Mail, MapPin, Moon, Package, RefreshCw, Search, SlidersHorizontal, Sun, Trash2, User, Users, X,
} from "lucide-react";
import { useAdminDark } from "@/lib/useAdminDark";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { timeAgo } from "@/lib/relative-time";
import { SupplierContacts } from "@/components/admin/SupplierContacts";
import { ConfirmDelete } from "@/components/admin/ConfirmDelete";
import {
  NOTICE_KEY, day, newSupplierTheme, offerTone, phoneOf, stamp, wechatOf, type BoardAccount, type BoardOffer,
} from "@/components/admin/new-suppliers-shared";
import { TEAM_STATUS_LABEL, moqPhrase } from "@/lib/supplier-offer";

/**
 * New Suppliers (the admin rail, 2026-10-21): everyone who registered on the supplier portal, and every
 * product they applied to supply, kept as the owner asked, "everything stored", in the same shape as the WeChat
 * book beside it (Old Suppliers, SupplierDirectory): the same counters, search, chips and table, the same
 * WhatsApp and copy buttons, the same dark mode. One row is one supplier, with their applications in the Products
 * column and where each stands.
 *
 * A supplier opens on their own page, as the book's do (NewSupplierDetail, the owner, 2026-10-23: "like the old
 * supplier's page"): their name opens it, an application opens it at that application, where the team sets the
 * status the supplier sees (New, Reviewing, Accepted, Not selected) and writes the reply they read beside it, and
 * where the supplier can be blocked or deleted.
 *
 * Read on the server (the newest 2,000 of each) and filtered here, as the book is, so the search answers on
 * every keystroke; read again every twenty seconds while on screen, so a new application shows by itself.
 *
 * Rows can be ticked, one by one or every one the search shows, as in the book (the owner, 2026-10-22): the
 * ticked ones can be exported, or deleted for good, account, applications and photos, after a window that
 * says exactly what goes.
 */

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

/** A supplier's own page, or one application on it. */
const pageOf = (supplierId: string, offerId?: string) => `/admin/new-suppliers/${supplierId}/${offerId ? `#application-${offerId}` : ""}`;

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
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  /** Ticked suppliers, by account id; kept across searches and chips, as in the book. */
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  /** The suppliers the delete window is asking about. */
  const [pending, setPending] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dark, setDark] = useAdminDark();
  const searchRef = useRef<HTMLInputElement>(null);

  // Live, as the console's lists are (the owner, 2026-10-23: a supplier's application took too long to show here):
  // the page reads itself again every twenty seconds while it is on screen, and at once on coming back to the tab.
  // Each refresh hands new rows down: take them.
  const { refresh, refreshing, updatedAt } = useLiveRefresh(20_000);
  useEffect(() => setOffers(initialOffers), [initialOffers]);
  useEffect(() => setAccounts(initialAccounts), [initialAccounts]);

  // A supplier deleted on their own page comes back here with what was deleted, to say once.
  useEffect(() => {
    try {
      const said = window.sessionStorage.getItem(NOTICE_KEY);
      if (!said) return;
      window.sessionStorage.removeItem(NOTICE_KEY);
      setNotice(said);
    } catch {
      // Storage refused (a private window's settings): the row is gone, which says it anyway.
    }
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

  const t = newSupplierTheme(dark);
  const status = offerTone(dark);

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
      const res = await fetch("/api/admin/supplier-accounts/delete/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: pending }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return res.status === 401 ? "Your admin session has ended. Sign in again." : data?.error ?? "The suppliers were not deleted.";
      const gone = new Set<string>(Array.isArray(data.ids) ? data.ids : pending);
      setAccounts((all) => all.filter((a) => !gone.has(a.id)));
      setOffers((all) => all.filter((o) => !gone.has(o.supplierId)));
      setPicked((s) => new Set([...s].filter((id) => !gone.has(id))));
      setNotice(`Deleted ${plural(Number(data.deleted) || gone.size, "supplier")}${data.applications ? ` and ${plural(Number(data.applications), "application")}` : ""}.`);
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
    const chosen = rows.filter((r) => pending.includes(r.account.id));
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
  })();

  const counters = [
    { label: "Suppliers", value: accounts.length, Icon: Users, tint: "text-sky-500" },
    { label: "Applications", value: offers.length, Icon: Package, tint: "text-violet-500" },
    { label: "Waiting", value: offers.filter((o) => o.status === "NEW").length, Icon: Clock, tint: "text-amber-500" },
    { label: "Accepted", value: offers.filter((o) => o.status === "ACCEPTED").length, Icon: CheckCircle2, tint: "text-emerald-500" },
  ] as const;

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

  // The row reads as the book's does (the owner, 2026-10-23: the old row was the one to match): the supplier, what
  // they supply, how to reach them, where they are. Everything else (when they joined, each application in full,
  // Block, Delete) is on their own page, one press away, as the book's is.
  const productsCell = (r: Row, big = false) => {
    if (!r.offers.length) return <span className={`text-[12px] ${t.soft}`}>No applications yet</span>;
    const all = expanded.has(r.account.id);
    const shown = all ? r.offers : r.offers.slice(0, SHOWN);
    return (
      // One line an application, the product in the book's plain text and where it stands at the line's end, so the
      // statuses make one column down the cell. The MOQ, photos and the day it came are on hover, and the line opens
      // the supplier's page at that application.
      <ul className="space-y-1">
        {shown.map((o) => (
          <li key={o.id}>
            <Link
              href={pageOf(r.account.id, o.id)}
              title={[
                o.productName,
                `MOQ ${moqPhrase(o.moq, o.moqUnit)}`,
                o.photos.length ? plural(o.photos.length, "photo") : "",
                o.productId === null ? "their own product" : "",
                `sent ${day(o.createdAt)}`,
              ].filter(Boolean).join(" · ")}
              className="group flex w-full min-w-0 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className={`min-w-0 flex-1 truncate leading-snug underline-offset-2 group-hover:underline ${big ? "text-[13px]" : "text-[12.5px]"}`}>
                {o.productName}
              </span>
              <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold ${status[o.status]}`}>{TEAM_STATUS_LABEL[o.status]}</span>
            </Link>
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

  // The book's Supplier cell: the company (the person until a first application gives one), opening the supplier's
  // page as the book's opens its own; the person under it, then the email they sign in with (the book has none, so it
  // is here rather than a third line in Contact, which keeps the rows the book's height); a flag only when there is
  // something to know.
  const supplierCell = (r: Row, big = false) => {
    const Mark = r.account.companyName ? Building2 : User;
    return (
      <>
        <span className="flex items-start gap-1.5">
          <Mark size={big ? 13 : 12} aria-hidden="true" className={`mt-[3.5px] shrink-0 ${t.soft}`} />
          <Link
            href={pageOf(r.account.id)}
            title={`Registered ${day(r.account.createdAt)}${r.account.lastLoginAt ? ` · last signed in ${day(r.account.lastLoginAt)}` : ""}`}
            className={`rounded font-semibold leading-snug tracking-tight underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${big ? "text-[14px]" : "text-[13px]"}`}
          >
            <span className="sr-only">{r.account.companyName ? "Company: " : "Contact person: "}</span>
            {r.account.companyName ?? r.account.name}
          </Link>
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
                onClick={() => setPending(pickedRows.map((r) => r.account.id))}
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
                  <Link
                    href={pageOf(r.account.id)}
                    className="mt-3 inline-flex items-center gap-1 rounded text-[12px] font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    Open supplier <ChevronRight size={13} aria-hidden="true" />
                  </Link>
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
