"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Camera, Gift, Home, MessageSquareText, Search, X, type LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ImageSearchButton } from "@/components/ui/ImageSearchButton";
import { SearchAssistPanel, useSearchAssist } from "@/components/search/SearchAssist";
import { overlayWillNavigate, useBackDismiss } from "@/lib/useBackDismiss";
import { phoneChromeFor, PHONE_TABS_HEIGHT, sitePath } from "@/lib/phoneChrome";
import { useIsPhone } from "@/lib/useIsPhone";
import { usePhoneSearchContext } from "@/components/mobile/phoneSearchContext";
import "./phone-chrome.css";

/**
 * A phone's frame for the site, below 768px, after Alibaba.com's mobile site
 * (the owner, 2026-10-13: "no navbar for mobile", the tabs "in down"):
 *
 *  - across the top, always there: the logo, and a search box whose hint
 *    turns through the catalogue's big categories, each with its own small
 *    picture ("the placeholder of text have to changes with icons of images
 *    in mini"). A tap opens the search on the whole screen, with the shared
 *    engine (SearchAssist) the navbar and the homepage use. The camera is
 *    the photo search, as in the homepage's box.
 *  - along the bottom, an app's tab bar: Home, Categories, Inquiries,
 *    Account. Alibaba's Messenger and Cart have no AFFHAN counterpart (no
 *    chat of our own: brand.ts publishes WhatsApp only for the Dubai and
 *    Malaysia offices; no cart: quotes, not orders), so Inquiries, where a
 *    buyer's requests live, stands where Cart was.
 *  - over the tabs, to someone not signed in, the invitation to, which they
 *    may put away for the visit.
 *
 * Which pages have it is lib/phoneChrome.ts; the navbar stands down on a
 * phone where this shows. Rendered outside the navbar's Suspense boundary
 * (app/layout.tsx), so on static pages the frame is in the first paint
 * rather than drawn after the JS (navbar-first-paint). From 768px up it is
 * not shown, and the parts that need a phone (the camera, the hint's
 * pictures) are not even mounted there.
 */

interface Hint {
  id: string;
  name: string;
  image: string | null;
}

const STRIP_KEY = "affhan:signin-strip";

/** The hint's categories (/api/search/popular/), once a visit, shared by every box that shows them. */
let hintsOnce: Promise<Hint[]> | null = null;
function loadHints(): Promise<Hint[]> {
  if (!hintsOnce) {
    hintsOnce = fetch("/api/search/popular/")
      .then((r) => (r.ok ? r.json() : { popular: [] }))
      .then((j: { popular?: Hint[] }) => j.popular ?? [])
      .catch(() => {
        hintsOnce = null;
        return [];
      });
  }
  return hintsOnce;
}

/**
 * The turning hint: fetched when the browser is idle, never in the page's
 * first work; one every 3.2s while the tab is in view; held on the first for
 * anyone who asked for less motion.
 */
