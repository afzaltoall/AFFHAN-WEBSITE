"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpLeft, Camera, ChevronRight, CornerDownLeft, Handshake, Layers, Loader2, Package, Search, SpellCheck, Wallet, X } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { correctWords, nameWords, resolveCategories, understandQuery, type CategoryHit, type QueryIntent } from "@/lib/searchIntent";
import { categoriesStartingWith, type Completion } from "@/lib/searchComplete";
import { loadSearchKit, type SearchKit } from "./searchKit";

/**
 * The search box's dropdown, for the homepage hero and the navbar alike (the
 * owner's request of 2026-10-06: "same as Amazon, Flipkart"). Everything but
 * the product pictures is worked out in the browser on each keystroke
 * (searchKit), so it answers as fast as one can type:
 *
 *   - how the query was read: a budget or a quantity taken out of it ("Under
 *     ₹10,000", "500 pcs"), a typo corrected ("Showing mobile phone"), so
 *     the shopper sees the search understood them;
 *   - what it completes to, from the catalogue's own phrases, the typed
 *     part plain and the rest bold, with ↖ to take one into the box;
 *   - the best match: the category the words name, how much it holds, and
 *     its kinds ("Mobile Phones": 5-inch Display, Dual SIM Card, Octa
 *     Core…) one tap away; then other categories, by whole words ("mobile"
 *     never finds "Automobiles");
 *   - a few products, from the server (/api/search/suggestions), ranked the
 *     way the results page ranks;
 *   - and, since everything here is sourced to order, a way to ask for it
 *     anyway, with the words, budget and quantity already written in.
 *
 * With the box empty: recent searches, examples of searching the way one
 * would ask ("mobile phones under ₹10,000"), and the largest categories.
 *
 * Keyboard: ↑ ↓ through everything in order, Enter to take it, Esc to close;
 * the box is an ARIA combobox and the dropdown its listbox.
 */

const RECENT_KEY = "recentSearches";
const EXAMPLES = ["mobile phones under ₹10,000", "500 pcs led bulbs", "women bags", "car seat cover", "bluetooth speaker", "kids toys"];

export interface AssistCategory {
  id: string;
  name: string;
  parentName: string | null;
  total: number;
  thumbnailUrl: string | null;
}
export interface AssistProduct {
  id: number;
  name: string;
  imageUrl: string | null;
  category: string | null;
}
interface AssistModel {
  intent: QueryIntent;
  /** The words as read, before a typo was corrected. */
  typed: string;
  corrected: boolean;
  completions: Completion[];
  best: (AssistCategory & { kinds: AssistCategory[] }) | null;
  categories: AssistCategory[];
}
type AssistItem =
  | { kind: "completion"; text: string }
  | { kind: "category"; id: string }
  | { kind: "product"; id: number }
  | { kind: "search"; text: string }
  | { kind: "phrase"; text: string }
  | { kind: "photo" };

function card(kit: SearchKit, h: CategoryHit | { id: string; name: string; path: string[]; total: number }): AssistCategory {
  const rec = kit.byId.get(h.id);
  return { id: h.id, name: (rec?.displayLabel as string | null | undefined) || h.name, parentName: h.path[h.path.length - 1] ?? null, total: h.total, thumbnailUrl: rec?.thumbnailUrl ?? null };
}

function buildModel(kit: SearchKit, query: string): AssistModel {
  const typing = !/\s$/.test(query);
  const read = understandQuery(query);
  const { intent, corrected } = correctWords(read, kit.vocab, typing);
  let completions = kit.completer.complete(query, 7);
  if (!completions.length && corrected) completions = kit.completer.complete(intent.text, 7);
  let resolved = resolveCategories(intent, kit.index);
  // A word half typed names nothing yet: the likeliest completion does
  // ("earb" → earbuds, "women b" → women bag). Not a word typed whole:
  // "vacuum" is not "vacuum cup". The last word as typed, since the
  // reading drops a lone letter.
  const last = nameWords(query).pop() ?? "";
  if (!resolved.primary.length && completions[0] && typing && !!last && !kit.completer.isWord(last)) {
    const guess = resolveCategories(understandQuery(completions[0].text), kit.index);
    if (guess.primary.length) resolved = { primary: guess.primary, related: [...guess.related, ...resolved.related] };
  }
  const starting = categoriesStartingWith(query, kit.index, 6, kit.completer.isWord);
  const bestHit = resolved.primary[0] ?? null;
  const best = bestHit
    ? {
        ...card(kit, bestHit),
        kinds: (kit.children.get(bestHit.id) ?? []).slice(0, 8).map((c) => card(kit, { id: c.id, name: c.name, path: [bestHit.name], total: kit.index.byId.get(c.id)?.total ?? 0 })),
      }
    : null;
  const seen = new Set<string>(best ? [best.id, ...best.kinds.map((k) => k.id)] : []);
  const categories: AssistCategory[] = [];
  for (const h of [...resolved.primary.slice(1), ...starting, ...resolved.related]) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    categories.push(card(kit, h));
    if (categories.length >= 4) break;
  }
  return { intent, typed: read.text, corrected, completions, best, categories };
}

