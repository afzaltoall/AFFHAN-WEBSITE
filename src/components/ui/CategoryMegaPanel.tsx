"use client";

import { useEffect, useMemo, useRef, useState } from "react";
// Only ChevronRight is rendered here — the per-category icons live in
// getCategoryIcon (see lib/categoryTree), which is where they moved to.
import { ChevronRight } from "lucide-react";
import { flattenLeaves, getCategoryIcon, type CategoryTreeNode } from "@/lib/categoryTree";
import { CategoryTile } from "@/components/ui/CategoryTile";

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
  // Suppresses the scroll-spy while a click-driven smooth scroll is running,
  // so the left rail doesn't flicker through every section it passes.
  const programmaticUntil = useRef(0);

  const sections = useMemo(() => {
    return tree.map(topCat => ({
      id: topCat.id,
      name: topCat.name,
      total: topCat.recursiveProductCount,
      leaves: flattenLeaves(topCat)
        .sort((a, b) => (b.recursiveProductCount - a.recursiveProductCount) || a.name.localeCompare(b.name))
        .slice(0, 23)
    })).filter(s => s.leaves.length > 0);
  }, [tree]);

  const scrollToSection = (id: string, smooth = true) => {
    setActiveId(id);
    const el = sectionRefs.current.get(id);
    const container = scrollRef.current;
    if (el && container) {
      programmaticUntil.current = Date.now() + 600;
      container.scrollTo({ top: el.offsetTop - 12, behavior: smooth ? "smooth" : "auto" });
    }
  };

  // Open scrolled to the requested category.
  useEffect(() => {
    if (initialActiveId) scrollToSection(initialActiveId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll-spy: keep the left rail highlight in sync with whichever section
  // is currently at the top of the right panel as the user scrolls.
  const handleScroll = () => {
    if (Date.now() < programmaticUntil.current) return;
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
      <div className="w-56 shrink-0 bg-slate-50 border-r border-slate-100 py-3 overflow-y-auto custom-scrollbar">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => scrollToSection(s.id)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors border-l-4 ${
              activeId === s.id
                ? "bg-white text-brand-dark font-semibold border-brand"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-transparent"
            }`}
          >
            {(() => {
              const Icon = getCategoryIcon(s.name);
              return <Icon size={18} className="shrink-0 stroke-[1.5]" />;
            })()}
            <span className="truncate flex-1">{s.name}</span>
          </button>
        ))}
      </div>

      {/* Right: one continuous scrollable panel, one section per category */}
      <div ref={scrollRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto custom-scrollbar p-6">
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
            <div className="grid grid-cols-7 gap-x-4 gap-y-6">
              {s.leaves.map(leaf => (
                <CategoryTile key={leaf.id} name={leaf.name} thumbnailUrl={leaf.displayThumbnail} hideOnError onClick={() => onNavigate(leaf.id)} />
              ))}
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
      </div>
    </div>
  );
}
