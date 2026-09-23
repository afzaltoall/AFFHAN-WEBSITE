"use client";

import { useEffect, useMemo, useRef, useState } from "react";
// Only ChevronRight is rendered here — the per-category icons live in
// getCategoryIcon (see lib/categoryTree), which is where they moved to.
import { ChevronRight } from "lucide-react";
import { flattenLeaves, getCategoryIcon, type CategoryTreeNode } from "@/lib/categoryTree";
import { CategoryTile } from "@/components/ui/CategoryTile";
import { CategoryLeafPreview } from "@/components/ui/CategoryLeafPreview";

interface CategoryMegaPanelProps {
  tree: CategoryTreeNode[];
  onNavigate: (categoryId: string) => void;
  // When opened from a specific category (e.g. a sidebar row click), scroll
  // the right panel straight to that category's section.
  initialActiveId?: string | null;
}

export function CategoryMegaPanel({ tree, onNavigate, initialActiveId }: CategoryMegaPanelProps) {
  const [activeId, setActiveId] = useState<string | null>(initialActiveId ?? tree[0]?.id ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // The rail scrolls too. It carries every section — 177 of them on the live
  // taxonomy — so on any category past the first handful the highlighted row
  // sits far below the fold. Scrolling only the right panel left the rail
  // parked at the top, which reads as the panel having ignored the click.
  const railRef = useRef<HTMLDivElement>(null);
  const railRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  /* The category the reader actually chose, held until they scroll themselves.
   *
   * The time-boxed suppression below is not enough on its own. A section near
   * the end of the list cannot be scrolled to the top — there is nothing under
   * it to scroll — so the container stops at its maximum and the scroll-spy,
   * once the window lapses, sees some earlier section at the top and moves the
   * highlight there. Clicking "Fully Printing Hat" then highlighted "Fashion &
   * Clothing", which is the sort of thing that reads as the click going
   * somewhere else entirely.
   */
  const pinnedId = useRef<string | null>(null);
  // Suppresses the scroll-spy while a click-driven smooth scroll is running,
  // so the left rail doesn't flicker through every section it passes.
  const programmaticUntil = useRef(0);

  const sections = useMemo(() => {
    return tree.map(topCat => ({
      id: topCat.id,
      name: topCat.name,
      total: topCat.recursiveProductCount,
      // A promoted leaf has nothing beneath it — flattenLeaves returns the
      // node itself — so its row would be one tile of itself next to "View
      // All". Marked here and filled with products instead, further down.
      // Deliberately derived from the tree rather than from a flag, so a leaf
      // promoted next month behaves the same without anyone remembering.
      isLeaf: topCat.children.length === 0,
      leaves: flattenLeaves(topCat)
        .sort((a, b) => (b.recursiveProductCount - a.recursiveProductCount) || a.name.localeCompare(b.name))
        .slice(0, 23)
    })).filter(s => s.leaves.length > 0);
  }, [tree]);

  const scrollToSection = (id: string, smooth = true) => {
    setActiveId(id);
    pinnedId.current = id;
    const el = sectionRefs.current.get(id);
    const container = scrollRef.current;
    if (el && container) {
      // Long enough to outlast the animation. A smooth scroll the length of
      // this grid runs well past 600ms, and the moment the window lapses the
      // scroll-spy starts reassigning activeId to whatever section is passing
      // — the highlight then races down the rail ahead of the scroll and
      // settles on the wrong row.
      programmaticUntil.current = Date.now() + (smooth ? 1400 : 200);
      container.scrollTo({ top: el.offsetTop - 12, behavior: smooth ? "smooth" : "auto" });
    }

    // And bring the highlighted rail row into view, centred rather than
    // scrolled-to-top: the row above and below give it context, and a row
    // pinned to the very top of a long list looks like the list begins there.
    const railEl = railRefs.current.get(id);
    const rail = railRef.current;
    if (railEl && rail) {
      const centred = railEl.offsetTop - rail.clientHeight / 2 + railEl.clientHeight / 2;
      rail.scrollTo({
        top: Math.max(0, Math.min(centred, rail.scrollHeight - rail.clientHeight)),
        behavior: smooth ? "smooth" : "auto",
      });
    }
  };

  const releasePin = () => { pinnedId.current = null; };

  // Hovering a rail row previews its section on the right; clicking it opens
  // the category. The delay is what makes that bearable — without it, crossing
  // the rail on the way to a tile drags the panel through every section the
  // pointer passes.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewSection = (id: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => scrollToSection(id), 180);
  };
  const cancelPreview = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  };
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

  /* Open at the top, then travel to the category.
   *
   * This used to jump there instantly. Arriving already scrolled tells the
   * reader nothing about where they are: on a rail of 178 categories the panel
   * simply appears mid-list, with no sense of how far down that is or what
   * else the list holds. Scrolling there shows both, and it ties the click to
   * the result — the thing that was missing when the rail did not move at all.
   *
   * Two frames before it starts. One for the panel to paint at the top, one
   * for the section and rail refs to be populated by that paint; starting on
   * the same tick as mount gives scrollTo a container with no laid-out
   * children and it lands nowhere.
   */
  useEffect(() => {
    if (!initialActiveId) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => scrollToSection(initialActiveId, true));
    });
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll-spy: keep the left rail highlight in sync with whichever section
  // is currently at the top of the right panel as the user scrolls.
  const handleScroll = () => {
    if (Date.now() < programmaticUntil.current) return;
    // A chosen category outranks whatever happens to be at the top. Released
    // by releasePin below, on the first scroll the reader makes themselves.
    if (pinnedId.current) return;
    const container = scrollRef.current;
    if (!container) return;
    
    const scrollTop = container.scrollTop;
    
    // If scrolled to the absolute bottom, force highlight the last section
    // because its top offset might never reach the top of the container
    if (Math.ceil(scrollTop + container.clientHeight) >= container.scrollHeight - 10) {
      if (sections.length > 0) {
        setActiveId(sections[sections.length - 1].id);
      }
      return;
    }

    let current = sections[0]?.id ?? null;
    for (const s of sections) {
      const el = sectionRefs.current.get(s.id);
      if (el && el.offsetTop - 40 <= scrollTop) current = s.id;
    }
    if (current) setActiveId(current);
  };

  return (
    <div className="flex bg-white rounded-2xl shadow-xl border border-slate-200/70 overflow-hidden w-[900px] max-h-[70vh]">
      {/* Left icon rail */}
      {/* 288px, measured rather than guessed: at 14px semibold the longest of
          the fifty names ("Women's Outerwear & Jackets") is 207px wide, and the
          icon, gaps and padding around it come to 66 — so a single line needs
          273. It used to be 224, which cut seven names mid-word.

          A name longer than that would clip rather than wrap. Nothing in the
          taxonomy comes close, but if one is promoted later this is the number
          to raise. */}
      <div ref={railRef} className="w-72 shrink-0 bg-slate-50 border-r border-slate-100 py-3 overflow-y-auto custom-scrollbar">
        {sections.map(s => (
          // A row in a list of categories opens that category — the same place
          // its tiles and its "View all" go. It used to only scroll the right
          // panel, which meant clicking the category you wanted, on the list
          // that looks most like a menu, appeared to do nothing at all when
          // that section was already in view. Reading the section without
          // leaving is still possible: hovering the row brings it up.
          <button
            key={s.id}
            ref={(el) => { if (el) railRefs.current.set(s.id, el); }}
            onClick={() => onNavigate(s.id)}
            onMouseEnter={() => previewSection(s.id)}
            onMouseLeave={cancelPreview}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold transition-colors border-l-4 ${
              activeId === s.id
                ? "bg-white text-brand-dark border-brand"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-transparent"
            }`}
          >
            {(() => {
              const Icon = getCategoryIcon(s.name);
              return <Icon size={18} className="shrink-0 stroke-[1.5]" />;
            })()}
            {/* One line, whole. Not truncated — a name cut to "Women's
                Outerwear & Jack…" tells you less than the icon does — and not
                wrapped either, because a two-line row among forty-nine
                one-line rows reads as a mistake. The rail is sized above to
                make that possible. */}
            <span className="flex-1 whitespace-nowrap">{s.name}</span>
          </button>
        ))}
      </div>

      {/* Right: one continuous scrollable panel, one section per category */}
      {/* onWheel/onPointerDown/onKeyDown release the pin, not onScroll —
          onScroll fires for the programmatic animation too and would release
          it immediately. These three are the reader moving the list. */}
      <div
        data-mega-scroll
        ref={scrollRef}
        onScroll={handleScroll}
        onWheel={releasePin}
        onPointerDown={releasePin}
        onKeyDown={releasePin}
        className="relative flex-1 overflow-y-auto custom-scrollbar p-6"
      >
        {sections.map((s, idx) => (
          <div
            key={s.id}
            ref={(el) => { if (el) sectionRefs.current.set(s.id, el); }}
            className={idx > 0 ? "mt-10 pt-8 border-t border-slate-100" : ""}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-slate-800">{s.name}</h3>
              <button
                onClick={() => onNavigate(s.id)}
                className="text-xs font-semibold text-brand-dark hover:opacity-80 transition-opacity"
              >
                View all
              </button>
            </div>
            {/* Six across, not seven. The left rail grew to fit whole
                category names, which left each tile column at 71px — narrow
                enough that the two-line labels started clipping. Six gives
                them 99px, slightly more than they had before the rail moved. */}
            <div className="grid grid-cols-6 gap-x-4 gap-y-6">
              {s.isLeaf ? (
                // Products stand in for the sub-categories a leaf does not
                // have. They are a picture of what is inside, and they lead
                // where the rest of the row leads.
                <CategoryLeafPreview
                  categoryId={s.id}
                  count={6}
                  onOpenCategory={onNavigate}
                />
              ) : (
                s.leaves.map(leaf => (
                  <CategoryTile key={leaf.id} name={leaf.name} thumbnailUrl={leaf.displayThumbnail} hideOnError onClick={() => onNavigate(leaf.id)} />
                ))
              )}
              <button
                onClick={() => onNavigate(s.id)}
                className="flex flex-col items-center gap-2 group text-center"
              >
                <div className="w-[68px] h-[68px] rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center group-hover:border-brand/40 group-hover:bg-brand/5 transition-colors">
                  <ChevronRight size={22} className="text-brand" />
                </div>
                <span className="text-[12px] font-semibold text-brand-dark">View All</span>
              </button>
            </div>
          </div>
        ))}

        {/* Tail room, so the last categories can actually be scrolled to.
            Without it a section near the end can never reach the top of the
            panel — there is nothing beneath it to scroll — so choosing it
            leaves the grid stopped at its maximum with some earlier section
            still at the top, which is exactly what "it did not go where I
            clicked" looked like. Capped at 440px: the panel is
            min(70vh,560px) tall and a section header is about 120px, so this
            is the most that can ever be needed and never leaves a gap bigger
            than one screen. */}
        <div aria-hidden="true" className="h-[min(55vh,440px)]" />
      </div>
    </div>
  );
}