function useHint(enabled: boolean) {
  const [hints, setHints] = useState<Hint[]>([]);
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const start = () => void loadHints().then((h) => live && setHints(h));
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const h = w.requestIdleCallback(start, { timeout: 3000 });
      return () => {
        live = false;
        w.cancelIdleCallback?.(h);
      };
    }
    const t = window.setTimeout(start, 1500);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [enabled]);
  useEffect(() => {
    if (hints.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setAt((i) => (i + 1) % hints.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [hints.length]);
  return { hints, hint: hints.length ? hints[at % hints.length] : null };
}

export function PhoneChrome() {
  const pathname = usePathname() ?? "/";
  const kind = phoneChromeFor(pathname);
  const phone = useIsPhone();
  const { hints, hint } = useHint(phone && kind === "full");
  // A category's own page names itself in the box (PhoneCategoryPage).
  const context = usePhoneSearchContext();
  const [searching, setSearching] = useState(false);
  const cameraRef = useRef<HTMLSpanElement | null>(null);
  // Not over the account's own pages, nor the Account tab (/me/), which carry their own way to sign in.
  const strip = useSignInStrip(kind === "full" && !pathname.startsWith("/account") && !/^\/me(\/|$)/.test(pathname));

  // A page moved to closes the search (a link inside it, or Back).
  useEffect(() => setSearching(false), [pathname]);

  // How far up from the bottom the frame reaches, for whatever has to end above it (the categories screen's
  // rail, PhoneCategoryBrowser).
  useEffect(() => {
    const root = document.documentElement;
    if (kind !== "full") {
      root.style.removeProperty("--phone-bottom");
      return;
    }
    root.style.setProperty("--phone-bottom", `calc(${PHONE_TABS_HEIGHT} + ${strip.shown ? "3rem" : "0px"} + env(safe-area-inset-bottom))`);
    return () => {
      root.style.removeProperty("--phone-bottom");
    };
  }, [kind, strip.shown]);

  if (kind === "none") return null;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[100] border-b border-slate-100 bg-white md:hidden">
        <div className="flex h-(--nav-h) items-center gap-2.5 pl-3 pr-2.5">
          <Link href="/" aria-label="AFFHAN, home" className="shrink-0">
            <Image src="/logo.png" alt="AFFHAN" width={80} height={80} priority className="h-10 w-10 object-contain" />
          </Link>
          {kind === "full" && (
            <div className="flex h-10 min-w-0 flex-1 items-center gap-0.5 rounded-full bg-slate-100 pl-3.5 pr-1 ring-1 ring-slate-200/80">
              <button
                type="button"
                onClick={() => setSearching(true)}
                aria-label={context ? `Search, now in ${context}` : hint ? `Search products, such as ${hint.name}` : "Search products"}
                className="flex h-full min-w-0 flex-1 items-center overflow-hidden text-left"
              >
                {/* On a category's own page, its name, as Alibaba's box says "laptops" on its Laptops page. */}
                {context ? <span className="truncate text-[14px] text-slate-800">{context}</span> : <HintLine hint={hint} />}
              </button>
              {/* The photo search's own button, on a phone only: every mounted one answers the "open photo
                  search" event, so one hidden here on a computer would open a second panel there. Until
                  then, its likeness, so nothing moves when it arrives. */}
              <span ref={cameraRef} className="pc-cam flex shrink-0">
                {phone ? (
                  <ImageSearchButton onOpen={() => setSearching(false)} />
                ) : (
                  <span aria-hidden className="flex items-center">
                    <span className="mr-1.5 h-5 w-px bg-slate-200" />
                    <span className="inline-flex size-9 items-center justify-center rounded-full text-slate-600">
                      <Camera size={16} />
                    </span>
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setSearching(true)}
                aria-label="Search"
                className="grid h-8 w-11 shrink-0 place-items-center rounded-full bg-brand-dark text-white transition-colors active:bg-brand-deep"
              >
                <Search size={17} strokeWidth={2.4} />
              </button>
            </div>
          )}
        </div>
      </header>

      {kind === "full" && (
        <>
          {strip.shown && <SignInStrip pathname={pathname} onDismiss={strip.dismiss} />}
          <PhoneTabs pathname={pathname} />
          {/* The page's own room under it, so its last lines and the footer clear the bar. */}
          <div
            aria-hidden
            className="md:hidden"
            style={{ height: `calc(${PHONE_TABS_HEIGHT} + ${strip.shown ? "3rem" : "0px"} + env(safe-area-inset-bottom))` }}
          />
        </>
      )}

      {searching && <SearchSheet hint={hint} hints={hints} initial={context ?? ""} cameraRef={cameraRef} onClose={() => setSearching(false)} />}
    </>
  );
}

/** The hint in the box: the category's small picture and its name, the next one rising into its place. */
function HintLine({ hint }: { hint: Hint | null }) {
  if (!hint) return <span className="truncate text-[14px] text-slate-500">Search products</span>;
  return (
    <span key={hint.id} className="pc-hint flex min-w-0 items-center gap-2">
      {hint.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hint.image} alt="" width={22} height={22} decoding="async" className="h-[22px] w-[22px] shrink-0 rounded-full object-cover ring-1 ring-black/[0.06]" />
      )}
      <span className="truncate text-[14px] text-slate-500">{hint.name}</span>
    </span>
  );
}

/** Custom Categories icon: 3 rounded squares + magnifying glass in bottom-right (Alibaba style). */
function CategoriesIcon({ size = 20, strokeWidth = 1.5, ...props }: { size?: number; strokeWidth?: number; fill?: string; stroke?: string; className?: string;[k: string]: unknown }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="8" height="8" rx="0.5" />
      <rect x="13" y="3" width="8" height="8" rx="0.5" />
      <rect x="3" y="13" width="8" height="8" rx="0.5" />
      <circle cx="17" cy="17" r="3.8" fill="white" />
      <line x1="19.7" y1="19.7" x2="22" y2="22" />
    </svg>
  );
}

