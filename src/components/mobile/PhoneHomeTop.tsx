"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, FileText, LayoutGrid, Trophy } from "lucide-react";
import type { ProductCardData } from "@/components/ui/ProductCard";
import { MENU_TILE, MenuGlyph, MenuInkDefs, ShipEmblemGlyph } from "@/components/ui/MenuIcons";
import { useBackDismiss } from "@/lib/useBackDismiss";
import "./phone-chrome.css";

/**
 * The top of the homepage on a phone, below 768px, after Alibaba.com's (the owner, 2026-10-13): under the
 * phone frame's search (PhoneChrome), the catalogue's families in one row that scrolls sideways ("under
 * that see products of sets in side scroll"), All first; the arrow at its end opens them all in a sheet
 * from the bottom. Picking one turns the products under it into that family's, more of them arriving as
 * the end comes near; All brings the homepage's own back. Then a row of ways in (Alibaba's "Source by
 * category", "Request for Quotation", "Top ranking", and AFFHAN Shipping), and the Free China Trip's
 * banner, which the hero hands in.
 *
 * Alibaba's tabs above that row (AI Mode, Products, Manufacturers, Worldwide) are not here: the owner
 * marked them out. AFFHAN sources products, so the page is products.
 *
 * The headline, the figures, the hero's own search and its two buttons are not shown on a phone; from
 * 768px up the hero is as it was.
 */

export interface PhoneFamily {
  id: string;
  name: string;
  /** Products in it and everything under it. */
  count: number;
}

const INK = "phone-ink";

export function PhoneHomeTop({
  families,
  picked,
  onPick,
  trip,
}: {
  families: PhoneFamily[];
  picked: string | null;
  onPick: (id: string | null) => void;
  /** The Free China Trip's banner, as the hero draws it, or nothing. */
  trip?: ReactNode;
}) {
  const [sheet, setSheet] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);

  // The family picked, brought into the row's view (from the sheet it may be off either edge). The row
  // moves, never the page.
  useEffect(() => {
    const row = rowRef.current;
    const tab = row?.querySelector<HTMLElement>(`[data-family="${picked ?? "all"}"]`);
    if (!row || !tab) return;
    const left = tab.offsetLeft;
    if (left >= row.scrollLeft && left + tab.offsetWidth <= row.scrollLeft + row.clientWidth - 40) return;
    row.scrollTo({ left: Math.max(0, left - 16), behavior: "smooth" });
  }, [picked]);

  // A fragment, each part md:hidden: the row is sticky within its parent, so its parent has to be the
  // hero's, which holds the grid too, for the row to stay through the feed rather than leave with the tiles.
  return (
    <>
      <span className="md:hidden">
        <MenuInkDefs id={INK} />
      </span>
      {/* Under the frame's top as the page scrolls, so another family is one tap away anywhere in the feed. */}
      <div className="sticky top-(--nav-h) z-[45] -mx-4 border-b border-slate-200/70 bg-white md:hidden">
        <div className="relative flex h-11 items-stretch">
          <div
            ref={rowRef}
            role="tablist"
            aria-label="Product families"
            className="relative flex min-w-0 flex-1 items-stretch gap-5 overflow-x-auto pl-4 pr-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <FamilyTab id="all" label="All" on={!picked} onClick={() => onPick(null)} />
            {families.map((f) => (
              <FamilyTab key={f.id} id={f.id} label={f.name} on={picked === f.id} onClick={() => onPick(f.id)} />
            ))}
          </div>
          {/* The row's end fades into the arrow, as more waits beyond it. */}
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-11 w-8 bg-gradient-to-l from-white to-transparent" />
          <button
            type="button"
            onClick={() => setSheet(true)}
            aria-label="All product families"
            aria-haspopup="dialog"
            className="grid w-11 shrink-0 place-items-center bg-white text-slate-700 active:bg-slate-50"
          >
            <ChevronDown size={20} />
          </button>
        </div>
      </div>

      {/* Ways in, as Alibaba's row under its tabs: one icon family, the menu drawer's (MenuIcons). */}
      <nav aria-label="Ways to source" className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 pt-3 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
        <WayIn href="/products/" label="Source by category" glyph={<MenuGlyph icon={LayoutGrid} ink={INK} size={18} />} />
        <WayIn href="/contact/" label="Request for Quotation" glyph={<MenuGlyph icon={FileText} ink={INK} size={18} />} />
        <WayIn href="/rankings/" label="Top Ranking" glyph={<MenuGlyph icon={Trophy} ink={INK} size={18} />} />
        <WayIn href="/shipping/" label="AFFHAN Shipping" glyph={<ShipEmblemGlyph />} />
      </nav>

      {trip && <div className="mt-3 md:hidden">{trip}</div>}

      {sheet && (
        <FamilySheet
          families={families}
          picked={picked}
          onPick={(id) => {
            onPick(id);
            setSheet(false);
          }}
          onClose={() => setSheet(false)}
        />
      )}
    </>
  );
}

