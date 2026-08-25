"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Search, X, Download, Sun, Moon, ArrowLeft, MapPin, Package, Users,
  AlertTriangle, ChevronRight, Phone, MessageCircle, SlidersHorizontal, CheckSquare,
  Building2, User, Loader2,
} from "lucide-react";
import type { SupplierRecord } from "@/lib/suppliers";
import { haystack, supplierTitle } from "@/lib/suppliers";
import { SupplierContacts } from "@/components/admin/SupplierContacts";

/**
 * The supplier directory: 845 factories and traders the sourcing team has
 * actually dealt with, nearly all of them first met on WeChat.
 *
 * The whole set is sent to the browser in one go and filtered here rather than
 * round-tripping to the server. At this size that is the right trade: the
 * payload is a few hundred kilobytes once, and in exchange the search is
 * instant on every keystroke, which is what a directory is for — you are
 * usually looking for one supplier you half-remember, and a 300ms debounce
 * between each letter and its result makes that feel like work.
 *
 * The list shows every number and every ID inline. It deliberately does not
 * summarise contacts to "3 numbers" with the detail hidden behind a click: the
 * one thing this sheet exists to hold is the contact details, and a directory
 * that hides them has failed at its only job.
 */

type Lens = "all" | "phone" | "chat" | "no-contact" | "attention";
type SortKey = "sheet" | "company" | "person" | "product";

const LENSES: { key: Lens; label: string; hint: string }[] = [
  { key: "all", label: "All", hint: "Every supplier in the book" },
  { key: "phone", label: "With a number", hint: "Has at least one phone number" },
  { key: "chat", label: "WeChat ID", hint: "Has a messenger ID rather than, or as well as, a number" },
  { key: "no-contact", label: "No contact", hint: "Nothing recorded in the contact column" },
  { key: "attention", label: "Needs attention", hint: "Missing details, or a number too short to dial" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "sheet", label: "Sheet order" },
  { key: "company", label: "Company A–Z" },
  { key: "person", label: "Contact person A–Z" },
  { key: "product", label: "Product A–Z" },
];

const PAGE = 60;

interface DirectoryProps {
  suppliers: SupplierRecord[];
  /** Seeded from the URL so a supplier page can link into a filtered view. */
  initialQuery?: string;
  initialProduct?: string;
}

/**
 * A real checkbox rather than a styled button: native keyboard handling, the
 * "checked"/"mixed" announcement and the browser's own focus behaviour all come
 * for free, and none of the three is worth reimplementing badly.
 */
function Tick({
  checked, indeterminate = false, onChange, label, dark,
}: {
  checked: boolean; indeterminate?: boolean; onChange: () => void; label: string; dark: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // `indeterminate` is a DOM property with no HTML attribute behind it, so React
  // cannot set it from JSX — it has to be written to the node directly.
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
      className={`h-4 w-4 shrink-0 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        dark ? "accent-white" : "accent-[#1d1d1f]"
      }`}
    />
  );
}

