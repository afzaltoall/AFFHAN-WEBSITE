"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Layers, LayoutGrid, X } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import type { SupplierCategory, SupplierFamily } from "@/lib/supplier-catalogue";
import { useBackDismiss } from "@/lib/useBackDismiss";
import "@/components/mobile/phone-chrome.css";

/**
 * Choosing a category in the supplier portal on a phone or a tablet, below 1024px, where the computer's rail is
 * not shown: Alibaba's app, as the shop's phone pages already are (the owner, 2026-10-22: "make like alibaba
 * style perfection select category").
 *
 *   FamilyTabs     the families in one row that scrolls sideways under the search, All first, the picked one
 *                  bold and underlined, the arrow at its end opening Select category. The homepage's row
 *                  (PhoneHomeTop), as the owner approved it there.
 *   CircleRow      what is under the category being looked at, as round pictures in two rows that scroll
 *                  sideways, as Alibaba's app opens a category; the catalogue's largest kinds before one is.
 *   CategorySheet  Select category: the shop's categories screen (PhoneCategoryBrowser) in a sheet from the
 *                  bottom. The families down a grey rail, names only; the one picked fills the right with its
 *                  groups, each with all its kinds as round pictures and a round View all.
 *   Trail          where the category sits, each step a way back up (PhoneCategoryPage's trail).
 */

/** Where a category sits in the portal's tree: its family, the steps down to it, and what is under it. */
export interface Place extends SupplierCategory {
  familyId: string;
  /** Its family first, itself last. */
  path: { id: string; name: string }[];
  /** The categories under it, largest first; none for a kind. */
  below: SupplierCategory[];
}

export function placesOf(families: SupplierFamily[]): Map<string, Place> {
  const places = new Map<string, Place>();
  const step = (c: SupplierCategory) => ({ id: c.id, name: c.name });
  for (const f of families) {
    places.set(f.id, { ...step(f), count: f.count, thumbnailUrl: f.thumbnailUrl, familyId: f.id, path: [step(f)], below: f.children });
    for (const g of f.children) {
      places.set(g.id, { ...step(g), count: g.count, thumbnailUrl: g.thumbnailUrl, familyId: f.id, path: [step(f), step(g)], below: g.kinds });
      for (const k of g.kinds) {
        places.set(k.id, { ...step(k), count: k.count, thumbnailUrl: k.thumbnailUrl, familyId: f.id, path: [step(f), step(g), step(k)], below: [] });
      }
    }
  }
  return places;
}

/**
 * The catalogue's largest kinds with a picture, each once: what the page offers before a category is picked, as
 * the shop's categories screen does under "Recommendations". Largest, which is all it claims: the catalogue knows
 * how many products a category holds, not how many are sought.
 */
export function largestKinds(families: SupplierFamily[], n = 18): SupplierCategory[] {
  const seen = new Set<string>();
  return families
    .flatMap((f) => (f.children.length ? f.children.flatMap((g) => (g.kinds.length ? g.kinds : [g])) : [f]))
    .filter((k) => k.thumbnailUrl && k.count > 0 && !seen.has(k.id) && Boolean(seen.add(k.id)))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, n);
}

// ---- the families' row ---------------------------------------------------------------------------------------