function FamilyTab({ id, label, on, onClick }: { id: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      data-family={id}
      onClick={onClick}
      className={`relative shrink-0 whitespace-nowrap text-[14.5px] transition-colors ${on ? "font-bold text-slate-900" : "font-medium text-slate-500 active:text-slate-800"}`}
    >
      {label}
      <span aria-hidden className={`absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-brand-dark transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
    </button>
  );
}

function WayIn({ href, label, glyph }: { href: string; label: string; glyph: ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex min-w-[9.5rem] shrink-0 items-center gap-2.5 rounded-xl bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/80 active:bg-slate-50"
    >
      <span className={`${MENU_TILE} !h-9 !w-9`}>{glyph}</span>
      <span className="text-[13px] font-semibold leading-[1.2] text-slate-800">{label}</span>
    </Link>
  );
}

/** Every family, in a sheet from the bottom with a radio for each, as Alibaba's arrow opens. */
function FamilySheet({
  families,
  picked,
  onPick,
  onClose,
}: {
  families: PhoneFamily[];
  picked: string | null;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  useBackDismiss(true, onClose);
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const rows: { id: string | null; name: string }[] = [{ id: null, name: "All" }, ...families];
  return (
    <div className="fixed inset-0 z-[160] md:hidden" role="dialog" aria-modal="true" aria-label="Product families">
      <button type="button" aria-label="Close" onClick={onClose} className="pc-fade absolute inset-0 bg-slate-950/40" />
      <div className="pc-sheet-up absolute inset-x-0 bottom-0 flex max-h-[78dvh] flex-col rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_rgba(15,23,42,0.18)]">
        <div className="flex shrink-0 justify-center pb-2 pt-3">
          <span aria-hidden className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
          {rows.map((f) => {
            const on = picked === f.id;
            return (
              <li key={f.id ?? "all"}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onPick(f.id)}
                  className="flex min-h-[3.25rem] w-full items-center gap-3 rounded-2xl px-3 text-left active:bg-slate-50"
                >
                  <span className={`min-w-0 flex-1 text-[15px] ${on ? "font-semibold text-slate-900" : "text-slate-700"}`}>{f.name}</span>
                  <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full ${on ? "bg-brand-dark" : "ring-[1.5px] ring-inset ring-slate-300"}`}>
                    {on && <span className="size-2.5 rounded-full bg-white" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

const PAGE = 40;
const MAX_PAGES = 10;

/**
 * A family's products for the homepage's grid on a phone, a page at a time from the catalogue's own API
 * (descendants included, moderation applied there), the next page asked for as the sentinel nears the
 * screen: no button (the owner: the grid loads by itself), up to 400.
 */
export function usePhoneFamilyFeed(family: string | null) {
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const pageRef = useRef(0);
  const seq = useRef(0);
  const busy = useRef(false);

  const loadNext = useCallback(async () => {
    if (!family || busy.current || done) return;
    busy.current = true;
    const mine = seq.current;
    const page = pageRef.current + 1;
    setLoading(true);
    try {
      const res = await fetch(`/api/products/?categoryId=${encodeURIComponent(family)}&limit=${PAGE}&page=${page}`);
      const json = (await res.json()) as { data?: ProductCardData[]; pagination?: { totalPages?: number } };
      if (mine !== seq.current) return;
      const got = (json.data ?? []).filter((p) => p.imageUrl);
      pageRef.current = page;
      setProducts((list) => {
        const seen = new Set(list.map((p) => String(p.id)));
        return [...list, ...got.filter((p) => !seen.has(String(p.id)))];
      });
      if (!json.data?.length || page >= Math.min(MAX_PAGES, json.pagination?.totalPages ?? MAX_PAGES)) setDone(true);
    } catch {
      if (mine === seq.current) setDone(true);
    } finally {
      if (mine === seq.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, [family, done]);

  // A new family starts over.
  useEffect(() => {
    seq.current++;
    busy.current = false;
    pageRef.current = 0;
    setProducts([]);
    setDone(false);
    setLoading(false);
  }, [family]);
  useEffect(() => {
    if (family && pageRef.current === 0 && !busy.current) void loadNext();
  }, [family, loadNext]);

  const observer = useRef<IntersectionObserver | null>(null);
  const sentinel = useCallback(
    (el: HTMLElement | null) => {
      observer.current?.disconnect();
      if (!el || !family) return;
      observer.current = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void loadNext(), { rootMargin: "900px 0px" });
      observer.current.observe(el);
    },
    [family, loadNext],
  );

  return { products, loading, done, sentinel };
}
