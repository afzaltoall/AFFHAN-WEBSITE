"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search, Clock, Trash2, TrendingUp, X, Loader2, Layers } from "lucide-react";
import { getCdnUrl } from "@/lib/cdn";
import { TrustBadges } from "@/components/ui/TrustBadges";
import { QuickLinkPill } from "@/components/ui/QuickLinkPill";
import { ImageSearchButton } from "@/components/ui/ImageSearchButton";

interface CatMatch { id: string; name: string; parentName?: string | null; thumbnailUrl: string | null }
interface ProdMatch { id: number; name: string; imageUrl: string | null; category: string | null }

export function HeroSearchSection() {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isMegaMenuOpen, setIsMegaMenuOpen] = useState(false);
  const [popularCats, setPopularCats] = useState<CatMatch[]>([]);
  const [results, setResults] = useState<{ categories: CatMatch[]; products: ProdMatch[] }>({ categories: [], products: [] });
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handleToggle = (e: Event) => setIsMegaMenuOpen((e as CustomEvent).detail);
    window.addEventListener("megaMenuToggle", handleToggle);
    return () => window.removeEventListener("megaMenuToggle", handleToggle);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("recentSearches");
    if (saved) { try { setRecentSearches(JSON.parse(saved)); } catch { } }
    // Real popular categories (top by product count, with a thumbnail).
    fetch("/api/categories")
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(d => {
        const cats = (d.data || [])
          .filter((c: CatMatch & { productCount: number }) => c.thumbnailUrl && c.productCount > 0)
          .sort((a: { productCount: number }, b: { productCount: number }) => b.productCount - a.productCount)
          .slice(0, 8)
          .map((c: CatMatch) => ({ id: c.id, name: c.name, thumbnailUrl: c.thumbnailUrl }));
        setPopularCats(cats);
      })
      .catch(() => { });
  }, []);

  // Live suggestions (debounced). Amazon/Flipkart-style: only from 2+ chars,
  // and stale in-flight requests are aborted so results never flicker.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults({ categories: [], products: [] }); setLoading(false); return; }
    setLoading(true);
    const controller = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search/suggestions?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then(r => (r.ok ? r.json() : { categories: [], products: [] }))
        .then(d => setResults({ categories: d.categories || [], products: d.products || [] }))
        .catch((err) => { if (err?.name !== "AbortError") setResults({ categories: [], products: [] }); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 220);
    return () => { clearTimeout(t); controller.abort(); };
  }, [query]);

  const saveSearch = (term: string) => {
    if (!term.trim()) return;
    const next = [term, ...recentSearches.filter(s => s !== term)].slice(0, 5);
    setRecentSearches(next);
    localStorage.setItem("recentSearches", JSON.stringify(next));
  };

  const runSearch = (term: string = query) => {
    if (!term.trim()) return;
    saveSearch(term);
    router.push(`/products/?q=${encodeURIComponent(term)}`);
  };

  const goCategory = (id: string) => { router.push(`/products/?categoryId=${id}`); };

  const clearRecent = () => { setRecentSearches([]); localStorage.removeItem("recentSearches"); };
  const removeSearch = (e: React.MouseEvent, term: string) => {
    e.stopPropagation();
    const next = recentSearches.filter(s => s !== term);
    setRecentSearches(next);
    localStorage.setItem("recentSearches", JSON.stringify(next));
  };

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

  const hasQuery = query.trim().length >= 1;

  return (
    <div
      className={`w-full flex flex-col items-center justify-center pt-4 lg:pt-5 pb-8 lg:pb-10 relative z-[60] transition-opacity duration-300 ${isMegaMenuOpen ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
    >
      {/* Search stays centered; the Top Ranking / Full Catalog quick links sit
          on the RIGHT via balanced flex-1 spacers, so the search doesn't shift
          off-centre. On mobile everything stacks and centres. */}
      <div className="w-full flex flex-col items-center gap-4 lg:flex-row lg:items-center lg:justify-center">
        {/* Trust badges: auto-sliding ticker on mobile, spotlight row on desktop */}
        <TrustBadges />
        <div className={`relative w-full max-w-2xl transition-all duration-300 ${isFocused ? "scale-[1.01]" : ""}`} ref={containerRef}>
          <form
            onSubmit={(e) => { e.preventDefault(); runSearch(); }}
            className={`flex items-center w-full h-11 md:h-12 liquid-glass-card hover:!transform-none !rounded-full transition-colors ${isFocused ? "shadow-[0_4px_16px_rgba(39,168,196,0.12)]" : "shadow-sm"}`}
          >
            {/* slate-500, not slate-400. Measured against the pill's white
                background: slate-400 is 2.56:1 and slate-300 is 1.48:1, so
                both miss WCAG AA — 4.5:1 for the placeholder and label text,
                3:1 for icons as non-text controls. slate-500 is 4.76:1 and
                clears both. */}
            <div className="pl-5 pr-2 text-slate-500"><Search size={18} className={isFocused ? "text-brand" : ""} /></div>
            <input
              type="text"
              className="flex-1 h-full bg-transparent outline-none text-slate-700 text-sm md:text-base font-medium placeholder:text-slate-500 placeholder:font-normal"
              placeholder="What are you sourcing today?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="p-1 text-slate-500 hover:text-slate-700"><X size={16} /></button>
            )}
            {/* Search by photo. Sits inside the pill so it reads as part of
                the search control rather than a separate feature. */}
            <ImageSearchButton className="mr-2" />
            <button type="submit" className="h-[calc(100%-8px)] px-5 md:px-6 mr-1 bg-brand hover:bg-brand-dark text-white rounded-full font-bold text-sm transition-colors">
              Search
            </button>
          </form>

          {isFocused && (
            <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 z-50 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {hasQuery ? (
                <>
                  {loading && results.categories.length === 0 && results.products.length === 0 && (
                    <div className="flex items-center gap-2 text-slate-500 text-sm py-6 justify-center"><Loader2 size={16} className="animate-spin" /> Searching…</div>
                  )}

                  {results.categories.length > 0 && (
                    <div className="mb-2">
                      <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Categories</p>
                      {results.categories.map(c => (
                        <button key={c.id} onClick={() => goCategory(c.id)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 text-left transition-colors">
                          <span className="relative w-9 h-9 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                            {c.thumbnailUrl && <Image src={getCdnUrl(c.thumbnailUrl, 50) as string} alt={c.name} fill sizes="36px" className="object-cover" />}
                          </span>
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 min-w-0">
                            <Layers size={13} className="text-brand shrink-0" />
                            <span className="truncate">{c.name} {c.parentName ? <span className="text-[10px] text-slate-500 uppercase tracking-wider ml-1">in {c.parentName}</span> : ""}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {results.products.length > 0 && (
                    <div className={results.categories.length > 0 ? "pt-2 border-t border-slate-100" : ""}>
                      <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Products</p>
                      {results.products.map(p => (
                        <button key={p.id} onClick={() => runSearch(p.name)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 text-left transition-colors">
                          <span className="relative w-10 h-10 rounded-lg overflow-hidden bg-slate-100 border border-slate-100 shrink-0">
                            {p.imageUrl && <Image src={getCdnUrl(p.imageUrl, 100) as string} alt={p.name} fill sizes="40px" className="object-cover" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-800 truncate">{p.name}</span>
                            <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">{p.category || "Product"}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {!loading && results.categories.length === 0 && results.products.length === 0 && (
                    <button onClick={() => runSearch()} className="w-full text-left px-3 py-3 text-sm text-slate-500 hover:bg-slate-50 rounded-xl">
                      Search for &quot;<span className="font-semibold text-slate-700">{query}</span>&quot; →
                    </button>
                  )}
                </>
              ) : (
                <>
                  {recentSearches.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2 px-1">
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><Clock size={16} className="text-slate-500" /> Recent Searches</h3>
                        <button onClick={clearRecent} className="text-xs font-medium text-slate-500 hover:text-red-500 flex items-center gap-1 transition-colors"><Trash2 size={14} /> Clear</button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {recentSearches.map((term, i) => (
                          <div key={i} className="group flex items-center gap-1 bg-slate-50 hover:bg-brand/5 border border-slate-200 hover:border-brand/30 text-slate-700 hover:text-brand-dark rounded-full px-4 py-2 text-sm font-medium cursor-pointer transition-colors" onClick={() => runSearch(term)}>
                            <span>{term}</span>
                            <button className="ml-1 p-0.5 rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-700 opacity-0 group-hover:opacity-100 transition-all" onClick={(e) => removeSearch(e, term)}><X size={14} /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-2 px-1"><TrendingUp size={16} className="text-brand" /> Popular Categories</h3>
                    <div className="flex flex-wrap gap-2">
                      {popularCats.map(c => (
                        <button key={c.id} onClick={() => goCategory(c.id)} className="bg-slate-50 hover:bg-brand/5 border border-slate-100 hover:border-brand/30 text-slate-600 hover:text-brand-dark rounded-lg px-3.5 py-2 text-sm font-medium transition-colors">
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right-side quick entry points — Top Ranking / Full Catalog */}
        <div className="flex items-center justify-center gap-2.5 lg:flex-1 lg:justify-start">
          <QuickLinkPill href="/rankings/" icon="/top-1.jpg" label="Top Ranking" hoverTextClass="hover:text-amber-600" />
          <QuickLinkPill href="/products/" icon="/cata.jpg" label="Full Catalog" />
        </div>
      </div>
    </div>
  );
}
