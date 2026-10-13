"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { flattenLeaves, type CategoryTreeNode } from "@/lib/categoryTree";
import { getCdnUrl } from "@/lib/cdn";
import { ProductCard, type ProductCardData } from "@/components/ui/ProductCard";

/**
 * The catalogue's front on a phone, below 768px: the phone frame's Categories tab, laid out as Alibaba.com's
 * categories screen (the owner, 2026-10-13: "remaining all the sets of alibaba we can replicate"). The
 * families down the left in a rail that stays put, Popular first; the one picked fills the right: its
 * second-level groups, each with its own kinds as round pictures, three across. A picture opens that
 * category in the catalogue, where its products are listed as on any other screen.
 *
 * Only the catalogue's front: a search or a category has the catalogue as it was. From 768px up the
 * catalogue is as it was.
 */

const POPULAR = "popular";

/** The real top level (not the copies promoted beside their parents), of some size, largest first. */
function familiesOf(tree: CategoryTreeNode[]) {
  return tree.filter((n) => !n.promotedCopy && n.recursiveProductCount >= 100).sort((a, b) => b.recursiveProductCount - a.recursiveProductCount);
}

const byCount = (a: CategoryTreeNode, b: CategoryTreeNode) => b.recursiveProductCount - a.recursiveProductCount || a.name.localeCompare(b.name);

