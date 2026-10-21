"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FolderOpen, Loader2, PackagePlus, RotateCcw, Search, X } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import type { SupplierFamily } from "@/lib/supplier-catalogue";
import type { SupplierContact } from "@/lib/supplier-offer";
import { ApplySheet, type ApplyTarget, type CatalogueProduct, type SentOffer } from "@/components/supplier/ApplySheet";

/** Products per request: what the site's own catalogue asks for at a time. */
const PAGE = 40;
/** Cards whose pictures load at once: the first screen's worth (see ProductCard on lazy images and reloads). */
const EAGER = 12;

interface Scope {
  id: string;
  name: string;
  /** The family chip it belongs under, when it is a family or one of the categories directly under one. */
  familyId: string | null;
}

interface Suggestion {
  completions: string[];
  categories: Array<{ id: string; name: string; parentName: string | null }>;
}

type Status = "loading" | "idle" | "end" | "error";

/**
 * The supplier portal's catalogue (the owner, 2026-10-21): every product the site lists, searched the way the
 * site searches (/api/products, the same engine, the same moderation) or browsed by family and category, with
 * "I have this" on each card. Pressing it opens the application over the page, so the supplier keeps their
 * place in a long list.
 *
 * What the supplier has already applied for (and not withdrawn or had decided) is marked on its card, and the
 * button there opens that application instead of starting a second one.
 *
 * The list grows as the supplier scrolls (no "Show more", as on the homepage), and the search and the category
 * ride in the address, so a reload or a shared link opens the same list.
 */