export function FamilyTabs({
  families,
  picked,
  onPick,
  onOpenAll,
}: {
  families: SupplierFamily[];
  /** The family being looked at: null for all products, "" for a category in none of them. */
  picked: string | null;
  onPick: (id: string | null) => void;
  onOpenAll: () => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  // The family picked, brought into the row's view (from Select category it may be off either edge). The row
  // moves, never the page.
  useEffect(() => {
    const row = rowRef.current;
    const tab = row?.querySelector<HTMLElement>(`[data-family="${picked ?? "all"}"]`);
    if (!row || !tab) return;
    const left = tab.offsetLeft;
    if (left >= row.scrollLeft && left + tab.offsetWidth <= row.scrollLeft + row.clientWidth - 40) return;
    row.scrollTo({ left: Math.max(0, left - 16), behavior: "smooth" });
  }, [picked]);

  return (
    <div className="relative flex h-11 items-stretch">
      <div
        ref={rowRef}
        role="tablist"
        aria-label="Product families"
        className="relative flex min-w-0 flex-1 items-stretch gap-5 overflow-x-auto pl-4 pr-12 [scrollbar-width:none] sm:pl-6 [&::-webkit-scrollbar]:hidden"
      >
        <FamilyTab id="all" label="All" on={picked === null} onClick={() => onPick(null)} />
        {families.map((f) => (
          <FamilyTab key={f.id} id={f.id} label={f.name} on={picked === f.id} onClick={() => onPick(f.id)} />
        ))}
      </div>
      {/* The row's end fades into the arrow, as more waits beyond it. */}
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-11 w-8 bg-gradient-to-l from-white to-transparent" />
      <button
        type="button"
        onClick={onOpenAll}
        aria-label="Select category"
        aria-haspopup="dialog"
        className="grid w-11 shrink-0 place-items-center bg-white text-slate-700 active:bg-slate-50"
      >
        <ChevronDown size={20} />
      </button>
    </div>
  );
}

/**
 * A family in the row, its name bold once picked. Every tab is as wide as its bold name (an invisible bold copy in
 * the same cell), so picking one never widens it and moves the tabs after it along (PhoneHomeTop's FamilyTab).
 */
function FamilyTab({ id, label, on, onClick }: { id: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      data-family={id}
      onClick={onClick}
      className={`relative shrink-0 whitespace-nowrap text-[14.5px] transition-colors ${on ? "text-slate-900" : "text-slate-500 active:text-slate-800"}`}
    >
      <span className="grid">
        <span aria-hidden className="invisible col-start-1 row-start-1 font-bold">
          {label}
        </span>
        <span className={`col-start-1 row-start-1 text-center ${on ? "font-bold" : "font-medium"}`}>{label}</span>
      </span>
      <span aria-hidden className={`absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-brand-dark transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
    </button>
  );
}

// ---- round pictures ------------------------------------------------------------------------------------------

/** A category as a round picture with its name under it; `on` ringed. `big`: Select category's, three across. */
export function Tile({ category, on, big, eager, onClick }: { category: SupplierCategory; on: boolean; big?: boolean; eager?: boolean; onClick: () => void }) {
  const [broken, setBroken] = useState(false);
  const src = broken ? null : getCdnUrl(category.thumbnailUrl, 160);
  return (
    <button type="button" onClick={onClick} aria-current={on ? "true" : undefined} className="group flex w-full flex-col items-center gap-1.5 text-center">
      <span
        className={`relative block aspect-square w-full overflow-hidden rounded-full bg-slate-100 transition-transform group-active:scale-95 ${big ? "max-w-[4.5rem]" : "max-w-14"} ${
          on ? "ring-2 ring-brand-dark ring-offset-2" : "ring-1 ring-slate-200/70"
        }`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            width={72}
            height={72}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <Layers size={18} className="absolute inset-0 m-auto text-slate-400" aria-hidden />
        )}
      </span>
      <span className={`line-clamp-2 leading-tight ${big ? "text-[12px]" : "text-[11.5px]"} ${on ? "font-semibold text-slate-900" : "text-slate-700"}`}>{category.name}</span>
    </button>
  );
}

/** A round tile with the grid mark: View all (a category's own products) or All categories (Select category). */
export function GridTile({ label, ariaLabel, on, big, onClick }: { label: string; ariaLabel?: string; on?: boolean; big?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={on ? "true" : undefined}
      className="group flex w-full flex-col items-center gap-1.5 text-center"
    >
      <span
        className={`grid aspect-square w-full place-items-center rounded-full bg-slate-100 text-slate-500 transition-transform group-active:scale-95 ${big ? "max-w-[4.5rem]" : "max-w-14"} ${
          on ? "ring-2 ring-brand-dark ring-offset-2" : "ring-1 ring-slate-200/70"
        }`}
      >
        <LayoutGrid size={big ? 24 : 22} strokeWidth={1.6} aria-hidden />
      </span>
      <span className={`leading-tight text-slate-700 ${big ? "text-[12px]" : "text-[11.5px]"}`}>{label}</span>
    </button>
  );
}

/**
 * What is under the category being looked at, as round pictures: two rows that scroll sideways once there are
 * more than fit, as Alibaba's app lays a category's out; one row for a few. Last, All categories, which opens
 * Select category. The pictures load at once: a lazy one off the row's edge stays blank until swiped to.
 */
export function CircleRow({
  label,
  items,
  current,
  onPick,
  onOpenAll,
}: {
  label: string;
  items: SupplierCategory[];
  current: string | null;
  onPick: (id: string) => void;
  onOpenAll: () => void;
}) {
  const two = items.length + 1 > 6;
  return (
    <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden">
      <ul aria-label={label} className={`grid w-max auto-cols-[5rem] grid-flow-col gap-x-1 gap-y-3 ${two ? "grid-rows-2" : "grid-rows-1"}`}>
        {items.map((k) => (
          <li key={k.id}>
            <Tile category={k} on={k.id === current} eager onClick={() => onPick(k.id)} />
          </li>
        ))}
        <li>
          <GridTile label="All categories" onClick={onOpenAll} />
        </li>
      </ul>
    </div>
  );
}

// ---- Select category ------------------------------------------------------------------------------------------

const ALL = "all";

export function CategorySheet({
  families,
  largest,
  total,
  current,
  currentFamily,
  onPick,
  onClose,
}: {
  families: SupplierFamily[];
  largest: SupplierCategory[];
  /** Products in the catalogue, or null when unknown. */
  total: number | null;
  /** The category being looked at, ringed wherever it shows; null for all products. */
  current: string | null;
  currentFamily: string | null;
  onPick: (id: string | null) => void;
  /** The same function every render: it is a dependency. */
  onClose: () => void;
}) {
  // The phone's Back closes the sheet rather than leaving the page.
  useBackDismiss(true, onClose);
  const [rail, setRail] = useState<string>(currentFamily && families.some((f) => f.id === currentFamily) ? currentFamily : ALL);
  const panel = useRef<HTMLDivElement>(null);
  const railNav = useRef<HTMLElement>(null);
  const pane = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The page under the sheet stays where it is; the keyboard's focus moves into the sheet, and back after.
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = before;
      window.removeEventListener("keydown", onKey);
      opener?.focus({ preventScroll: true });
    };
  }, [onClose]);

  // The family it opens on, brought into the rail's view: the rail scrolls, nothing else.
  useEffect(() => {
    const nav = railNav.current;
    const on = nav?.querySelector<HTMLElement>('[aria-current="true"]');
    if (nav && on && on.offsetTop + on.offsetHeight > nav.clientHeight) nav.scrollTop = on.offsetTop - nav.clientHeight / 3;
  }, []);

  const browse = (id: string) => {
    setRail(id);
    pane.current?.scrollTo({ top: 0 });
  };

  const family = families.find((f) => f.id === rail) ?? null;
  const withKinds = family?.children.filter((g) => g.kinds.length > 0) ?? [];
  const lone = family?.children.filter((g) => g.kinds.length === 0) ?? [];

  return (
    <div className="fixed inset-0 z-[160] lg:hidden" role="dialog" aria-modal="true" aria-labelledby="supplier-select-category">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="pc-fade absolute inset-0 bg-slate-950/40" />
      <div
        ref={panel}
        tabIndex={-1}
        className="pc-sheet-up absolute inset-x-0 bottom-0 flex h-[88dvh] flex-col overflow-hidden rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_rgba(15,23,42,0.18)] outline-none"
      >
        <div className="relative flex h-14 shrink-0 items-center justify-center border-b border-slate-100">
          <span aria-hidden className="absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-slate-300" />
          <h2 id="supplier-select-category" className="text-[16px] font-bold text-slate-900">
            Select category
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-slate-600 active:bg-slate-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav
            ref={railNav}
            aria-label="Product families"
            className="relative w-[6.75rem] shrink-0 overflow-y-auto overscroll-contain bg-slate-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <RailItem label="All products" on={rail === ALL} onClick={() => browse(ALL)} />
            {families.map((f) => (
              <RailItem key={f.id} label={f.name} on={rail === f.id} onClick={() => browse(f.id)} />
            ))}
          </nav>

          <div ref={pane} className="min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-8 pt-3.5">
            {family ? (
              <>
                <PaneHead name={family.name} count={family.count} on={current === family.id} onAll={() => onPick(family.id)} />
                <div className="mt-4 flex flex-col gap-5">
                  {withKinds.map((g) => (
                    <section key={g.id} aria-label={g.name}>
                      <button
                        type="button"
                        onClick={() => onPick(g.id)}
                        className="mb-2.5 flex w-full items-center justify-between gap-2 text-left text-[14px] font-semibold text-slate-800 active:text-brand-dark"
                      >
                        <span className="min-w-0 truncate">{g.name}</span>
                        <ChevronRight size={15} className="shrink-0 text-slate-400" aria-hidden />
                      </button>
                      <KindGrid kinds={g.kinds} all={g} current={current} onPick={onPick} />
                    </section>
                  ))}
                  {lone.length > 0 && (
                    <section aria-label={`More in ${family.name}`}>
                      {withKinds.length > 0 && <p className="mb-2.5 text-[14px] font-semibold text-slate-800">More in {family.name}</p>}
                      <KindGrid kinds={lone} current={current} onPick={onPick} />
                    </section>
                  )}
                </div>
              </>
            ) : (
              <>
                <PaneHead name="All products" count={total} on={current === null} onAll={() => onPick(null)} />
                {largest.length > 0 && (
                  <section aria-label="Recommendations" className="mt-4">
                    <p className="mb-2.5 text-[14px] font-semibold text-slate-800">Recommendations</p>
                    <KindGrid kinds={largest} current={current} onPick={onPick} />
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A family in the rail, its name alone, as the shop's categories screen (PhoneCategoryBrowser's RailItem): picked,
 * the name is thickened by a hairline stroke rather than set bold, so it keeps its exact line breaks.
 */
function RailItem({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-current={on ? "true" : undefined}
      onClick={onClick}
      className={`relative block w-full px-3 py-3.5 text-left text-[13px] font-medium leading-snug transition-colors ${
        on ? "bg-white text-slate-900 [-webkit-text-stroke:0.45px_currentColor]" : "text-slate-700 active:bg-slate-200/60"
      }`}
    >
      {on && <span aria-hidden className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-brand-dark" />}
      {label}
    </button>
  );
}

/** The pane's heading: the family (or all products), how many products, and its View all. */
function PaneHead({ name, count, on, onAll }: { name: string; count: number | null; on: boolean; onAll: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-[17px] font-bold leading-tight text-slate-900">{name}</h3>
        {count ? <p className="mt-0.5 text-[12px] tabular-nums text-slate-500">{count.toLocaleString("en-US")} products</p> : null}
      </div>
      <button
        type="button"
        onClick={onAll}
        aria-label={`View all ${name}`}
        aria-current={on ? "true" : undefined}
        className={`inline-flex shrink-0 items-center gap-0.5 rounded-full py-0.5 pl-2 text-[12.5px] font-medium ${on ? "text-brand-dark" : "text-slate-500 active:text-brand-dark"}`}
      >
        View all
        <ChevronRight size={14} aria-hidden />
      </button>
    </div>
  );
}

/** Kinds as round pictures, three across (more on a tablet), `current` ringed; `all`, then a round View all. */
function KindGrid({
  kinds,
  all,
  current,
  onPick,
}: {
  kinds: SupplierCategory[];
  all?: SupplierCategory;
  current: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <ul className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 md:grid-cols-6">
      {kinds.map((k) => (
        <li key={k.id}>
          <Tile category={k} on={k.id === current} big onClick={() => onPick(k.id)} />
        </li>
      ))}
      {all && (
        <li>
          <GridTile label="View all" ariaLabel={`View all ${all.name}`} on={all.id === current} big onClick={() => onPick(all.id)} />
        </li>
      )}
    </ul>
  );
}

// ---- the trail ------------------------------------------------------------------------------------------------

/** Where the category sits, on one line: each step before it a way back up, shortened rather than wrapped. */
export function Trail({ path, onPick }: { path: { id: string; name: string }[]; onPick: (id: string | null) => void }) {
  const here = path[path.length - 1];
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[12.5px] text-slate-500">
        <li className="shrink-0">
          <button type="button" onClick={() => onPick(null)} className="active:text-slate-800">
            All products
          </button>
        </li>
        {path.slice(0, -1).map((a) => (
          <li key={a.id} className="flex min-w-0 items-center gap-1">
            <ChevronRight size={13} className="shrink-0 text-slate-400" aria-hidden />
            <button type="button" onClick={() => onPick(a.id)} className="truncate active:text-slate-800">
              {a.name}
            </button>
          </li>
        ))}
        {here && (
          <li className="flex min-w-0 max-w-[50%] shrink-0 items-center gap-1">
            <ChevronRight size={13} className="shrink-0 text-slate-400" aria-hidden />
            <span aria-current="page" className="truncate text-slate-700">
              {here.name}
            </span>
          </li>
        )}
      </ol>
    </nav>
  );
}
