"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronRight, LayoutGrid } from "lucide-react";
import { flattenLeaves, isGridEligibleRoot, type CategoryTreeNode } from "@/lib/categoryTree";
import { getCdnUrl } from "@/lib/cdn";
import type { ProductCardData } from "@/components/ui/ProductCard";
import { POPULAR_FEED, usePhoneFeed } from "@/components/mobile/usePhoneFeed";
import { CategoryLink } from "@/components/mobile/categoryNav";
import { PhoneGridLoading, PhoneProductCard, PhoneProductCardSkeleton } from "@/components/mobile/PhoneProductCard";

/**
 * The catalogue's front on a phone, below 768px: the phone frame's Categories tab, laid out as Alibaba.com's
 * categories screen (the owner, 2026-10-13: "remaining all the sets of alibaba we can replicate"). Down the
 * left, a rail that stays put, names only as Alibaba's: "For you" (the popular kinds and products), then every
 * category the computer's menu lists at its top (CategoryMegaPanel), largest first (the owner, 2026-10-14:
 * "use that contents"; its icons were tried and taken out). The one picked fills the right: its groups, each
 * with all its kinds as round pictures,
 * three across, and Alibaba's "View all" (the owner, when they were cut to five: "where are the circles");
 * then "Get product inspiration", its products two across, more arriving as the end comes near. A kind opens
 * its own page in place (CategoryLink), without waiting on the server; a product opens its quote in place, as
 * every product card does.
 *
 * Only the catalogue's front: a search or a category has a page of its own. From 768px up the catalogue is as
 * it was.
 */

const FOR_YOU = POPULAR_FEED;

const byCount = (a: CategoryTreeNode, b: CategoryTreeNode) => b.recursiveProductCount - a.recursiveProductCount || a.name.localeCompare(b.name);

export function PhoneCategoryBrowser({
  tree,
  showcase,
  onInquire,
}: {
  tree: CategoryTreeNode[];
  /** For you's first products (the homepage's own curated draw, from the server); the same array each render. */
  showcase?: ProductCardData[];
  /** A card's quote, opened in place as on every other product card. */
  onInquire: (p: ProductCardData) => void;
}) {
  // The computer menu's list: the tree's top, promoted shortcuts included, already largest first; but not the
  // few too small for a place of their own ("Protective Masks", 11 products; "Fully Printing Hat", 3: the
  // owner, 2026-10-14, "dont show this"), which close For you's circles instead (isGridEligibleRoot, the
  // catalogue's own rule for its top tiles).
  const rail = useMemo(() => tree.filter((n) => n.recursiveProductCount > 0 && isGridEligibleRoot(n)), [tree]);
  const minor = useMemo(() => tree.filter((n) => n.recursiveProductCount > 0 && !isGridEligibleRoot(n)), [tree]);
  // For you: the catalogue's biggest kinds, each once (a promoted category stands at the top and in its place).
  const popular = useMemo(() => {
    const seen = new Set<string>();
    return rail
      .flatMap(flattenLeaves)
      .filter((n) => {
        if (!n.displayThumbnail || n.recursiveProductCount <= 0 || seen.has(n.id)) return false;
        seen.add(n.id);
        return true;
      })
      .sort(byCount)
      .slice(0, 18);
  }, [rail]);
  const [picked, setPicked] = useState<string>(FOR_YOU);
  const topRef = useRef<HTMLDivElement | null>(null);
  const node = rail.find((n) => n.id === picked) ?? null;
  const feed = usePhoneFeed(node ? node.id : FOR_YOU, showcase);

  const pick = (id: string) => {
    setPicked(id);
    // One picked further down the page starts from its top, under the frame's.
    const el = topRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 56;
    if (window.scrollY > top) window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
  };

  return (
    // At least the screen between the frame's top and its tabs, the right side white to the bottom, so a short
    // one does not end on the page's grey; the rail keeps its own height and scroll (self-start).
    // The rail's grey down the whole left column (the background, 6.75rem of it), so where the sticky rail
    // has moved on, the column still reads as the rail.
    <div ref={topRef} className="flex min-h-[calc(100dvh-var(--nav-h)-var(--phone-bottom,3.5rem))] bg-[linear-gradient(to_right,#f1f5f9_6.75rem,#fff_6.75rem)] md:hidden">
      <nav
        aria-label="Product families"
        className="sticky top-(--nav-h) h-[calc(100dvh-var(--nav-h)-var(--phone-bottom,3.5rem))] w-[6.75rem] shrink-0 self-start overflow-y-auto overscroll-contain bg-slate-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Alibaba's "For you" (the owner, 2026-10-14), holding the popular recommendations. */}
        <RailItem label="For you" on={picked === FOR_YOU} onClick={() => pick(FOR_YOU)} />
        {rail.map((n) => (
          <RailItem key={n.id} label={n.name} on={picked === n.id} onClick={() => pick(n.id)} />
        ))}
      </nav>

      <div className="min-w-0 flex-1 bg-white px-3 pb-8 pt-3">
        {node ? (
          <>
            <h2 className="text-[17px] font-bold leading-tight text-slate-900">{node.name}</h2>
            {node.promotedCopy && node.promotedParentName && <p className="mt-0.5 text-[12px] text-slate-500">In {node.promotedParentName}</p>}
            <div className="mt-3">{node.children.length ? <FamilyGroups family={node} /> : <Neighbours node={node} tree={tree} />}</div>
          </>
        ) : (
          <>
            <h2 className="mb-3 text-[17px] font-bold leading-tight text-slate-900">Popular categories</h2>
            {/* The small ones close the same grid, with no heading of their own (the owner, 2026-10-14). */}
            <KindGrid kinds={[...popular, ...minor]} />
          </>
        )}
        <Inspiration feed={feed} onInquire={onInquire} />
      </div>
    </div>
  );
}