/** A family's products for its showcase, fetched once a visit when the family is first picked. */
const showcaseCache = new Map<string, Promise<ProductCardData[]>>();
function familyShowcase(id: string): Promise<ProductCardData[]> {
  if (!showcaseCache.has(id)) {
    showcaseCache.set(
      id,
      fetch(`/api/products/?categoryId=${encodeURIComponent(id)}&limit=12&page=1`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((j: { data?: ProductCardData[] }) => (j.data ?? []).filter((p) => p.imageUrl).slice(0, 10))
        .catch(() => {
          showcaseCache.delete(id);
          return [];
        }),
    );
  }
  return showcaseCache.get(id)!;
}

export function PhoneCategoryBrowser({
  tree,
  showcase = [],
  onInquire,
}: {
  tree: CategoryTreeNode[];
  /** Products to show under Popular (the homepage's own curated draw, from the server). */
  showcase?: ProductCardData[];
  /** A card's quote, opened in place as on every other product card. */
  onInquire: (p: ProductCardData) => void;
}) {
  const families = useMemo(() => familiesOf(tree), [tree]);
  // Popular: the catalogue's biggest kinds across every family, one screen's worth.
  const popular = useMemo(
    () =>
      families
        .flatMap(flattenLeaves)
        .filter((n) => n.displayThumbnail && n.recursiveProductCount > 0)
        .sort(byCount)
        .slice(0, 18),
    [families],
  );
  const [picked, setPicked] = useState<string>(POPULAR);
  const topRef = useRef<HTMLDivElement | null>(null);
  const family = families.find((f) => f.id === picked) ?? null;
  // The showcase under the kinds, as Alibaba's categories screen has "Get product inspiration" under its own
  // (the owner, 2026-10-13: "show case the products card perfectly ... like popular recommendations").
  const [familyCards, setFamilyCards] = useState<{ id: string; list: ProductCardData[] } | null>(null);
  useEffect(() => {
    if (!family) return;
    let live = true;
    void familyShowcase(family.id).then((list) => live && setFamilyCards({ id: family.id, list }));
    return () => {
      live = false;
    };
  }, [family]);
  const cards = family ? (familyCards?.id === family.id ? familyCards.list : null) : showcase;

  const pick = (id: string) => {
    setPicked(id);
    // A family picked further down the page starts from its top, under the frame's.
    const el = topRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 56;
    if (window.scrollY > top) window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
  };

  return (
    // At least the screen between the frame's top and its tabs, the right side white to the bottom, so a short
    // family does not end on the page's grey; the rail keeps its own height and scroll (self-start).
    // The rail's grey down the whole left column (the background, 6.75rem of it), so where the sticky rail
    // has moved on, the column still reads as the rail.
    <div ref={topRef} className="flex min-h-[calc(100dvh-var(--nav-h)-var(--phone-bottom,3.5rem))] bg-[linear-gradient(to_right,#f1f5f9_6.75rem,#fff_6.75rem)] md:hidden">
      <nav
        aria-label="Product families"
        className="sticky top-(--nav-h) h-[calc(100dvh-var(--nav-h)-var(--phone-bottom,3.5rem))] w-[6.75rem] shrink-0 self-start overflow-y-auto overscroll-contain bg-slate-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <RailItem label="Popular" on={picked === POPULAR} onClick={() => pick(POPULAR)} />
        {families.map((f) => (
          <RailItem key={f.id} label={f.name} on={picked === f.id} onClick={() => pick(f.id)} />
        ))}
      </nav>

      <div className="min-w-0 flex-1 bg-white px-3 pb-8 pt-3">
        {family ? (
          <>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="min-w-0 text-[17px] font-bold leading-tight text-slate-900">{family.name}</h2>
              <Link href={`/products/?categoryId=${family.id}`} className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-brand-dark active:text-brand-deep">
                View all <ChevronRight size={14} />
              </Link>
            </div>
            <FamilyGroups family={family} />
          </>
        ) : (
          <>
            <h2 className="mb-3 text-[17px] font-bold leading-tight text-slate-900">Popular categories</h2>
            <KindGrid kinds={popular} />
          </>
        )}
        <Showcase cards={cards} onInquire={onInquire} />
      </div>
    </div>
  );
}

/** Popular products under the kinds: the site's own product cards, two across, each quoted in place. */
function Showcase({ cards, onInquire }: { cards: ProductCardData[] | null; onInquire: (p: ProductCardData) => void }) {
  if (cards && cards.length === 0) return null;
  return (
    <section aria-label="Popular products" className="mt-7 border-t border-slate-100 pt-5">
      <h2 className="mb-3 text-[17px] font-bold leading-tight text-slate-900">Popular products</h2>
      <ul className="grid grid-cols-2 gap-2.5">
        {cards
          ? cards.map((p) => (
              <li key={String(p.id)} className="flex min-w-0">
                <ProductCard product={p} onClick={() => onInquire(p)} />
              </li>
            ))
          : [...Array(4)].map((_, i) => (
              <li key={i} aria-hidden>
                <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-slate-100" />
              </li>
            ))}
      </ul>
    </section>
  );
}

function RailItem({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-current={on ? "true" : undefined}
      onClick={onClick}
      className={`relative block w-full px-3 py-3.5 text-left text-[13px] leading-snug transition-colors ${on ? "bg-white font-semibold text-slate-900" : "text-slate-600 active:bg-slate-200/60"}`}
    >
      {on && <span aria-hidden className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-brand-dark" />}
      {label}
    </button>
  );
}

/** A family's second-level groups, largest first, each with its kinds; a group with none of its own is a kind itself. */
function FamilyGroups({ family }: { family: CategoryTreeNode }) {
  const groups = [...family.children].filter((g) => g.recursiveProductCount > 0).sort(byCount);
  const withKinds = groups.filter((g) => g.children.some((k) => k.recursiveProductCount > 0));
  const lone = groups.filter((g) => !g.children.some((k) => k.recursiveProductCount > 0));
  return (
    <div className="flex flex-col gap-5">
      {withKinds.map((g) => (
        <section key={g.id} aria-label={g.name}>
          <Link href={`/products/?categoryId=${g.id}`} className="mb-2.5 flex items-center justify-between gap-2 text-[14px] font-semibold text-slate-800 active:text-brand-dark">
            <span className="min-w-0 truncate">{g.name}</span>
            <ChevronRight size={15} className="shrink-0 text-slate-400" />
          </Link>
          <KindGrid kinds={[...g.children].filter((k) => k.recursiveProductCount > 0).sort(byCount)} />
        </section>
      ))}
      {lone.length > 0 && (
        <section aria-label={`More in ${family.name}`}>
          {withKinds.length > 0 && <p className="mb-2.5 text-[14px] font-semibold text-slate-800">More in {family.name}</p>}
          <KindGrid kinds={lone} />
        </section>
      )}
    </div>
  );
}

/** Kinds as round pictures, three across, the name under each. */
function KindGrid({ kinds }: { kinds: CategoryTreeNode[] }) {
  return (
    <ul className="grid grid-cols-3 gap-x-2 gap-y-4">
      {kinds.map((k) => {
        const src = getCdnUrl(k.displayThumbnail, 160);
        return (
          <li key={k.id}>
            <Link href={`/products/?categoryId=${k.id}`} className="group flex flex-col items-center gap-1.5 text-center">
              <span className="block aspect-square w-full max-w-[4.5rem] overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/70 transition-transform group-active:scale-95">
                {src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" loading="lazy" decoding="async" width={72} height={72} className="h-full w-full object-cover" />
                )}
              </span>
              <span className="line-clamp-2 text-[12px] leading-tight text-slate-700">{k.name}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