/** Custom My Affhan icon: person inside a circle outline (Alibaba style). */
function MyAffhanIcon({ size = 20, strokeWidth = 1.5, fill = "none", ...props }: { size?: number; strokeWidth?: number; fill?: string; stroke?: string; className?: string;[k: string]: unknown }) {
  const isFilled = fill && fill !== "none";
  if (isFilled) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="10" fill="currentColor" stroke="currentColor" />
        <circle cx="12" cy="10" r="3" fill="white" stroke="white" strokeWidth={0.5} />
        <path
          d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662 A 10 10 0 0 1 7 20.662 Z"
          fill="white"
          stroke="white"
          strokeWidth={0.5}
        />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
    </svg>
  );
}

const TABS: { href: string; label: string; Icon: LucideIcon | typeof CategoriesIcon | typeof MyAffhanIcon; on: (p: string) => boolean; ahead?: boolean }[] = [
  { href: "/", label: "Home", Icon: Home, on: (p: string) => p === "/" },
  // The catalogue's front as the categories screen, ?view=categories: the server then leaves out the computer's
  // grid, most of the page's time (products/page.tsx). Fetched ahead (prefetch): the front is drawn per
  // request, and a press waited for all of it (2026-10-14). Home and Account are static, which a link fetches
  // ahead by itself.
  { href: "/products/?view=categories", label: "Categories", Icon: CategoriesIcon, on: (p: string) => p === "/products", ahead: true },
  { href: "/account/inquiries/", label: "Inquiries", Icon: MessageSquareText, on: (p: string) => p.startsWith("/account/inquiries") },
  // The tab opens /me/ (MyAffhanMenu), open to everyone; the account's own pages light it too.
  { href: "/me/", label: "My AFFHAN", Icon: MyAffhanIcon, on: (p: string) => p === "/me" || p.startsWith("/me/") || (p.startsWith("/account") && !p.startsWith("/account/inquiries")) },
];