/** "Get product inspiration": the picked category's products (or For you's), two across, loading as the end nears. */
function Inspiration({ feed, onInquire }: { feed: ReturnType<typeof usePhoneFeed>; onInquire: (p: ProductCardData) => void }) {
  const { products, loading, done, sentinel } = feed;
  if (done && products.length === 0) return null;
  return (
    <section aria-labelledby="phone-inspiration" className="mt-5 border-t border-slate-100 pt-4">
      <h2 id="phone-inspiration" className="mb-3 text-[17px] font-bold leading-tight text-slate-900">
        Get product inspiration
      </h2>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-3.5">
        {products.map((p) => (
          <li key={String(p.id)} className="min-w-0">
            <PhoneProductCard product={p} sizes="(max-width: 767px) 33vw, 200px" onClick={() => onInquire(p)} />
          </li>
        ))}
        {!products.length &&
          !done &&
          [...Array(4)].map((_, i) => (
            <li key={`wait-${i}`} aria-hidden className="min-w-0">
              <PhoneProductCardSkeleton />
            </li>
          ))}
      </ul>
      {loading && products.length > 0 && <PhoneGridLoading />}
      {!done && <div ref={sentinel} aria-hidden className="h-px" />}
    </section>
  );
}

/**
 * A category in the rail, as Alibaba's: its name alone (no icon: the owner, 2026-10-14), in Alibaba's ink, dark
 * and of some weight, bold once picked ("make it text bold same as alibaba"). Every name is laid out as its bold
 * self would be (an invisible bold copy in the same cell), so picking one never re-wraps it: "Health, Beauty &
 * Hair" took a third line in bold and pushed the whole rail under it down.
 */
