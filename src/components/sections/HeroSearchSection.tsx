"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { TrustBadges } from "@/components/ui/TrustBadges";
import { SearchAssistPanel, usePanelFit, useSearchAssist } from "@/components/search/SearchAssist";
import { QuickLinkPill } from "@/components/ui/QuickLinkPill";
import { ImageSearchButton, OPEN_PHOTO_SEARCH } from "@/components/ui/ImageSearchButton";

/**
 * Only the fields the shortcut row reads.
 *
 * This used to take the homepage's whole CategoryRecord[] — all 668 of them —
 * and pick eight. The page now does that picking on the server, so what
 * arrives here is already the eight, and a narrower type says so.
 */
export interface SearchShortcutCategory {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  productCount: number;
}

/**
 * The homepage's search. Its dropdown is the shared SearchAssist (also the
 * navbar's): completions, the category the words name, products, and how
 * the query was read, worked out as each key is pressed. `categories`
 * (the page's eight largest, from the server) fill the empty box's popular
 * categories until the dropdown's own engine has loaded.
 */
export function HeroSearchSection({ categories = [] }: { categories?: SearchShortcutCategory[] }) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  // The long placeholder needs ~200px of input, which a phone's pill does not
  // have (~145px at 360), so below sm it says less. The server and the first
  // render use the long one, so hydration matches; phones switch after mount.
  const [placeholder, setPlaceholder] = useState("What are you sourcing today?");
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 639.98px)");
    const update = () => setPlaceholder(narrow.matches ? "Search products" : "What are you sourcing today?");
    update();
    narrow.addEventListener("change", update);
    return () => narrow.removeEventListener("change", update);
  }, []);
  const [isMegaMenuOpen, setIsMegaMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handleToggle = (e: Event) => setIsMegaMenuOpen((e as CustomEvent).detail);
    window.addEventListener("megaMenuToggle", handleToggle);
    return () => window.removeEventListener("megaMenuToggle", handleToggle);
  }, []);

  const runSearch = (term: string = query) => {
    if (!term.trim()) return;
    assist.saveRecent(term);
    setIsFocused(false);
    router.push(`/products/?q=${encodeURIComponent(term.trim())}`);
  };
  const goCategory = (id: string) => {
    setIsFocused(false);
    router.push(`/products/?categoryId=${id}`);
  };
  const assist = useSearchAssist({
    query,
    open: isFocused,
    onSearch: (term) => runSearch(term),
    onCategory: goCategory,
    onProduct: (id) => {
      setIsFocused(false);
      router.push(`/products/${id}/`);
    },
    onClose: () => setIsFocused(false),
    // The empty dropdown's "Search with a photo": this dropdown closes, the camera's panel opens.
    onPhotoSearch: () => {
      setIsFocused(false);
      window.dispatchEvent(new Event(OPEN_PHOTO_SEARCH));
    },
  });
  const panelHeight = usePanelFit(containerRef, isFocused);

  // Close the dropdown on any outside click or Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsFocused(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsFocused(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, []);

  return (
    <div
      className={`w-full flex flex-col items-center justify-center pt-4 lg:pt-5 pb-8 lg:pb-10 relative z-[60] transition-opacity duration-300 ${isMegaMenuOpen ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
    >
      {/* The trust badges on their own line, always centred. Then the search
          row. From lg it is a three-column grid, 1fr | minmax(0,640px) | 1fr:
          Full Catalog at the inner edge of the left column, Top Ranking at the
          inner edge of the right. The outer columns are equal and the two
          buttons are the same width, so the space either side of the search
          is identical and the search sits on the page's centre. Below lg the
          search takes the full width and the two buttons pair up, centred,
          under it, in two equal columns. The promo grid below this section
          (MarketplaceHeroSection) takes its edges from this row. */}
      <div className="w-full flex flex-col items-center gap-4">
        {/* Trust badges: auto-sliding ticker on mobile, spotlight row on desktop */}
        <TrustBadges />
        <div className="grid w-full grid-cols-2 items-center gap-3 lg:grid-cols-[1fr_minmax(0,640px)_1fr]">
        {/* z-50 is load-bearing and not decoration. Focusing the input applies
              scale-[1.01], and a transform creates a stacking context — which
              traps the suggestions panel's own z-50 inside this wrapper. The
              Top Ranking / Full Catalog pills below carry .liquid-glass-card,
              whose backdrop-filter makes stacking contexts of them too, and
              being later siblings at z-auto they then paint straight over the
              open dropdown. An explicit z-index here lifts the whole wrapper
              instead, so the panel clears them. */}
          <div className={`relative z-50 col-span-2 w-full max-w-2xl justify-self-center transition-all duration-300 lg:col-span-1 lg:col-start-2 lg:row-start-1 ${isFocused ? "scale-[1.01]" : ""}`} ref={containerRef}>
          {/* The pill: icon, input, camera, Search, in one row that can never
              be wider than the pill. The input is the only part that gives
              way (flex-1 min-w-0); it had no min-w-0, so its intrinsic width
              held, and at 360px the Search button ran ~23px out of the pill.
              6px inner padding below sm (4px from sm, as before), and the
              Search button takes the pill's full inner height. overflow-hidden
              below sm only: from sm the camera's hover tooltip hangs below the
              pill and would be clipped by it (its panels are portals). */}
          <form
            onSubmit={(e) => { e.preventDefault(); runSearch(); }}
            className={`box-border flex h-11 w-full min-w-0 items-center gap-2 p-1.5 max-sm:overflow-hidden sm:p-1 md:h-12 liquid-glass-card hover:!transform-none !rounded-full transition-colors ${isFocused ? "shadow-[0_4px_16px_rgba(39,168,196,0.12)]" : "shadow-sm"}`}
          >
            {/* slate-500, not slate-400. Measured against the pill's white
                background: slate-400 is 2.56:1 and slate-300 is 1.48:1, so
                both miss WCAG AA — 4.5:1 for the placeholder and label text,
                3:1 for icons as non-text controls. slate-500 is 4.76:1 and
                clears both. */}
            <div className="shrink-0 pl-2 text-slate-500 sm:pl-4"><Search size={18} className={isFocused ? "text-brand" : ""} /></div>
            <input
              ref={inputRef}
              {...assist.inputProps}
              type="text"
              className="h-full min-w-0 flex-1 text-ellipsis bg-transparent outline-none text-slate-700 text-sm md:text-base font-medium placeholder:text-slate-500 placeholder:font-normal"
              placeholder={placeholder}
              aria-label="Search products"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="shrink-0 p-1 text-slate-500 hover:text-slate-700"><X size={16} /></button>
            )}
            {/* Search by photo. Sits inside the pill so it reads as part of
                the search control rather than a separate feature. */}
            <ImageSearchButton onOpen={() => setIsFocused(false)} />
            <button type="submit" className="h-full shrink-0 px-4 sm:px-5 md:px-6 bg-brand-dark hover:bg-brand-deep text-white rounded-full font-bold text-sm transition-colors">
              Search
            </button>
          </form>

          {isFocused && (
            <div style={{ maxHeight: panelHeight }} className="absolute top-full left-0 right-0 z-50 mt-3 max-h-[72dvh] overflow-y-auto overscroll-contain rounded-2xl border border-slate-100 bg-white p-3 shadow-2xl custom-scrollbar sm:p-3.5">
              <SearchAssistPanel
                assist={assist}
                query={query}
                popular={categories.map((c) => ({ id: String(c.id), name: c.name, thumbnailUrl: c.thumbnailUrl }))}
                onFill={(text) => {
                  setQuery(text);
                  inputRef.current?.focus();
                }}
              />
            </div>
          )}
        </div>

        {/* The two quick links, one each side of the search from lg. Same
            width: 180px, or the column's width where that is less (both
            columns are always equal). 12px side padding under 360px so the
            labels still fit a 138px column at 320. After the search in the
            DOM on purpose: see the z-50 note above. */}
        <QuickLinkPill
          href="/products/"
          icon="/cata.jpg"
          label="Full Catalog"
          className="w-full max-w-[11.25rem] justify-center justify-self-end max-[359px]:px-3 lg:col-start-1 lg:row-start-1"
        />
        <QuickLinkPill
          href="/rankings/"
          icon="/top-1.jpg"
          label="Top Ranking"
          hoverTextClass="hover:text-amber-600"
          className="w-full max-w-[11.25rem] justify-center justify-self-start max-[359px]:px-3 lg:col-start-3 lg:row-start-1"
        />
        </div>
      </div>
    </div>
  );
}