function PhoneTabs({ pathname }: { pathname: string }) {
  // sitePath: the cached homepage is regenerated as "/index", and the Home tab has to be current in that
  // server HTML itself. Hydration does not patch an `aria-current` or colour the server got wrong, and the
  // browser's own path is already "/" by then, so nothing later would change it either.
  const bare = sitePath(pathname);
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-[100] border-t border-slate-200/80 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-4" style={{ height: PHONE_TABS_HEIGHT }}>
        {TABS.map(({ href, label, Icon, on, ahead }) => {
          const active = on(bare);
          return (
            <li key={href}>
              <Link
                href={href}
                prefetch={ahead ? true : undefined}
                aria-current={active ? "page" : undefined}
                // The tab of the page one is on takes it back to its top, as an app's does (the site's floating
                // back-to-top button is not on these pages, WhatsAppButton); but on a category's own page (the
                // catalogue with ?categoryId=), Categories goes back to the categories screen.
                onClick={(e) => {
                  if (!active || window.scrollY < 8 || (href.startsWith("/products/") && /[?&](categoryId|q)=/.test(window.location.search))) return;
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${active ? "text-brand-dark" : "text-slate-500 active:text-slate-800"}`}
              >
                {label === "Home" && active ? (
                  <span className="relative">
                    <Icon size={20} strokeWidth={1.5} fill="currentColor" aria-hidden />
                    <span className="absolute bottom-[1px] left-1/2 h-[6px] w-[5px] -translate-x-1/2 bg-white" />
                  </span>
                ) : (
                  <Icon size={20} strokeWidth={active ? 1.5 : 1.5} fill={active ? "currentColor" : "none"} aria-hidden />
                )}
                <span className={`whitespace-nowrap ${active ? "font-semibold" : ""}`}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Whether the invitation to sign in shows: to someone signed out, once /me has said so, until put away for the visit. */
function useSignInStrip(eligible: boolean) {
  const { user, loading } = useAuth();
  const [away, setAway] = useState(true);
  useEffect(() => {
    try {
      setAway(sessionStorage.getItem(STRIP_KEY) === "away");
    } catch {
      setAway(false);
    }
  }, []);
  return {
    shown: eligible && !loading && !user && !away,
    dismiss: () => {
      setAway(true);
      try {
        sessionStorage.setItem(STRIP_KEY, "away");
      } catch {
        /* a private window: away for this page only */
      }
    },
  };
}

function SignInStrip({ pathname, onDismiss }: { pathname: string; onDismiss: () => void }) {
  return (
    <div className="fixed inset-x-0 z-[99] md:hidden" style={{ bottom: `calc(${PHONE_TABS_HEIGHT} + env(safe-area-inset-bottom))` }}>
      <div className="flex h-12 items-center gap-2.5 border-t border-brand/15 bg-[#eaf6f9] pl-3 pr-1.5">
        <Gift size={20} className="shrink-0 text-brand-dark" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800">Sign in to track your quotes</p>
        <Link
          href={`/login/?redirect=${encodeURIComponent(pathname)}`}
          className="shrink-0 rounded-full bg-brand-dark px-4 py-1.5 text-[13px] font-bold text-white active:bg-brand-deep"
        >
          Sign in
        </Link>
        <button type="button" onClick={onDismiss} aria-label="Not now" className="grid size-8 shrink-0 place-items-center rounded-full text-slate-500 active:bg-black/5">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * The search on the whole screen, as Alibaba's: the box at the top with Cancel, and under it what the
 * shared engine offers (SearchAssist): with nothing typed, the photo search, recent searches, examples and
 * the big categories; as one types, completions, the category the words name, and products. The keyboard
 * opens with it, as asked for by the tap that opened it. An empty box searched goes to the hint's category.
 */
function SearchSheet({
  hint,
  hints,
  initial,
  cameraRef,
  onClose,
}: {
  hint: Hint | null;
  hints: Hint[];
  /** What the box already says (a category's name on its own page), selected, so typing replaces it. */
  initial: string;
  cameraRef: RefObject<HTMLSpanElement | null>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  // The hint as it was when the sheet opened, so the box's placeholder does not change under the thumb.
  const [shown] = useState(hint);
  useBackDismiss(true, onClose);

  const go = (href: string) => {
    overlayWillNavigate();
    onClose();
    router.push(href);
  };
  const runSearch = (term: string = query) => {
    const t = term.trim();
    if (!t) {
      if (shown) go(`/products/?categoryId=${shown.id}`);
      return;
    }
    assist.saveRecent(t);
    go(`/products/?q=${encodeURIComponent(t)}`);
  };
  const assist = useSearchAssist({
    query,
    open: true,
    onSearch: (t) => runSearch(t),
    onCategory: (id) => go(`/products/?categoryId=${id}`),
    onProduct: (id) => go(`/products/${id}/`),
    onClose,
    // The header's camera, pressed for real: its panel sits under that button.
    onPhotoSearch: () => {
      onClose();
      requestAnimationFrame(() => cameraRef.current?.querySelector<HTMLButtonElement>("button")?.click());
    },
  });

  useEffect(() => {
    // The page under the sheet stays where it was.
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="Search products" className="pc-sheet fixed inset-0 z-[150] flex flex-col bg-white md:hidden">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
        className="flex h-(--nav-h) shrink-0 items-center gap-1.5 border-b border-slate-100 pl-3 pr-1"
      >
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-slate-100 pl-3.5 pr-1.5 ring-1 ring-slate-200/80 focus-within:ring-2 focus-within:ring-brand/40">
          <Search size={17} className="shrink-0 text-slate-500" aria-hidden />
          {/* autoFocus, not a focus() in an effect: React focuses it as it commits, still inside the tap that
              opened the sheet, which is what lets a phone's browser raise the keyboard (on the moto g45 an
              effect's focus() came too late and the box sat unfocused). The sheet is only ever drawn in the
              browser, so there is no server autofocus to fall out with. */}
          <input
            ref={inputRef}
            {...assist.inputProps}
            autoFocus
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder={shown ? shown.name : "Search products"}
            aria-label="Search products"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-slate-800 outline-none placeholder:text-slate-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="grid size-7 shrink-0 place-items-center rounded-full text-slate-500 active:bg-black/5"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <button type="button" onClick={onClose} className="shrink-0 px-2.5 py-2 text-[15px] font-medium text-slate-700 active:text-slate-950">
          Cancel
        </button>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-8 pt-3">
        <SearchAssistPanel
          assist={assist}
          query={query}
          popular={hints.map((h) => ({ id: h.id, name: h.name, thumbnailUrl: h.image }))}
          onFill={(text) => {
            setQuery(text);
            inputRef.current?.focus();
          }}
        />
      </div>
    </div>
  );
}