export function SupplierDirectory({ suppliers, initialQuery = "", initialProduct = "" }: DirectoryProps) {
  const [q, setQ] = useState(initialQuery);
  const [lens, setLens] = useState<Lens>("all");
  const [product, setProduct] = useState(initialProduct);
  const [sort, setSort] = useState<SortKey>("sheet");
  const [limit, setLimit] = useState(PAGE);
  const [dark, setDark] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the search box, the convention in every directory-shaped tool.
  // Ignored while the user is already typing somewhere, so it never swallows a
  // slash meant for a field.
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
        bar: "bg-[#151517]/90 border-white/10",
      }
    : {
        page: "bg-[#f5f5f7] text-[#1d1d1f]", card: "bg-white ring-black/[0.04]",
        // `soft` is for column labels and hints. `body2` is for content that has
        // to be read rather than glanced at — the address, the contact person —
        // which at 8.3:1 sits clearly above the 4.5:1 floor while staying below
        // the supplier name in weight.
        soft: "text-[#6e6e73]", body2: "text-[#4e4e53]",
        border: "border-black/[0.06]", divide: "divide-black/[0.06]",
        hover: "hover:bg-black/[0.015]", input: "bg-[#f5f5f7] text-[#1d1d1f] placeholder:text-[#86868b]",
        pill: "bg-white text-[#1d1d1f] ring-black/[0.06] hover:bg-black/[0.02]",
        pillOn: "bg-[#1d1d1f] text-white ring-transparent", head: "bg-black/[0.02]",
        bar: "bg-white/80 border-black/[0.06]",
      };

  /** The product facet, most-used first, so the common trades sit at the top. */
  const productOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of suppliers) {
      for (const p of new Set(s.products.map((x) => x.toLowerCase()))) {
        counts.set(p, (counts.get(p) || 0) + 1);
      }
    }
    const top = [...counts.entries()]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 60);
    // A product linked to from a supplier page may be a one-off that never
    // makes the top sixty. Without this the select would read "All products"
    // while a filter was quietly in force — the list would look broken.
    if (product && !top.some(([name]) => name === product)) {
      top.unshift([product, counts.get(product) ?? 0]);
    }
    return top;
  }, [suppliers, product]);

  const counts = useMemo(
    () => ({
      all: suppliers.length,
      phone: suppliers.filter((s) => s.phones.length).length,
      chat: suppliers.filter((s) => s.handles.length).length,
      "no-contact": suppliers.filter((s) => s.flags.noContact).length,
      attention: suppliers.filter(
        (s) => s.flags.noContact || s.flags.incompleteNumber || (s.flags.noCompany && s.flags.noPerson)
      ).length,
    }),
    [suppliers]
  );

  // The search text for each row, built once here instead of being sent with
  // every record — it is the same words the record already carries, and on 845
  // rows that duplication was roughly 40% of this page's payload.
  const indexed = useMemo(() => suppliers.map((s) => ({ s, ...haystack(s) })), [suppliers]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);
    // Numbers are searched against a digits-only copy of the contact cell, so
    // "13802226624" finds a supplier recorded as "+86 138 0222 6624".
    const digits = q.replace(/\D/g, "");
    const wanted = product.toLowerCase();

    const out = indexed
      .filter(({ s, search, digits: rowDigits }) => {
        if (lens === "phone" && !s.phones.length) return false;
        if (lens === "chat" && !s.handles.length) return false;
        if (lens === "no-contact" && !s.flags.noContact) return false;
        if (lens === "attention" && !(s.flags.noContact || s.flags.incompleteNumber || (s.flags.noCompany && s.flags.noPerson))) return false;
        if (wanted && !s.products.some((p) => p.toLowerCase() === wanted)) return false;
        if (!tokens.length) return true;
        if (tokens.every((tok) => search.includes(tok))) return true;
        return digits.length >= 4 && rowDigits.includes(digits);
      })
      .map(({ s }) => s);

    const title = (s: SupplierRecord) => supplierTitle(s).toLowerCase();
    if (sort === "company") out.sort((a, b) => title(a).localeCompare(title(b)));
    else if (sort === "person") out.sort((a, b) => (a.person || "￿").toLowerCase().localeCompare((b.person || "￿").toLowerCase()));
    else if (sort === "product") out.sort((a, b) => (a.productsRaw || "￿").toLowerCase().localeCompare((b.productsRaw || "￿").toLowerCase()));
    return out;
  }, [indexed, q, lens, product, sort]);

  useEffect(() => setLimit(PAGE), [q, lens, product, sort]);

  const visible = results.slice(0, limit);
  const filtered = q.trim() !== "" || lens !== "all" || product !== "";

  // --- The manual checklist ------------------------------------------------
  //
  // Ticking rows deliberately survives a change of search. The job this serves
  // is "put together a list of the twelve people I want to contact about this
  // order", and those twelve are rarely all found by one query — you search
  // "yarn", tick three, search "fabric", tick four more. Clearing the ticks
  // every time the query changed would make that impossible, so the selection
  // is owned by the page rather than by the current result set, and the count
  // says so whenever it holds rows the current search does not show.
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const togglePick = useCallback((id: number) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  /** Select-all acts on everything matching, not just the rows rendered so far. */
  const allMatchingPicked = results.length > 0 && results.every((s) => picked.has(s.id));
  const someMatchingPicked = !allMatchingPicked && results.some((s) => picked.has(s.id));

  const toggleAllMatching = useCallback(() => {
    setPicked((prev) => {
      const next = new Set(prev);
      const everyone = results.every((s) => next.has(s.id));
      results.forEach((s) => (everyone ? next.delete(s.id) : next.add(s.id)));
      return next;
    });
  }, [results]);

  // Kept in sheet order rather than tick order, so the file reads like the
  // book it came from. Drawn from the full list, not the current results, so a
  // row ticked under an earlier search is still in the export.
  const pickedRows = useMemo(
    () => (picked.size ? suppliers.filter((s) => picked.has(s.id)) : []),
    [suppliers, picked]
  );
  const pickedOffscreen = pickedRows.length - results.filter((s) => picked.has(s.id)).length;

  // The workbook is built on the server: the spreadsheet writer is close to a
  // megabyte and has no business in the page bundle. What goes up is just the
  // ids, in the order shown, so the file matches what is on screen.
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportRows = useCallback(async () => {
    const rows = pickedRows.length ? pickedRows : results;
    if (!rows.length || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const response = await fetch("/api/admin/suppliers/export/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: rows.map((r) => r.id) }),
      });
      if (!response.ok) throw new Error(`Export failed (${response.status})`);

      // The server names the file; fall back only if the header is missing.
      const disposition = response.headers.get("Content-Disposition") || "";
      const named = /filename="([^"]+)"/.exec(disposition)?.[1];

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = named || `affhan-suppliers-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }, [results, pickedRows, exporting]);

  const reset = () => { setQ(""); setLens("all"); setProduct(""); };

  return (
    <div className={`min-h-screen ${t.page}`} style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", system-ui, sans-serif' }}>
      {/* Top bar */}
      <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${t.bar}`}>
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/admin/"
            className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[13px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pill}`}
          >
            <ArrowLeft size={15} aria-hidden="true" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
            <Image src="/logo.png" alt="" width={22} height={22} className="object-contain" />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-[15px] font-semibold tracking-tight">Suppliers</h1>
            <p className={`text-[11px] ${t.soft}`}>{suppliers.length.toLocaleString("en-US")} in the book</p>
          </div>
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            aria-pressed={dark}
            className={`ml-auto inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pill}`}
          >
            {dark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
            <span className="hidden sm:inline">{dark ? "Light" : "Dark"}</span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        {/* Counters */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            { label: "Suppliers", value: counts.all, Icon: Users, tint: "text-sky-500" },
            { label: "With a number", value: counts.phone, Icon: Phone, tint: "text-emerald-500" },
            { label: "WeChat IDs", value: counts.chat, Icon: MessageCircle, tint: "text-violet-500" },
            { label: "Needs attention", value: counts.attention, Icon: AlertTriangle, tint: "text-amber-500" },
          ] as const).map(({ label, value, Icon, tint }) => (
            <div key={label} className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 ring-1 ${t.card}`}>
              <Icon size={18} className={tint} aria-hidden="true" />
              <div className="min-w-0 leading-tight">
                <p className="text-[19px] font-semibold tracking-tight tabular-nums">{value.toLocaleString("en-US")}</p>
                <p className={`truncate text-[11.5px] ${t.soft}`}>{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* The search bar, on its own line and given the room it deserves —
            finding one supplier in 845 is what this page is for. */}
        <div className={`rounded-2xl p-3.5 ring-1 ${t.card}`}>
          <form role="search" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="supplier-search" className="sr-only">
              Search suppliers by name, company, product, address, phone number or WeChat ID
            </label>
            <div className="relative">
              <Search size={17} aria-hidden="true" className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 ${t.soft}`} />
              <input
                id="supplier-search"
                ref={searchRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoComplete="off"
                placeholder="Search name, company, product, address, number or WeChat ID…"
                // [&::-webkit-search-cancel-button]:hidden — Chromium draws its
                // own clear cross inside type="search", which sat next to ours
                // and read as two different buttons. The custom one stays: it
                // also returns focus to the field, which the native one does not.
                className={`h-12 w-full rounded-xl border-0 pl-11 pr-24 text-[14px] outline-none ring-1 ring-transparent transition-shadow focus:ring-2 focus:ring-brand [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden ${t.input}`}
              />
              <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
                {q && (
                  <button
                    type="button"
                    onClick={() => { setQ(""); searchRef.current?.focus(); }}
                    aria-label="Clear search"
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.soft} ${t.hover}`}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
                <kbd className={`hidden rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 sm:inline ${t.pill}`}>/</kbd>
              </span>
            </div>
          </form>

          {/* Lenses */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {LENSES.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setLens(l.key)}
                aria-pressed={lens === l.key}
                title={l.hint}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${lens === l.key ? t.pillOn : t.pill}`}
              >
                {l.label}
                <span className={`ml-1.5 tabular-nums ${lens === l.key ? "opacity-70" : t.soft}`}>
                  {counts[l.key].toLocaleString("en-US")}
                </span>
              </button>
            ))}
          </div>

          {/* Product and sort */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SlidersHorizontal size={15} aria-hidden="true" className={t.soft} />
            <label htmlFor="supplier-product" className="sr-only">Filter by product</label>
            <select
              id="supplier-product"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className={`h-9 rounded-xl border-0 px-3 text-[12.5px] font-semibold outline-none ring-1 transition-shadow focus:ring-2 focus:ring-brand ${t.pill}`}
            >
              <option value="">All products</option>
              {productOptions.map(([name, n]) => (
                <option key={name} value={name}>
                  {name.replace(/\b\w/g, (c) => c.toUpperCase())} ({n})
                </option>
              ))}
            </select>

            <label htmlFor="supplier-sort" className="sr-only">Sort suppliers</label>
            <select
              id="supplier-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className={`h-9 rounded-xl border-0 px-3 text-[12.5px] font-semibold outline-none ring-1 transition-shadow focus:ring-2 focus:ring-brand ${t.pill}`}
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>

            {filtered && (
              <button
                type="button"
                onClick={reset}
                className={`h-9 rounded-xl px-3 text-[12.5px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pill}`}
              >
                Reset
              </button>
            )}

            <button
              type="button"
              onClick={exportRows}
              disabled={exporting || (!results.length && !pickedRows.length)}
              className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl bg-[#1d1d1f] px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {exporting ? (
                <Loader2 size={14} aria-hidden="true" className="animate-spin" />
              ) : (
                <Download size={14} aria-hidden="true" />
              )}
              {exporting
                ? "Building Excel file…"
                : pickedRows.length
                  ? `Export ${pickedRows.length.toLocaleString("en-US")} selected`
                  : `Export ${filtered ? `these ${results.length.toLocaleString("en-US")}` : "all"}`}
            </button>
            {exportError && (
              <p role="alert" className="w-full text-[12px] font-medium text-red-600">
                {exportError}
              </p>
            )}
          </div>
        </div>

        {/* The selection bar. Not a live region: ticking a box already
            announces itself through the checkbox, and a second announcement on
            top of that just talks over the first. */}
        {picked.size > 0 && (
          <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-4 py-3 ring-1 ${t.card}`}>
            <CheckSquare size={16} aria-hidden="true" className="shrink-0 text-brand" />
            <p className="text-[13px] font-semibold">
              {picked.size.toLocaleString("en-US")} selected
              {pickedOffscreen > 0 && (
                <span className={`ml-1.5 font-normal ${t.soft}`}>
                  ({pickedOffscreen.toLocaleString("en-US")} from an earlier search, still in the export)
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className={`ml-auto rounded-xl px-3 py-1.5 text-[12px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pill}`}
            >
              Clear selection
            </button>
          </div>
        )}

        {/* Result count, announced so a screen-reader user typing in the search
            box hears the list change without having to go looking for it. */}
        <p aria-live="polite" className={`px-1 py-3 text-[12.5px] ${t.soft}`}>
          {results.length === 0
            ? "No suppliers match."
            : `Showing ${visible.length.toLocaleString("en-US")} of ${results.length.toLocaleString("en-US")}${filtered ? ` matching (${suppliers.length.toLocaleString("en-US")} in total)` : ""}`}
        </p>

        {results.length === 0 ? (
          <div className={`rounded-2xl px-6 py-16 text-center ring-1 ${t.card}`}>
            <p className="text-[14px] font-semibold">Nothing matched that.</p>
            <p className={`mt-1 text-[13px] ${t.soft}`}>
              Try part of a company name, a product, or any run of digits from a phone number.
            </p>
            <button
              type="button"
              onClick={reset}
              className={`mt-4 rounded-xl px-4 py-2 text-[13px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pill}`}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {/* Desktop: a real table, so the columns line up and a screen reader
                announces which field it is reading. */}
            <div className={`hidden overflow-hidden rounded-2xl ring-1 lg:block ${t.card}`}>
              <table className="w-full table-fixed border-collapse text-left">
                <caption className="sr-only">
                  Suppliers, showing {visible.length} of {results.length} results
                </caption>
                <colgroup>
                  <col className="w-[44px]" />
                  <col className="w-[58px]" />
                  <col className="w-[23%]" />
                  <col className="w-[17%]" />
                  <col className="w-[27%]" />
                  <col />
                </colgroup>
                <thead className={`${t.head} border-b ${t.border}`}>
                  <tr className={`text-[10.5px] font-bold uppercase tracking-wider ${t.soft}`}>
                    <th scope="col" className="py-2.5 pl-4 pr-1">
                      <Tick
                        checked={allMatchingPicked}
                        indeterminate={someMatchingPicked}
                        onChange={toggleAllMatching}
                        label={
                          allMatchingPicked
                            ? `Clear all ${results.length} matching suppliers`
                            : `Select all ${results.length} matching suppliers`
                        }
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
                  {visible.map((s) => (
                    <tr
                      key={s.id}
                      className={`align-top transition-colors ${picked.has(s.id) ? "bg-brand/[0.06]" : t.hover}`}
                    >
                      <td className="py-3.5 pl-4 pr-1">
                        <Tick
                          checked={picked.has(s.id)}
                          onChange={() => togglePick(s.id)}
                          label={`Select ${supplierTitle(s)} for export`}
                          dark={dark}
                        />
                      </td>
                      <td className={`px-2 py-3.5 text-[12px] tabular-nums ${t.soft}`}>
                        {s.serial ?? "—"}
                      </td>
                      <td className="px-3 py-3.5">
                        {/* The sheet keeps the company and the person in two
                            separate columns and both matter — you ring the
                            person, you quote the company. Stacked here with a
                            small mark against each so it is never a guess which
                            one you are looking at, and named outright for
                            anyone listening rather than looking. */}
                        <span className="flex items-start gap-1.5">
                          {s.company ? (
                            <Building2 size={12} aria-hidden="true" className={`mt-[3.5px] shrink-0 ${t.soft}`} />
                          ) : s.person ? (
                            <User size={12} aria-hidden="true" className={`mt-[3.5px] shrink-0 ${t.soft}`} />
                          ) : null}
                          <Link
                            href={`/admin/suppliers/${s.id}/`}
                            className="text-[13px] font-semibold leading-snug tracking-tight underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
                          >
                            <span className="sr-only">{s.company ? "Company: " : "Contact person: "}</span>
                            {supplierTitle(s)}
                          </Link>
                        </span>
                        {s.company && s.person && (
                          <span className="mt-1 flex items-center gap-1.5">
                            <User size={12} aria-hidden="true" className={`shrink-0 ${t.soft}`} />
                            <span className={`text-[12px] ${t.body2}`}>
                              <span className="sr-only">Contact person: </span>
                              {s.person}
                            </span>
                          </span>
                        )}
                        {s.flags.incompleteNumber && (
                          <span className={`mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-px text-[10px] font-bold ${dark ? "text-amber-500" : "text-amber-700"}`}>
                            <AlertTriangle size={10} aria-hidden="true" /> check number
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        {s.productsRaw ? (
                          <span className="text-[12.5px] leading-snug">{s.productsRaw}</span>
                        ) : (
                          <span className={`text-[12px] ${t.soft}`}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <SupplierContacts phones={s.phones} handles={s.handles} webs={s.webs} raw={s.contactRaw} dark={dark} />
                      </td>
                      {/* Plain text, at a tone you can actually read. The
                          address was in the same faint grey as the column
                          headings, which put the longest field in the row at
                          the lowest contrast on the page. Nothing is clipped or
                          truncated — the whole address is here. */}
                      <td className={`px-3 py-3.5 text-[12.5px] leading-relaxed ${s.address ? t.body2 : t.soft}`}>
                        {s.address || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile and tablet: the same records as cards. */}
            <ul className="space-y-3 lg:hidden">
              {visible.map((s) => (
                <li
                  key={s.id}
                  className={`rounded-2xl p-4 ring-1 ${t.card} ${picked.has(s.id) ? "ring-brand/40" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="pt-0.5">
                      <Tick
                        checked={picked.has(s.id)}
                        onChange={() => togglePick(s.id)}
                        label={`Select ${supplierTitle(s)} for export`}
                        dark={dark}
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="flex items-start gap-1.5">
                        {s.company ? (
                          <Building2 size={13} aria-hidden="true" className={`mt-[3.5px] shrink-0 ${t.soft}`} />
                        ) : s.person ? (
                          <User size={13} aria-hidden="true" className={`mt-[3.5px] shrink-0 ${t.soft}`} />
                        ) : null}
                        <Link
                          href={`/admin/suppliers/${s.id}/`}
                          className="text-[14px] font-semibold leading-snug tracking-tight underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
                        >
                          <span className="sr-only">{s.company ? "Company: " : "Contact person: "}</span>
                          {supplierTitle(s)}
                        </Link>
                      </span>
                      {s.company && s.person && (
                        <span className="mt-1 flex items-center gap-1.5">
                          <User size={13} aria-hidden="true" className={`shrink-0 ${t.soft}`} />
                          <span className={`text-[12px] ${t.body2}`}>
                            <span className="sr-only">Contact person: </span>
                            {s.person}
                          </span>
                        </span>
                      )}
                    </div>
                    <span className={`shrink-0 text-[11px] tabular-nums ${t.soft}`}>#{s.serial ?? "—"}</span>
                  </div>

                  {s.productsRaw && (
                    <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-snug">
                      <Package size={13} aria-hidden="true" className={`mt-0.5 shrink-0 ${t.soft}`} />
                      {s.productsRaw}
                    </p>
                  )}

                  <div className={`mt-3 border-t pt-3 ${t.border}`}>
                    <SupplierContacts phones={s.phones} handles={s.handles} webs={s.webs} raw={s.contactRaw} dark={dark} />
                  </div>

                  {s.address && (
                    <p className={`mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed ${t.body2}`}>
                      <MapPin size={13} aria-hidden="true" className={`mt-0.5 shrink-0 ${t.soft}`} />
                      {s.address}
                    </p>
                  )}

                  <Link
                    href={`/admin/suppliers/${s.id}/`}
                    className={`mt-3 inline-flex items-center gap-1 text-[12px] font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded`}
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
                  className={`rounded-xl px-5 py-2.5 text-[13px] font-semibold ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${t.pill}`}
                >
                  Show {Math.min(PAGE * 2, results.length - visible.length).toLocaleString("en-US")} more
                  <span className={`ml-1.5 ${t.soft}`}>({(results.length - visible.length).toLocaleString("en-US")} left)</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
