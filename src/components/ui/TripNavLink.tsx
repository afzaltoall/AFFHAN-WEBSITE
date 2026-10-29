"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Lock, Plane } from "lucide-react";
import { useOpenTrip } from "@/components/TripAccess/useOpenTrip";
import { TRIP_LOCK_KEY } from "@/lib/firstPaintHints";
import { MENU_TILE, MenuGlyph } from "@/components/ui/MenuIcons";

/**
 * The Free China Trip's place in the navbar (the owner's request of
 * 2026-10-12): its icon and its name before About from 1280px (TripNavLink),
 * and a row before About Us in the menu drawer below that (TripDrawerLink).
 * It took the place of the banner in the hero's top-right corner.
 *
 * The icon is the owner's public/free-china-trip/icon.png (1254px, 2MB, on
 * black) cut to its rounded square, 64 and 128px WebP, 3 and 7KB. They sit at
 * the root of public/, not beside the original: while the trip is locked the
 * door answers 404 for every picture under /free-china-trip (proxy.ts).
 *
 * While the trip is locked a gold lock sits on the icon, and the press goes to
 * /free-china-trip/, where the door shows "Opening soon" (the banner under its
 * lock, larger, which opens live as an admin unlocks it). Open, the press opens
 * the trip as the banner does (useOpenTrip), with no sign-in (2026-10-28): the
 * trip's page, the application itself on a phone, or the boarding pass for
 * someone registered already.
 */
const ICON = { src: "/china-trip-icon-64.webp", srcSet: "/china-trip-icon-64.webp 64w, /china-trip-icon-128.webp 128w" };

export interface TripLockView {
  /** Whether the answer has come: until it has, no lock is drawn and the press is a plain link (the door decides). */
  known: boolean;
  locked: boolean;
}

/** The last answer, kept on this device, so the next page (and the next visit) starts from it. */
const KEPT = TRIP_LOCK_KEY;

/**
 * Whether the trip is locked (lib/trip-lock.ts), for the navbar. The navbar has
 * no answer from the server to start from (the layout cannot read the lock
 * without making every page dynamic), so this starts from the answer this
 * device last had (localStorage), and asks /api/trip-lock/ (an edge copy at
 * most five seconds old) at once, on each new page, and when the tab comes
 * back into view. Not when the page is idle, as it first did: on a busy page
 * that was seconds, and the lock came late (the owner, 2026-10-12). It never
 * polls: the page it leads to while locked is the one that opens live. Called
 * once, by the navbar, for both of its places.
 */
export function useTripLocked(): TripLockView {
  const pathname = usePathname();
  const [view, setView] = useState<TripLockView>({ known: false, locked: true });

  useEffect(() => {
    try {
      const kept = localStorage.getItem(KEPT);
      if (kept === "1" || kept === "0") setView({ known: true, locked: kept === "1" });
    } catch {
      /* storage refused: the answer comes from the server instead */
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    const ask = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/trip-lock/");
        if (!res.ok) return;
        const json = (await res.json()) as { locked?: unknown };
        if (stopped || typeof json.locked !== "boolean") return;
        const locked = json.locked;
        setView((v) => (v.known && v.locked === locked ? v : { known: true, locked }));
        try {
          localStorage.setItem(KEPT, locked ? "1" : "0");
        } catch {
          /* not kept: the next page asks again */
        }
      } catch {
        /* offline: the last answer stands, and the link works either way */
      }
    };
    void ask();
    const onShow = () => void ask();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [pathname]);

  return view;
}

/** The icon, `size` px square, at the resolution the screen needs. */
function TripIcon({ size, className = "" }: { size: number; className?: string }) {
  return (
    // A plain <img>: two small files made for it, so the optimizer adds nothing.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={ICON.src}
      srcSet={ICON.srcSet}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt=""
      decoding="async"
      className={className}
    />
  );
}

/** The navbar's, from 1280px: the icon and the name, a warm pill among the plain links. */
export function TripNavLink({ lock }: { lock: TripLockView }) {
  const openTrip = useOpenTrip();
  const shut = !lock.known || lock.locked;
  const showLock = lock.known && lock.locked;
  return (
    <Link
      href="/free-china-trip/"
      onClick={shut ? undefined : openTrip}
      aria-label={showLock ? "Free China Trip, opening soon" : "Free China Trip"}
      className="group relative flex items-center gap-2 rounded-full border border-red-200/70 bg-[linear-gradient(100deg,#fff4f2,#fff6ec_55%,#fffbeb)] py-1 pl-1 pr-3.5 shadow-[0_8px_18px_-14px_rgba(200,30,30,0.9)] transition-[border-color,box-shadow,translate] duration-200 hover:-translate-y-px hover:border-red-300 hover:shadow-[0_12px_24px_-14px_rgba(200,30,30,0.95)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span className="relative block h-[30px] w-[30px] shrink-0">
        <TripIcon
          size={30}
          className="h-full w-full rounded-[9px] shadow-[0_2px_6px_-2px_rgba(150,20,20,0.6)] transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-[1.07] motion-reduce:transition-none motion-reduce:group-hover:rotate-0 motion-reduce:group-hover:scale-100"
        />
        {/* Always drawn, and shown by the answer once it has come (data-show); before that, from the first
            frame, by what this device last saw (html[data-trip-locked]: lib/firstPaintHints.ts, globals.css). */}
        <span
          aria-hidden
          data-show={lock.known ? (lock.locked ? "1" : "0") : undefined}
          className="trip-lock-badge absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#23190c] ring-2 ring-white"
        >
          <Lock className="h-[9px] w-[9px] text-amber-300" strokeWidth={3} />
        </span>
      </span>
      <span className="whitespace-nowrap text-[13.5px] font-semibold tracking-wide text-slate-800">Free China Trip</span>
      {showLock && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[calc(100%+10px)] z-10 -translate-x-1/2 translate-y-1 whitespace-nowrap rounded-lg bg-[#23190c] px-2.5 py-1.5 text-[11.5px] font-semibold text-amber-200 opacity-0 shadow-lg transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
        >
          Opening soon
        </span>
      )}
    </Link>
  );
}

/** The menu drawer's, below 1280px: a row like its neighbours, before About Us. */
export function TripDrawerLink({ lock, onClose }: { lock: TripLockView; onClose: () => void }) {
  const router = useRouter();
  const openTrip = useOpenTrip();
  const shut = !lock.known || lock.locked;
  return (
    <Link
      href="/free-china-trip/"
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        onClose();
        if (!shut) return openTrip(e);
        e.preventDefault();
        router.push("/free-china-trip/");
      }}
      className="group flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 text-[15px] font-semibold text-slate-700 transition-colors hover:bg-brand/5 hover:text-brand-dark"
    >
      {/* The menu's own icon, like every row of it (MenuIcons); the colour picture is the bar's. */}
      <span className={MENU_TILE}>
        <MenuGlyph icon={Plane} />
      </span>
      {/* "Opening soon" under the name, as the Login row's line sits under its own: beside it, on a phone, it
          pushed the name onto two lines. */}
      <span className="min-w-0 flex-1 text-left">
        <span className="block">Free China Trip</span>
        {lock.known && lock.locked && (
          <span className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-amber-700">
            <Lock aria-hidden className="h-3 w-3" strokeWidth={2.75} />
            Opening soon
          </span>
        )}
      </span>
      <ChevronRight size={16} className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
    </Link>
  );
}