export function SupplierCatalogue({
  families,
  total,
  applied: appliedFromServer,
  contact,
  initial,
  welcome,
  firstName,
}: {
  families: SupplierFamily[];
  /** Products in the catalogue, or null when the figure could not be read. */
  total: number | null;
  /** Open applications: product id to application id. */
  applied: Record<string, string>;
  contact: SupplierContact;
  initial: { q: string; scope: Scope | null };
  welcome: boolean;
  firstName: string;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState(initial.q);
  const [query, setQuery] = useState(initial.q);
  const [scope, setScope] = useState<Scope | null>(initial.scope);
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<Status>("loading");
  const [found, setFound] = useState<{ total: number; capped: boolean; loose: boolean } | null>(null);
  const [applied, setApplied] = useState(appliedFromServer);
  const [sheet, setSheet] = useState<ApplyTarget | null>(null);
  const [showWelcome, setShowWelcome] = useState(welcome);
  const [sugOpen, setSugOpen] = useState(false);
  const [sugs, setSugs] = useState<Suggestion | null>(null);
  const [sugIndex, setSugIndex] = useState(-1);
  const generation = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLDivElement>(null);

  // The server's word on what is open, whenever it is read again (after an application, router.refresh()).
  useEffect(() => setApplied(appliedFromServer), [appliedFromServer]);

  const family = useMemo(
    () => (scope?.familyId ? families.find((f) => f.id === scope.familyId) ?? null : null),
    [scope, families],
  );

  const load = useCallback(
    async (pageNo: number, reset: boolean) => {
      const mine = reset ? ++generation.current : generation.current;
      setStatus("loading");
      if (reset) {
        setProducts([]);
        setFound(null);
      }
      const params = new URLSearchParams({ page: String(pageNo), limit: String(PAGE) });
      if (query) params.set("q", query);
      if (scope) params.set("categoryId", scope.id);
      try {
        const res = await fetch(`/api/products/?${params}`);
        const data = await res.json();
        if (mine !== generation.current) return;
        if (!res.ok || !data?.success) throw new Error("products");
        const rows: CatalogueProduct[] = (data.data as Array<{
          id: number;
          name: string;
          imageUrl: string | null;
          category: string | null;
          categoryRef: { name: string | null } | null;
        }>).map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl, category: p.categoryRef?.name ?? p.category ?? null }));
        setProducts((before) => {
          const base = reset ? [] : before;
          const seen = new Set(base.map((p) => p.id));
          return [...base, ...rows.filter((r) => !seen.has(r.id) && Boolean(seen.add(r.id)))];
        });
        setPage(pageNo);
        setFound({ total: data.pagination?.total ?? rows.length, capped: Boolean(data.pagination?.totalCapped), loose: Boolean(data.search?.loose) });
        const pages = Number(data.pagination?.totalPages ?? 1);
        // With no search and no category, page 1 is the homepage's shuffled showcase (the daily refresh's stored
        // pool, which can be short, or missing before a refresh) and page 2 on is the whole catalogue in order;
        // so page 1 never ends the list, and an empty one simply moves on to page 2.
        const showcase = !query && !scope && pageNo === 1;
        setStatus(!showcase && (rows.length < PAGE || pageNo >= pages) ? "end" : "idle");
      } catch {
        if (mine === generation.current) setStatus("error");
      }
    },
    [query, scope],
  );

  // A new search or category starts the list again.
  useEffect(() => {
    void load(1, true);
  }, [load]);

  // The next page when the end of the list comes near; again at once if the screen is still not full.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || status !== "idle") return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void load(page + 1, false);
    }, { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [status, page, load]);

  // The search and the category into the address, so a reload or a link opens the same list.
  useEffect(() => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (scope) p.set("cat", scope.id);
    const qs = p.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
  }, [query, scope]);

  // As-you-type suggestions from the site's own engine (/api/search/suggestions), from the first letter.
  useEffect(() => {
    const text = typed.trim();
    if (!sugOpen || !text || text === query) {
      setSugs(null);
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggestions/?q=${encodeURIComponent(text)}`, { signal: ctrl.signal });
        const data = await res.json();
        setSugs({
          completions: (data?.completions ?? []).filter((c: unknown): c is string => typeof c === "string").slice(0, 6),
          categories: (data?.categories ?? []).slice(0, 3),
        });
        setSugIndex(-1);
      } catch {
        // A suggestion that did not come is no suggestion; the search itself still works.
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [typed, sugOpen, query]);

  // Suggestions close when the press lands anywhere else.
  useEffect(() => {
    if (!sugOpen) return;
    const away = (e: PointerEvent) => {
      if (searchBox.current && !searchBox.current.contains(e.target as Node)) setSugOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [sugOpen]);

  // The welcome is for the arrival only: out of the address, so a reload does not say it again.
  useEffect(() => {
    if (!welcome) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("welcome")) {
      url.searchParams.delete("welcome");
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }
  }, [welcome]);

  const runSearch = (text: string) => {
    setTyped(text);
    setQuery(text.trim());
    setSugOpen(false);
  };

  const options = useMemo(
    () => [
      ...(sugs?.completions ?? []).map((text) => ({ kind: "text" as const, text })),
      ...(sugs?.categories ?? []).map((c) => ({ kind: "category" as const, category: c })),
    ],
    [sugs],
  );

  const pick = (i: number) => {
    const o = options[i];
    if (!o) return;
    if (o.kind === "text") return runSearch(o.text);
    const familyId =
      families.find((f) => f.id === o.category.id)?.id ?? families.find((f) => f.children.some((c) => c.id === o.category.id))?.id ?? null;
    setScope({ id: o.category.id, name: o.category.name, familyId });
    setTyped("");
    setQuery("");
    setSugOpen(false);
  };

  const closeSheet = useCallback(() => setSheet(null), []);
  const onSent = useCallback(
    (offer: SentOffer) => {
      if (offer.productId !== null) setApplied((a) => ({ ...a, [String(offer.productId)]: offer.id }));
      // The bar's count of open applications is the layout's; read it again.
      router.refresh();
    },
    [router],
  );

  const count = (n: number) => n.toLocaleString("en-US");
  const heading = query ? (
    <>
      Results for <span className="text-brand-dark">“{query}”</span>
    </>
  ) : scope ? (
    scope.name
  ) : (
    "Our catalogue"
  );
  const sub =
    status === "loading" && !found
      ? "Finding products…"
      : query || scope
        ? found
          ? found.loose
            ? "No product has every word. These come closest."
            : `${found.capped ? `${count(found.total)}+` : count(found.total)} ${found.total === 1 ? "product" : "products"}${query && scope ? ` in ${scope.name}` : ""}`
          : ""
        : total
          ? `${count(total)} products. Search, or pick a category.`
          : "Search, or pick a category.";

  const chip = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
      active ? "bg-[#0b2230] text-white" : "bg-white text-[#33494f] ring-1 ring-[#dbe4e7] hover:ring-brand/60 hover:text-brand-dark"
    }`;

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-16 pt-5 sm:px-6 sm:pt-7">
      {showWelcome && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-emerald-50 px-4 py-3.5 ring-1 ring-emerald-200/70">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <p className="flex-1 text-[13.5px] leading-relaxed text-emerald-900">
            <span className="font-bold">Welcome, {firstName}. Your supplier account is ready.</span> Find a product your company makes or
            stocks, and press <span className="font-semibold">I have this</span>.
          </p>
          <button type="button" onClick={() => setShowWelcome(false)} aria-label="Dismiss" className="rounded-full p-1 text-emerald-700 hover:bg-emerald-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <section className="rounded-[22px] bg-white px-5 py-6 ring-1 ring-[#e1e8ea] sm:px-8 sm:py-8">
        <h1 className="text-[22px] font-extrabold tracking-tight text-[#0b2230] sm:text-[28px]">Which of these can you supply?</h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-[#4b6168]">
          Press <span className="font-semibold text-[#0b2230]">I have this</span> on any product your company makes or stocks, and tell us your
          minimum order. Our sourcing team reviews every application.
        </p>

        <div ref={searchBox} className="relative mt-5 max-w-3xl">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (sugIndex >= 0) pick(sugIndex);
              else runSearch(typed);
            }}
            className="flex items-center gap-2 rounded-2xl bg-[#f2f6f7] p-1.5 ring-1 ring-[#d9e3e6] focus-within:bg-white focus-within:ring-2 focus-within:ring-brand/60"
          >
            <Search className="ml-2.5 h-5 w-5 shrink-0 text-[#6d8288]" aria-hidden="true" />
            <input
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                setSugOpen(true);
              }}
              onFocus={() => setSugOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && options.length) {
                  e.preventDefault();
                  setSugOpen(true);
                  setSugIndex((i) => (i + 1) % options.length);
                } else if (e.key === "ArrowUp" && options.length) {
                  e.preventDefault();
                  setSugIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
                } else if (e.key === "Escape") {
                  setSugOpen(false);
                }
              }}
              placeholder="Search products, like “bluetooth earbuds” or “cotton t-shirt”"
              aria-label="Search the catalogue"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={Boolean(sugOpen && options.length)}
              aria-controls="supplier-suggestions"
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-[#10262e] outline-none placeholder:text-[#8a9ba0]"
            />
            {typed && (
              <button
                type="button"
                onClick={() => {
                  setTyped("");
                  if (query) setQuery("");
                }}
                aria-label="Clear the search"
                className="rounded-full p-1.5 text-[#6d8288] hover:bg-[#e6eef0]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button type="submit" className="shrink-0 rounded-xl bg-brand-dark px-4 py-2.5 text-[14px] font-bold text-white hover:bg-brand-deep sm:px-6">
              Search
            </button>
          </form>

          {sugOpen && options.length > 0 && (
            <ul
              id="supplier-suggestions"
              role="listbox"
              className="absolute inset-x-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-2xl bg-white py-1.5 shadow-[0_18px_40px_rgba(11,34,48,0.16)] ring-1 ring-[#dfe7ea]"
            >
              {options.map((o, i) => (
                <li key={o.kind === "text" ? `t:${o.text}` : `c:${o.category.id}`} role="option" aria-selected={i === sugIndex}>
                  <button
                    type="button"
                    onMouseEnter={() => setSugIndex(i)}
                    onClick={() => pick(i)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left text-[14px] ${i === sugIndex ? "bg-[#eef5f7]" : ""}`}
                  >
                    {o.kind === "text" ? (
                      <>
                        <Search className="h-4 w-4 shrink-0 text-[#8a9ba0]" aria-hidden="true" />
                        <span className="truncate">{o.text}</span>
                      </>
                    ) : (
                      <>
                        <FolderOpen className="h-4 w-4 shrink-0 text-brand-dark" aria-hidden="true" />
                        <span className="truncate">
                          Browse <span className="font-semibold">{o.category.name}</span>
                          {o.category.parentName ? <span className="text-[#7b8d93]"> in {o.category.parentName}</span> : null}
                        </span>
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* The families, biggest first, then the categories under the one picked. */}
      <nav aria-label="Categories" className="mt-5">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <button type="button" onClick={() => setScope(null)} className={chip(!scope)} aria-pressed={!scope}>
            All products
          </button>
          {families.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setScope({ id: f.id, name: f.name, familyId: f.id })}
              className={chip(scope?.familyId === f.id)}
              aria-pressed={scope?.familyId === f.id}
            >
              {f.name}
            </button>
          ))}
        </div>
        {family && family.children.length > 0 && (
          <div className="mt-2.5 rounded-2xl bg-white p-2.5 ring-1 ring-[#e1e8ea]">
            <div className="-mx-2.5 flex gap-1.5 overflow-x-auto px-2.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              <button
                type="button"
                onClick={() => setScope({ id: family.id, name: family.name, familyId: family.id })}
                className={`shrink-0 rounded-full px-3 py-1 text-[12.5px] font-semibold ${scope?.id === family.id ? "bg-brand/12 text-brand-dark" : "text-[#4b6168] hover:bg-[#f0f5f6]"}`}
              >
                All {family.name}
              </button>
              {family.children.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setScope({ id: c.id, name: c.name, familyId: family.id })}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] font-semibold ${scope?.id === c.id ? "bg-brand/12 text-brand-dark" : "text-[#4b6168] hover:bg-[#f0f5f6]"}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="truncate text-[18px] font-bold tracking-tight text-[#0b2230]">{heading}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-[#5b6f76]">
            <span>{sub}</span>
            {scope && !family && (
              <button type="button" onClick={() => setScope(null)} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[12px] font-semibold text-[#33494f] ring-1 ring-[#dbe4e7] hover:ring-brand/60">
                {scope.name} <X className="h-3 w-3" aria-label="Remove" />
              </button>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSheet({ kind: "own", name: query || undefined })}
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-brand-dark ring-1 ring-[#cfdcdf] transition-colors hover:bg-[#f2f8f9]"
        >
          <PackagePlus className="h-4 w-4" aria-hidden="true" />
          Not listed? Apply with your own product
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {products.map((p, i) => (
          <ProductTile
            key={p.id}
            product={p}
            eager={i < EAGER}
            offerId={applied[String(p.id)]}
            onApply={() => setSheet({ kind: "catalogue", product: p })}
          />
        ))}
        {status === "loading" &&
          Array.from({ length: products.length ? 6 : 12 }, (_, i) => (
            <div key={`s${i}`} aria-hidden="true" className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e7eef0]">
              <div className="aspect-square animate-pulse bg-[#eef3f4]" />
              <div className="space-y-2 p-3">
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-[#eef3f4]" />
                <div className="h-3 w-full animate-pulse rounded bg-[#eef3f4]" />
                <div className="h-8 w-full animate-pulse rounded-xl bg-[#eef3f4]" />
              </div>
            </div>
          ))}
      </div>

      {status === "error" && (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-[#e1e8ea]">
          <p className="text-[14px] font-semibold">The products could not be loaded.</p>
          <button
            type="button"
            onClick={() => void load(products.length ? page + 1 : 1, !products.length)}
            className="inline-flex items-center gap-2 rounded-full bg-brand-dark px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-deep"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
        </div>
      )}

      {status === "end" && products.length === 0 && (
        <div className="mt-2 flex flex-col items-center gap-3 rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-[#e1e8ea]">
          <p className="text-[15px] font-semibold">
            {query ? `Nothing in the catalogue matches “${query}”${scope ? ` in ${scope.name}` : ""}.` : "No products here yet."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {query && scope && (
              <button type="button" onClick={() => setScope(null)} className="rounded-full px-4 py-2 text-[13px] font-semibold text-brand-dark ring-1 ring-[#cfdcdf] hover:bg-[#f2f8f9]">
                Search every category
              </button>
            )}
            <button
              type="button"
              onClick={() => setSheet({ kind: "own", name: query || undefined })}
              className="inline-flex items-center gap-2 rounded-full bg-brand-dark px-4 py-2 text-[13px] font-bold text-white hover:bg-brand-deep"
            >
              <PackagePlus className="h-4 w-4" aria-hidden="true" /> Apply with your own product
            </button>
          </div>
        </div>
      )}

      <div ref={sentinel} aria-hidden="true" className="h-px" />
      {status === "loading" && products.length > 0 && (
        <p className="mt-4 flex items-center justify-center gap-2 text-[13px] text-[#5b6f76]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading more products…
        </p>
      )}
      {status === "end" && products.length > 0 && (
        <p className="mt-8 text-center text-[13px] text-[#5b6f76]">
          {query || scope ? "That's every product here. " : ""}
          Can&apos;t see yours?{" "}
          <button type="button" onClick={() => setSheet({ kind: "own", name: query || undefined })} className="font-semibold text-brand-dark hover:underline">
            Apply with your own product
          </button>
          .
        </p>
      )}

      {sheet && <ApplySheet target={sheet} contact={contact} onClose={closeSheet} onSent={onSent} />}
    </main>
  );
}

function ProductTile({
  product,
  eager,
  offerId,
  onApply,
}: {
  product: CatalogueProduct;
  eager: boolean;
  offerId: string | undefined;
  onApply: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const src = getCdnUrl(product.imageUrl, 400);
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-[#e1e8ea] transition-shadow hover:shadow-[0_10px_28px_rgba(11,34,48,0.10)] hover:ring-[#c9dade]">
      <button type="button" onClick={onApply} className="relative block aspect-square overflow-hidden bg-[#f4f7f8]" aria-label={`Apply to supply ${product.name}`}>
        {src && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            srcSet={[200, 260, 340, 400].map((w) => `${getCdnUrl(product.imageUrl, w)} ${w}w`).join(", ")}
            sizes="(max-width: 639px) 46vw, (max-width: 767px) 30vw, (max-width: 1023px) 23vw, (max-width: 1279px) 18vw, 210px"
            alt=""
            width={400}
            height={400}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-[12px] text-[#9aabb0]">No picture</span>
        )}
        {offerId && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Applied
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col p-3">
        {product.category && <p className="truncate text-[11.5px] font-medium text-[#6d8288]">{product.category}</p>}
        <h3 className="mt-0.5 line-clamp-2 min-h-[2.6em] text-[13px] font-semibold leading-[1.3] text-[#10262e]">{product.name}</h3>
        {offerId ? (
          <Link
            href={`/supplier/applications/#${offerId}`}
            className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-[12.5px] font-bold text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
          >
            View application
          </Link>
        ) : (
          <button
            type="button"
            onClick={onApply}
            className="mt-3 rounded-xl bg-white px-3 py-2 text-[12.5px] font-bold text-brand-dark ring-1 ring-[#bcd3d9] transition-colors group-hover:bg-brand-dark group-hover:text-white group-hover:ring-brand-dark"
          >
            I have this
          </button>
        )}
      </div>
    </article>
  );
}
