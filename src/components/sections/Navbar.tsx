"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Mail, X, Menu, ChevronDown, ChevronRight, Layers, Loader2, LayoutGrid, Home, Info, Briefcase } from "lucide-react";

const TopRankingIcon = ({ size, className }: { size?: number, className?: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src="/top-1.jpg" alt="Top Ranking" width={size || 20} height={size || 20} style={{ width: size || 20, height: size || 20 }} className={`object-contain scale-[1.8] [clip-path:inset(20%)] ${className || ""}`} />
);
import { AnimatePresence, motion } from "framer-motion";
import { buildCategoryTree, type CategoryRecord } from "@/lib/categoryTree";
import { CategoryMegaPanel } from "@/components/ui/CategoryMegaPanel";
import { getCdnUrl } from "@/lib/cdn";
import { prepCatalogueNav } from "@/lib/scroll";

interface SuggestCategory { id: string; name: string; parentName?: string | null; thumbnailUrl: string | null }
interface SuggestProduct { id: number; name: string; imageUrl: string | null; category?: string | null; categoryRef?: { name: string | null } | null }

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Scroll accessibility: the bar slides up out of the way when you scroll
  // down and slides back the moment you scroll up (or reach the top). It never
  // hides while a menu, search, or suggestion panel is open.
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  
  // Search
  const [navSearchValue, setNavSearchValue] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [results, setResults] = useState<{ categories: SuggestCategory[]; products: SuggestProduct[] }>({ categories: [], products: [] });
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<HTMLFormElement | null>(null);
  
  // Mega Menu Hover State
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const megaMenuHoverTimeout = useRef<NodeJS.Timeout | null>(null);

  // Suggestions
    const [debouncedSearch, setDebouncedSearch] = useState("");

  // Categories Data
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);


  // Fetch Categories for Mega Menu
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch("/api/categories", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch categories");
        const json = await res.json();
        setCategories(json.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingCategories(false);
      }
    };
    fetchCategories();
  }, []);

  // Shared tree builder: prunes any branch (at any depth) with zero products
  // anywhere underneath it — same function the homepage sidebar and catalog
  // page use, so all three show the same set of categories.
  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(navSearchValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [navSearchValue]);

  useEffect(() => {
    const query = debouncedSearch.trim();
    // Amazon/Flipkart-style: no lookups until at least 2 characters — a single
    // letter matched hundreds of thousands of rows and just flickered.
    if (query.length < 2) {
      setResults({ categories: [], products: [] });
      setIsSearching(false);
      return;
    }
    // Cancel any in-flight request so a slow earlier response can never
    // overwrite the newest query's results (that race was the "glitching").
    const controller = new AbortController();
    setIsSearching(true);
    (async () => {
      try {
        const res = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setResults({ categories: data.categories || [], products: data.products || [] });
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") console.error("Failed to fetch ", err);
      } finally {
        // Only the request that wasn't aborted clears the spinner.
        if (!controller.signal.aborted) setIsSearching(false);
      }
    })();
    return () => controller.abort();
  }, [debouncedSearch]);

  // Sync search from URL
  useEffect(() => {
    const q = searchParams.get("q");
    setNavSearchValue(q || "");
  }, [searchParams]);

  // Click outside for search
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsInputFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSuggestionClick = (product: SuggestProduct) => {
    setIsInputFocused(false);
    setNavSearchValue(product.name);
    prepCatalogueNav();
    router.push(`/products?q=${encodeURIComponent(product.name)}`);
  };

  const handleNavbarSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsInputFocused(false);
    if (navSearchValue.trim().length > 0) {
      prepCatalogueNav();
      router.push(`/products?q=${encodeURIComponent(navSearchValue.trim())}`);
    }
  };

  const handleClickCategoryMenu = () => {
    setIsCategoryMenuOpen(true);
  };

  const handleMouseEnterMenu = () => {
    if (megaMenuHoverTimeout.current) clearTimeout(megaMenuHoverTimeout.current);
    setIsCategoryMenuOpen(true);
  };

  const handleMouseLeaveMenu = () => {
    if (megaMenuHoverTimeout.current) clearTimeout(megaMenuHoverTimeout.current);
    megaMenuHoverTimeout.current = setTimeout(() => {
      setIsCategoryMenuOpen(false);
    }, 150);
  };

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('megaMenuToggle', { detail: isCategoryMenuOpen }));
  }, [isCategoryMenuOpen]);

  // The rankings page has a sticky filter bar; the auto-hide + sticky-follow
  // combination caused visible jitter there, so the bar stays fixed on /rankings.
  // We also keep it fixed on the chennai landing page.
  const normalizedPath = pathname.replace(/\/$/, "");
  const disableAutoHide = normalizedPath === "/rankings" || normalizedPath === "/sourcing-company-chennai";

  useEffect(() => {
    if (disableAutoHide) {
      setHidden(false);
      return;
    }
    const onScroll = () => {
      const latest = window.scrollY;
      const previous = lastScrollY.current;
      const goingDown = latest > previous;
      const delta = Math.abs(latest - previous);

      // Any open surface pins the bar visible so it never yanks away mid-use.
      if (mobileMenuOpen || isCategoryMenuOpen || isInputFocused) {
        setHidden(false);
      } else if (latest < 90) {
        setHidden(false);
      } else if (delta > 6) {
        setHidden(goingDown);
      }
      lastScrollY.current = latest;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [mobileMenuOpen, isCategoryMenuOpen, isInputFocused, disableAutoHide]);

  // Publish the bar's current offset so sticky sub-bars (e.g. the rankings
  // filter bar) can sit flush under it and follow it up/down as it hides —
  // otherwise a dead 80px gap opened above them when the bar slid away.
  useEffect(() => {
    document.documentElement.style.setProperty("--nav-shift", hidden ? "0px" : "4rem");
    return () => {
      document.documentElement.style.setProperty("--nav-shift", "4rem");
    };
  }, [hidden]);

  const bare = pathname.replace(/\/$/, "");
  if (bare === "/admin/login") return null;

  return (
    <header className="relative">
      <motion.nav
        animate={{ y: hidden ? "-100%" : "0%" }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="fixed top-0 w-full z-[100] bg-white shadow-sm border-b border-slate-100"
      >
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 gap-4 lg:gap-8">
            
            {/* Logo */}
            <Link href="/" className="flex items-center flex-shrink-0 z-10 mr-4">
              <div className="relative w-12 h-12 lg:w-14 lg:h-14">
                <Image src="/logo.png" alt="Affhan Group Logo" fill priority className="object-contain" />
              </div>
            </Link>

            {/* Desktop Center: Categories Trigger + Search Bar.
                transition-COLORS only (not transition-all): animating `all`
                made the whole bar's width/layout morph every time you moved
                between the homepage (no search box) and other pages — the
                "glitch". Colors/border still animate on focus. */}
            <div className={`hidden lg:flex flex-1 max-w-4xl items-center relative transition-colors ${pathname !== "/" ? "bg-white border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand shadow-sm" : ""}`}>
              
              {/* All Categories Dropdown Trigger */}
              <div 
                className="relative h-full"
                onMouseEnter={handleMouseEnterMenu}
                onMouseLeave={handleMouseLeaveMenu}
              >
                <button 
                  onClick={handleClickCategoryMenu}
                  className={`relative z-50 h-12 px-5 bg-slate-50 flex items-center gap-2.5 text-slate-700 hover:bg-slate-100 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  pathname === "/" ? "rounded-xl border border-slate-200" : "rounded-l-xl border-r border-slate-200"
                }`}>
                  <LayoutGrid className="w-4 h-4 text-brand" />
                  All Categories
                  <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
                </button>

                {/* Categories Dropdown Panel — left icon rail scrolls a
                    single continuous right panel of image-tile sections,
                    matching Alibaba's "All Categories" behavior. A dimmed,
                    blurred backdrop behind it makes it read as a popup
                    rather than a plain dropdown floating with no separation
                    from the page. */}
                <AnimatePresence>
                  {isCategoryMenuOpen && (
                    <>
                      {/* Dim backdrop. Hovering it closes the menu manually since it covers the screen. */}
                      <div
                        className="fixed inset-0 bg-slate-900/25 z-40"
                        onClick={() => setIsCategoryMenuOpen(false)}
                        onMouseEnter={handleMouseLeaveMenu}
                      />
                      <div 
                        className="absolute top-[100%] left-0 mt-2 z-50"
                        onMouseEnter={handleMouseEnterMenu}
                      >
                      {loadingCategories ? (
                        <div className="w-[900px] bg-white rounded-2xl shadow-xl border border-slate-200/70 p-4 space-y-3">
                          {[...Array(8)].map((_, i) => <div key={i} className="h-6 bg-slate-200 rounded animate-pulse" />)}
                        </div>
                      ) : (
                        <CategoryMegaPanel
                          tree={categoryTree}
                          onNavigate={(categoryId) => {
                            setIsCategoryMenuOpen(false);
                            // Hide the /products opening hero + jump to top NOW,
                            // synchronously, so navigating from the mega-menu lands
                            // on the category view with no hero flash.
                            prepCatalogueNav();
                            router.push(`/products?categoryId=${categoryId}`);
                          }}
                        />
                      )}
                      </div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Main Search Input */}
              {pathname !== "/" && (
                <form 
                  ref={searchRef}
                  onSubmit={handleNavbarSearchSubmit} 
                  className="flex-1 flex relative items-center h-12"
                >
                  <Search className="w-5 h-5 text-slate-400 absolute left-4 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="What are you sourcing today?"
                    value={navSearchValue}
                    onChange={(e) => {
                      setNavSearchValue(e.target.value);
                      setIsInputFocused(true);
                    }}
                    onFocus={() => setIsInputFocused(true)}
                    className="w-full h-full pl-11 pr-24 text-sm bg-transparent focus:outline-none placeholder:text-slate-400 relative z-10"
                  />
                  <button type="submit" className="absolute right-1.5 top-1.5 bottom-1.5 px-6 flex items-center justify-center bg-[#1d7e93] text-white rounded-lg hover:bg-brand-dark transition-colors font-medium text-sm cursor-pointer z-20 active:scale-95">
                    Search
                  </button>

                  {/* Desktop Search Suggestions */}
                  {isInputFocused && (results.categories.length > 0 || results.products.length > 0 || isSearching) && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200/70 overflow-hidden z-50">
                      <div className="p-2 flex flex-col max-h-[70vh] overflow-y-auto custom-scrollbar">
                        {isSearching && results.categories.length === 0 && results.products.length === 0 && (
                          <div className="flex items-center gap-2 text-slate-400 text-sm py-6 justify-center"><Loader2 size={16} className="animate-spin" /> Searching…</div>
                        )}

                        {results.categories.length > 0 && (
                          <div className="mb-2">
                            <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Categories</p>
                            {results.categories.map((c, idx) => (
                              <button
                                key={`desktop-suggest-cat-${c.id}-${idx}`}
                                type="button"
                                onClick={() => { setIsInputFocused(false); prepCatalogueNav(); router.push(`/products?categoryId=${c.id}`); }}
                                className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 text-left transition-colors cursor-pointer"
                              >
                                <span className="relative w-9 h-9 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-200 flex items-center justify-center">
                                  {c.thumbnailUrl ? <Image src={c.thumbnailUrl} alt={c.name} fill sizes="36px" className="object-cover" /> : <Layers size={16} className="text-slate-400" />}
                                </span>
                                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 min-w-0">
                                  <Layers size={13} className="text-brand shrink-0" />
                                  <span className="truncate">{c.name} {c.parentName ? <span className="text-[10px] text-slate-400 uppercase tracking-wider ml-1">in {c.parentName}</span> : ""}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}

                        {results.products.length > 0 && (
                          <div className={results.categories.length > 0 ? "pt-2 border-t border-slate-100" : ""}>
                            <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Products</p>
                            {results.products.map((product, idx) => (
                              <button
                                key={`desktop-suggest-prod-${product.id}-${idx}`}
                                type="button"
                                onClick={() => handleSuggestionClick(product)}
                                className="flex w-full items-center gap-3 rounded-xl p-2 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                              >
                                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center">
                                  {product.imageUrl ? (
                                    <Image src={getCdnUrl(product.imageUrl) as string} alt={product.name} fill sizes="40px" className="object-cover" />
                                  ) : (
                                    <span className="text-[10px] text-slate-400">No Img</span>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-bold text-slate-800">{product.name}</span>
                                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-0.5 truncate max-w-full">{product.categoryRef?.name || product.category || "Uncategorized"}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </form>
              )}
            </div>

            {/* Desktop Right Nav (Essential Links) */}
            <div className="hidden lg:flex items-center gap-6 z-10 flex-shrink-0 ml-4">
              <Link href="/about" className="relative group text-sm font-medium text-slate-700 hover:text-brand-dark transition-colors tracking-wide py-2">
                About
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-200"></span>
              </Link>
              <Link href="/careers" className="relative group text-sm font-medium text-slate-700 hover:text-brand-dark transition-colors tracking-wide py-2">
                Careers
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-200"></span>
              </Link>
              <Link href="/contact" className="relative group text-sm font-medium text-slate-700 hover:text-brand-dark transition-colors tracking-wide py-2">
                Contact Us
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-200"></span>
              </Link>


            </div>

            {/* Mobile Nav Triggers */}
            <div className="flex lg:hidden items-center gap-3 z-10">
              <Link href="/" className="flex h-10 w-10 items-center justify-center text-slate-700 hover:text-brand-dark bg-slate-100 rounded-full" aria-label="Search">
                <Search size={20} />
              </Link>
              <button
                className="flex h-10 w-10 items-center justify-center text-slate-700 hover:text-brand-dark cursor-pointer"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-expanded={mobileMenuOpen}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu — slide-in drawer from the right */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="fixed inset-0 z-[110] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={() => setMobileMenuOpen(false)} />
            <motion.aside
              className="absolute right-0 top-0 flex h-full w-[86%] max-w-sm flex-col overflow-hidden rounded-l-3xl bg-white shadow-2xl"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Brand header */}
              <div className="relative shrink-0 bg-gradient-to-br from-brand to-brand-dark px-5 pb-6 pt-5 text-white">
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-md">
                    <Image src="/logo.png" alt="Affhan" width={34} height={34} className="object-contain" />
                  </span>
                  <div className="leading-tight">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Affhan Sourcing</p>
                    <p className="text-lg font-black tracking-tight">Menu</p>
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <nav className="flex-1 overflow-y-auto p-3">
                {[
                  { href: "/", label: "Home", icon: Home },
                  { href: "/rankings", label: "Top Ranking", icon: TopRankingIcon },
                  { href: "/products", label: "All Categories", icon: LayoutGrid },
                  { href: "/about", label: "About Us", icon: Info },
                  { href: "/careers", label: "Careers", icon: Briefcase },
                  { href: "/contact", label: "Contact Us", icon: Mail },
                ].map(item => (
                  <button
                    key={item.href}
                    onClick={() => { setMobileMenuOpen(false); router.push(item.href); }}
                    className="group flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 text-[15px] font-semibold text-slate-700 transition-colors hover:bg-brand/5 hover:text-brand-dark"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-brand/15 group-hover:text-brand">
                      <item.icon size={19} />
                    </span>
                    <span className="flex-1 text-left">{item.label}</span>
                    <ChevronRight size={16} className="text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                  </button>
                ))}
              </nav>

              {/* CTA */}
              <div className="shrink-0 border-t border-slate-100 p-4">
                <button
                  onClick={() => { setMobileMenuOpen(false); router.push("/contact"); }}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1d7e93] py-3.5 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
                >
                  <Mail size={16} /> Request a Quote
                </button>
                <p className="mt-3 text-center text-[11px] text-slate-400">Affhan International Pvt Ltd</p>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