function RailItem({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-current={on ? "true" : undefined}
      onClick={onClick}
      className={`relative block w-full px-3 py-3.5 text-left text-[13px] leading-snug transition-colors ${on ? "bg-white text-slate-900" : "text-slate-700 active:bg-slate-200/60"}`}
    >
      {on && <span aria-hidden className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-brand-dark" />}
      <span className="grid w-full">
        <span aria-hidden className="invisible col-start-1 row-start-1 font-bold">
          {label}
        </span>
        <span className={`col-start-1 row-start-1 self-center ${on ? "font-bold" : "font-medium"}`}>{label}</span>
      </span>
    </button>
  );
}

/**
 * A category's groups, largest first, each with all its kinds and, last, Alibaba's "View all" (the group's own
 * page); a group with none of its own is a kind itself, and those close it under "More in", their "View all"
 * being the category's.
 */
function FamilyGroups({ family }: { family: CategoryTreeNode }) {
  const groups = [...family.children].filter((g) => g.recursiveProductCount > 0).sort(byCount);
  const withKinds = groups.filter((g) => g.children.some((k) => k.recursiveProductCount > 0));
  const lone = groups.filter((g) => !g.children.some((k) => k.recursiveProductCount > 0));
  return (
    <div className="flex flex-col gap-5">
      {withKinds.map((g) => (
        <section key={g.id} aria-label={g.name}>
          <CategoryLink id={g.id} className="mb-2.5 flex items-center justify-between gap-2 text-[14px] font-semibold text-slate-800 active:text-brand-dark">
            <span className="min-w-0 truncate">{g.name}</span>
            <ChevronRight size={15} className="shrink-0 text-slate-400" />
          </CategoryLink>
          <KindGrid kinds={[...g.children].filter((k) => k.recursiveProductCount > 0).sort(byCount)} all={g} />
        </section>
      ))}
      {lone.length > 0 && (
        <section aria-label={`More in ${family.name}`}>
          {withKinds.length > 0 && <p className="mb-2.5 text-[14px] font-semibold text-slate-800">More in {family.name}</p>}
          <KindGrid kinds={lone} all={family} />
        </section>
      )}
    </div>
  );
}

function findNode(nodes: CategoryTreeNode[], id: string): CategoryTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * A category with no kinds of its own (a kind promoted to the top: Furniture, Earrings): its neighbours as round
 * pictures, itself marked among them, and its family's "View all", so it is not one lone tile.
 */
function Neighbours({ node, tree }: { node: CategoryTreeNode; tree: CategoryTreeNode[] }) {
  const parent = node.parentId ? findNode(tree, node.parentId) : null;
  if (!parent) return <KindGrid kinds={[]} all={node} />;
  return <KindGrid kinds={parent.children.filter((k) => k.recursiveProductCount > 0).sort(byCount)} all={parent} current={node.id} />;
}

/**
 * Kinds as round pictures, three across, the name under each, `current` ringed; `all`, then Alibaba's "View
 * all": a round tile of the same size with the grid mark, opening that category's page.
 */
function KindGrid({ kinds, all, current }: { kinds: CategoryTreeNode[]; all?: CategoryTreeNode; current?: string }) {
  return (
    <ul className="grid grid-cols-3 gap-x-2 gap-y-4">
      {kinds.map((k) => {
        const src = getCdnUrl(k.displayThumbnail, 160);
        const own = k.id === current;
        return (
          <li key={k.id}>
            <CategoryLink id={k.id} aria-current={own ? "true" : undefined} className="group flex flex-col items-center gap-1.5 text-center">
              <span className={`block aspect-square w-full max-w-[4.5rem] overflow-hidden rounded-full bg-slate-100 transition-transform group-active:scale-95 ${own ? "ring-2 ring-brand-dark ring-offset-2" : "ring-1 ring-slate-200/70"}`}>
                {src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" loading="lazy" decoding="async" width={72} height={72} className="h-full w-full object-cover" />
                )}
              </span>
              <span className={`line-clamp-2 text-[12px] leading-tight ${own ? "font-semibold text-slate-900" : "text-slate-700"}`}>{k.name}</span>
            </CategoryLink>
          </li>
        );
      })}
      {all && (
        <li>
          <CategoryLink id={all.id} aria-label={`View all ${all.name}`} className="group flex flex-col items-center gap-1.5 text-center">
            <span className="grid aspect-square w-full max-w-[4.5rem] place-items-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200/70 transition-transform group-active:scale-95">
              <LayoutGrid size={24} strokeWidth={1.6} aria-hidden />
            </span>
            <span className="text-[12px] leading-tight text-slate-700">View all</span>
          </CategoryLink>
        </li>
      )}
    </ul>
  );
}