/** "I'm looking for: mobile phones · Budget: Under ₹10,000 · Quantity: 500 pcs", for the sourcing request. */
export function sourcingMessage(query: string, intent?: QueryIntent | null): string {
  const what = intent?.text || query.trim();
  const parts = [`I'm looking for: ${what}`];
  if (intent?.budget) parts.push(`Budget: ${intent.budget.label}`);
  if (intent?.quantity) parts.push(`Quantity: ${intent.quantity.label}`);
  return parts.join(" · ");
}

export function useSearchAssist({
  query,
  open,
  onSearch,
  onCategory,
  onProduct,
  onClose,
  onPhotoSearch,
}: {
  query: string;
  /** The dropdown is showing: load the engine, fetch products. */
  open: boolean;
  onSearch: (term: string) => void;
  onCategory: (id: string) => void;
  onProduct: (id: number) => void;
  onClose?: () => void;
  /** A box with photo search beside it: the empty dropdown offers it first ("Search with a photo"). */
  onPhotoSearch?: () => void;
}) {
  const [kit, setKit] = useState<SearchKit | null>(null);
  const [active, setActive] = useState(-1);
  const [products, setProducts] = useState<{ q: string; list: AssistProduct[] } | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const listboxId = useId();

  useEffect(() => {
    if (!open || kit) return;
    let live = true;
    loadSearchKit()
      .then((k) => live && setKit(k))
      .catch(() => {
        /* the box still searches; it only suggests less */
      });
    return () => {
      live = false;
    };
  }, [open, kit]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_KEY);
      if (saved) setRecent((JSON.parse(saved) as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 6));
    } catch {
      /* private window: no recent searches */
    }
  }, []);
  const storeRecent = (next: string[]) => {
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* not kept */
    }
  };
  const saveRecent = useCallback((term: string) => {
    const t = term.trim();
    if (!t) return;
    setRecent((r) => {
      const next = [t, ...r.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 6);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        /* not kept */
      }
      return next;
    });
  }, []);
  const removeRecent = (term: string) => storeRecent(recent.filter((x) => x !== term));
  const clearRecent = () => storeRecent([]);

  const model = useMemo(() => (kit && query.trim() ? buildModel(kit, query) : null), [kit, query]);

  // Products: debounced, the last answer kept (dimmed) until the next one comes.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) return;
    const cached = productCache.get(q.toLowerCase());
    if (cached) {
      setProducts({ q, list: cached });
      return;
    }
    const ctl = new AbortController();
    const t = window.setTimeout(async () => {
      setLoadingProducts(true);
      try {
        const res = await fetch(`/api/search/suggestions/?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        const json = res.ok ? ((await res.json()) as { products?: AssistProduct[] }) : { products: [] };
        const list = (json.products ?? []).slice(0, 6);
        productCache.set(q.toLowerCase(), list);
        if (productCache.size > 60) productCache.delete(productCache.keys().next().value as string);
        setProducts({ q, list });
      } catch {
        /* aborted, or offline: keep what is shown */
      } finally {
        if (!ctl.signal.aborted) setLoadingProducts(false);
      }
    }, 140);
    return () => {
      window.clearTimeout(t);
      ctl.abort();
    };
  }, [query, open]);

  const shownProducts = useMemo(() => (query.trim().length >= 2 && products ? products.list : []), [query, products]);

  const items: AssistItem[] = useMemo(() => {
    if (!query.trim())
      return [
        ...(onPhotoSearch ? [{ kind: "photo" as const }] : []),
        ...recent.map((text) => ({ kind: "phrase" as const, text })),
        ...EXAMPLES.map((text) => ({ kind: "phrase" as const, text })),
        ...(kit?.popular ?? []).slice(0, 8).map((c) => ({ kind: "category" as const, id: c.id })),
      ];
    const out: AssistItem[] = [];
    for (const c of model?.completions ?? []) out.push({ kind: "completion", text: c.text });
    if (model?.best) {
      out.push({ kind: "category", id: model.best.id });
      for (const k of model.best.kinds) out.push({ kind: "category", id: k.id });
    }
    for (const c of model?.categories ?? []) out.push({ kind: "category", id: c.id });
    for (const p of shownProducts) out.push({ kind: "product", id: p.id });
    out.push({ kind: "search", text: query.trim() });
    return out;
  }, [query, model, shownProducts, recent, kit, onPhotoSearch]);

  useEffect(() => setActive(-1), [query]);

  const activate = useCallback(
    (item: AssistItem) => {
      if (item.kind === "photo") onPhotoSearch?.();
      else if (item.kind === "category") onCategory(item.id);
      else if (item.kind === "product") onProduct(item.id);
      else {
        saveRecent(item.text);
        onSearch(item.text);
      }
    },
    [onCategory, onProduct, onSearch, saveRecent, onPhotoSearch],
  );

  const optionId = useCallback((i: number) => `${listboxId}-o${i}`, [listboxId]);
  // ↑ ↓ keep the active row in sight when the panel is taller than its
  // room. Only for the keys: a row the mouse is on is in sight already, and
  // scrolling to a half-hidden one under the pointer would jump the panel.
  const keyed = useRef(false);
  useEffect(() => {
    if (!keyed.current) return;
    keyed.current = false;
    if (active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
  }, [active, optionId]);
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      keyed.current = true;
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      keyed.current = true;
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === "Enter" && active >= 0 && items[active]) {
      e.preventDefault();
      activate(items[active]);
    } else if (e.key === "Enter" && query.trim()) {
      saveRecent(query);
    } else if (e.key === "Escape") {
      onClose?.();
    }
  };

  return {
    kit,
    model,
    products: shownProducts,
    productsStale: loadingProducts || (!!products && products.q !== query.trim()),
    loadingProducts,
    recent,
    saveRecent,
    removeRecent,
    clearRecent,
    items,
    active,
    setActive,
    activate,
    optionId,
    listboxId,
    inputProps: {
      role: "combobox" as const,
      "aria-autocomplete": "list" as const,
      "aria-expanded": open,
      "aria-controls": listboxId,
      "aria-activedescendant": active >= 0 ? optionId(active) : undefined,
      onKeyDown,
    },
  };
}

const productCache = new Map<string, AssistProduct[]>();

export type SearchAssistState = ReturnType<typeof useSearchAssist>;

/** Room below the box under which the page is scrolled to make more, and the least a panel is given. */
const PANEL_ROOM = 520;
const PANEL_MIN = 240;
/** Where the box is brought up to: clear of the 64px navbar, with a little air. */
const PANEL_TOP = 76;

/**
 * Keeps an open dropdown on the screen. Its height is the room left below
 * the box (`anchor`), down to the bottom of what can be seen: the visual
 * viewport, which a phone's keyboard shrinks. A fixed 72vh never noticed
 * the keyboard, so on a phone the panel ran on under it; and on a laptop it
 * ran past the bottom of the window, where the wheel, caught by the panel,
 * could never bring its last rows into view. When it opens short of room
 * (the homepage's box sits mid-page), the page first brings the box up
 * under the navbar, as a phone's search does. Returns the panel's height.
 */
export function usePanelFit(anchor: RefObject<HTMLElement | null>, open: boolean): number | undefined {
  const [maxHeight, setMaxHeight] = useState<number>();
  useLayoutEffect(() => {
    const el = anchor.current;
    if (!open || !el) return;
    const vv = window.visualViewport;
    const seen = () => (vv ? vv.offsetTop + vv.height : window.innerHeight);
    // 24: the panel's 8–12px gap from the box, and as much again below it.
    const measure = () => setMaxHeight(Math.max(PANEL_MIN, Math.floor(seen() - el.getBoundingClientRect().bottom - 24)));
    const r = el.getBoundingClientRect();
    if (seen() - r.bottom < Math.min(PANEL_ROOM, seen() * 0.6) && r.top > PANEL_TOP + 8) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: window.scrollY + r.top - PANEL_TOP, behavior: reduce ? "auto" : "smooth" });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
    };
  }, [anchor, open]);
  return open ? maxHeight : undefined;
}

const fmt = (n: number) => n.toLocaleString("en-US");

function Thumb({ src, alt, size = 40, rounded = "rounded-lg" }: { src: string | null; alt: string; size?: number; rounded?: string }) {
  return (
    <span className={`relative shrink-0 overflow-hidden bg-slate-100 ring-1 ring-slate-200/70 ${rounded}`} style={{ width: size, height: size }}>
      {src ? <Image src={getCdnUrl(src, size >= 56 ? 100 : 50) as string} alt={alt} width={size} height={size} sizes={`${size}px`} className="h-full w-full object-cover" /> : <Layers size={16} className="absolute inset-0 m-auto text-slate-400" />}
    </span>
  );
}

const SECTION = "px-2 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500";

/**
 * The dropdown. `onFill` puts a completion into the box without searching
 * (the ↖ on each row).
 */
export function SearchAssistPanel({
  assist,
  query,
  onFill,
  popular = [],
  className = "",
}: {
  assist: SearchAssistState;
  query: string;
  onFill: (text: string) => void;
  /** Categories to show an empty box before the engine has loaded (the page's own, from the server). */
  popular?: { id: string; name: string; thumbnailUrl: string | null }[];
  className?: string;
}) {
  const { model, items, active, setActive, activate, optionId, listboxId, kit } = assist;
  const popularShown: { id: string; name: string; thumbnailUrl: string | null }[] = kit
    ? kit.popular.map((c) => ({ id: c.id, name: ((c.displayLabel as string | null | undefined) || c.name) as string, thumbnailUrl: c.thumbnailUrl ?? null }))
    : popular;
  // Where each item sits in the keyboard order, by kind and key.
  const at = (pred: (it: AssistItem) => boolean) => items.findIndex(pred);
  const optionProps = (i: number) => ({
    id: optionId(i),
    role: "option" as const,
    "aria-selected": active === i,
    onMouseEnter: () => setActive(i),
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
  });
  const activeCls = (i: number) => (active === i ? "bg-slate-100" : "hover:bg-slate-50");
  const q = query.trim();

  if (!q) {
    return (
      <div id={listboxId} role="listbox" aria-label="Search suggestions" className={className}>
        {/* The camera beside the box is a feature few know to look for: the
            empty box offers it first, by name and what it takes. */}
        {(() => {
          const i = at((it) => it.kind === "photo");
          if (i < 0) return null;
          return (
            <button
              type="button"
              {...optionProps(i)}
              onClick={() => activate({ kind: "photo" })}
              className={`group mb-3 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${active === i ? "border-brand/40 bg-brand/5" : "border-slate-200 hover:border-brand/30 hover:bg-slate-50"}`}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#081f2a] text-white">
                <Camera size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-slate-800">Search with a photo</span>
                <span className="block text-[12px] text-slate-500">Snap, upload or paste a picture of what you need</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-slate-400 transition-colors group-hover:text-brand-dark" />
            </button>
          );
        })()}
        {assist.recent.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between">
              <p className={SECTION}>Recent</p>
              <button type="button" onClick={assist.clearRecent} className="px-2 text-[11px] font-semibold text-slate-500 hover:text-red-600">
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-2 px-1">
              {assist.recent.map((term) => {
                const i = at((it) => it.kind === "phrase" && it.text === term);
                return (
                  <span key={term} className={`group inline-flex items-center rounded-full border border-slate-200 text-sm font-medium text-slate-700 transition-colors ${active === i ? "border-brand/40 bg-brand/5" : "bg-slate-50 hover:border-brand/30"}`}>
                    <button type="button" {...optionProps(i)} onClick={() => activate({ kind: "phrase", text: term })} className="py-1.5 pl-3.5 pr-1">
                      {term}
                    </button>
                    <button type="button" aria-label={`Remove ${term}`} onClick={() => assist.removeRecent(term)} className="mr-1.5 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                      <X size={13} />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <div className="mb-3">
          <p className={SECTION}>
            Search the way you would ask us
          </p>
          <div className="flex flex-wrap gap-2 px-1">
            {EXAMPLES.map((term) => {
              const i = at((it) => it.kind === "phrase" && it.text === term && !assist.recent.includes(term));
              return (
                <button key={term} type="button" {...optionProps(i)} onClick={() => activate({ kind: "phrase", text: term })} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${active === i ? "border-brand/40 bg-brand/5 text-brand-dark" : "border-slate-200 text-slate-600 hover:border-brand/30 hover:text-brand-dark"}`}>
                  {term}
                </button>
              );
            })}
          </div>
        </div>
        {popularShown.length > 0 && (
          <div>
            <p className={SECTION}>Popular categories</p>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {popularShown.slice(0, 8).map((c) => {
                const i = at((it) => it.kind === "category" && it.id === c.id);
                return (
                  <button key={c.id} type="button" {...optionProps(i)} onClick={() => activate({ kind: "category", id: c.id })} className={`flex items-center gap-2 rounded-xl p-1.5 text-left transition-colors ${activeCls(i)}`}>
                    <Thumb src={c.thumbnailUrl} alt="" size={32} />
                    <span className="line-clamp-2 text-[12.5px] font-semibold leading-tight text-slate-700">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  const intent = model?.intent;
  const understood = !!model && (model.corrected || !!intent?.budget || !!intent?.quantity);
  return (
    <div id={listboxId} role="listbox" aria-label="Search suggestions" className={className}>
      {understood && model && intent && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand/[0.07] to-transparent px-2.5 py-2 text-[12.5px]">
          <span className="font-semibold text-brand-dark">We read this as</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200">
            {model.corrected && <SpellCheck size={12} className="text-brand" />}
            {intent.text || "anything"}
          </span>
          {intent.budget && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 font-semibold text-amber-800 ring-1 ring-amber-200">
              <Wallet size={12} />
              {intent.budget.label}
            </span>
          )}
          {intent.quantity && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-800 ring-1 ring-emerald-200">
              <Package size={12} />
              {intent.quantity.label}
            </span>
          )}
          {model.corrected && <span className="text-slate-500">(you typed &ldquo;{model.typed}&rdquo;)</span>}
          {intent.budget && <span className="basis-full pl-0.5 text-[11.5px] text-slate-500">Prices are quoted to order: your budget goes with your request, and we source within it.</span>}
        </div>
      )}

      {model && model.completions.length > 0 && (
        <ul className="mb-1">
          {model.completions.map((c) => {
            const i = at((it) => it.kind === "completion" && it.text === c.text);
            return (
              <li key={c.text} {...optionProps(i)} className={`group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors ${activeCls(i)}`} onClick={() => activate({ kind: "completion", text: c.text })}>
                <Search size={15} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate text-[14.5px]">
                  {c.parts.map((p, j) => (
                    <span key={j} className={p.typed ? "text-slate-600" : "font-semibold text-slate-900"}>
                      {j > 0 ? " " : ""}
                      {p.text}
                    </span>
                  ))}
                </span>
                <button
                  type="button"
                  aria-label={`Use "${c.text}"`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFill(c.text + " ");
                  }}
                  className="shrink-0 rounded-md p-1 text-slate-400 opacity-60 transition hover:bg-white hover:text-brand-dark group-hover:opacity-100"
                >
                  <ArrowUpLeft size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {model?.best && (
        <div className="mb-2 mt-1 rounded-2xl border border-brand/15 bg-gradient-to-br from-brand/[0.06] via-white to-white p-2.5">
          {(() => {
            const best = model.best;
            const i = at((it) => it.kind === "category" && it.id === best.id);
            return (
              <button type="button" {...optionProps(i)} onClick={() => activate({ kind: "category", id: best.id })} className={`flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition-colors ${active === i ? "bg-white shadow-sm" : "hover:bg-white/70"}`}>
                <Thumb src={best.thumbnailUrl} alt="" size={56} rounded="rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10.5px] font-bold uppercase tracking-wider text-brand-dark">Best match</span>
                  <span className="line-clamp-2 text-[16px] font-bold leading-snug text-slate-900">{best.name}</span>
                  <span className="block truncate text-[12px] text-slate-500">
                    {fmt(best.total)} products{best.parentName ? ` · in ${best.parentName}` : ""}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-brand" />
              </button>
            );
          })()}
          {model.best.kinds.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 px-1.5 pb-0.5">
              {model.best.kinds.map((k) => {
                const i = at((it) => it.kind === "category" && it.id === k.id);
                return (
                  <button key={k.id} type="button" {...optionProps(i)} onClick={() => activate({ kind: "category", id: k.id })} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${active === i ? "border-brand/50 bg-white text-brand-dark" : "border-slate-200 bg-white/80 text-slate-700 hover:border-brand/40 hover:text-brand-dark"}`}>
                    {k.name}
                    <span className="font-medium text-slate-400">{fmt(k.total)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {model && model.categories.length > 0 && (
        <div className="mb-1">
          <p className={SECTION}>{model.best ? "Also in" : "Categories"}</p>
          {model.categories.map((c) => {
            const i = at((it) => it.kind === "category" && it.id === c.id);
            return (
              <button key={c.id} type="button" {...optionProps(i)} onClick={() => activate({ kind: "category", id: c.id })} className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors ${activeCls(i)}`}>
                <Thumb src={c.thumbnailUrl} alt="" size={34} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-slate-800">
                  {c.name}
                  {c.parentName && <span className="ml-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">in {c.parentName}</span>}
                </span>
                <span className="shrink-0 text-[11.5px] tabular-nums text-slate-400">{fmt(c.total)}</span>
              </button>
            );
          })}
        </div>
      )}

      {(assist.products.length > 0 || assist.loadingProducts) && (
        <div className="mt-1 border-t border-slate-100 pt-2">
          <p className={SECTION}>
            Top matches {assist.loadingProducts && <Loader2 size={11} className="ml-1 inline animate-spin" />}
          </p>
          <div className={`grid grid-cols-2 gap-1 transition-opacity sm:grid-cols-3 ${assist.productsStale ? "opacity-60" : ""}`}>
            {assist.products.length === 0
              ? Array.from({ length: 3 }, (_, j) => (
                  <div key={j} className="flex items-center gap-2 rounded-xl p-1.5">
                    <span className="h-12 w-12 animate-pulse rounded-lg bg-slate-100" />
                    <span className="h-3 flex-1 animate-pulse rounded bg-slate-100" />
                  </div>
                ))
              : assist.products.map((p) => {
                  const i = at((it) => it.kind === "product" && it.id === p.id);
                  return (
                    <button key={p.id} type="button" {...optionProps(i)} onClick={() => activate({ kind: "product", id: p.id })} className={`flex items-center gap-2 rounded-xl p-1.5 text-left transition-colors ${activeCls(i)}`}>
                      <Thumb src={p.imageUrl} alt="" size={48} />
                      <span className="min-w-0">
                        <span className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-slate-800">{p.name}</span>
                        {p.category && <span className="block truncate text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{p.category}</span>}
                      </span>
                    </button>
                  );
                })}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-col gap-1 border-t border-slate-100 pt-2 sm:flex-row sm:items-center sm:justify-between">
        {(() => {
          const i = at((it) => it.kind === "search");
          return (
            <button type="button" {...optionProps(i)} onClick={() => activate({ kind: "search", text: q })} className={`flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13.5px] transition-colors ${activeCls(i)}`}>
              <Search size={15} className="shrink-0 text-brand-dark" />
              <span className="truncate">
                See all results for <span className="font-semibold text-slate-900">&ldquo;{q}&rdquo;</span>
              </span>
              <CornerDownLeft size={13} className="shrink-0 text-slate-400" />
            </button>
          );
        })()}
        <Link
          href={`/contact/?message=${encodeURIComponent(sourcingMessage(q, model?.intent))}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-[12.5px] font-semibold text-brand-dark hover:bg-brand/5"
        >
          <Handshake size={14} />
          Not quite it? We&apos;ll source it for you
          <ChevronRight size={14} />
        </Link>
      </div>
    </div>
  );
}
