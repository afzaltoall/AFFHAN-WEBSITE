"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Heart,
  LogOut,
  Mail,
  MessageSquareText,
  Phone,
  Share2,
  Ship,
  User2,
} from "lucide-react";
import { useAuth, type UserHint } from "@/context/AuthContext";
import { GoogleG } from "@/components/ui/GoogleG";
import { avatarUrl } from "@/lib/avatar";
import { MENU_INK } from "@/components/ui/MenuIcons";

/**
 * The Login link, or the signed-in customer's avatar and account menu.
 *
 * Loaded with ssr:false by the navbar. Whether someone is signed in is known
 * only from an httpOnly cookie the server never reads, so the server can only
 * ever render the signed-out shape. That is fine until this sits behind a
 * Suspense boundary, as the navbar does: hydration of the subtree is deferred,
 * and by the time it runs, /me has often already answered — so React compares a
 * client render that knows the answer against server HTML that never did, and
 * calls it a hydration mismatch.
 *
 * Skipping SSR for this one piece removes the comparison rather than papering
 * over it: the server emits the placeholder, the client mounts fresh.
 */
/**
 * Every section the account sidebar has, in the same order.
 *
 * All of them, not a chosen few: this menu is how most people will reach the
 * account area at all, and a section missing here is a section that only
 * exists if you already knew to look for it.
 */
const MENU = [
  { href: "/account/", label: "Account", Icon: User2 },
  { href: "/account/inquiries/", label: "My Inquiries", Icon: MessageSquareText },
  { href: "/account/shipments/", label: "My Shipments", Icon: Ship },
  { href: "/account/favourites/", label: "Favourites", Icon: Heart },
  { href: "/account/history/", label: "Browsing history", Icon: Clock },
  { href: "/account/social/", label: "Social pages", Icon: Share2 },
] as const;

export function NavAuthButton() {
  const { user: confirmed, loading, hint, logout } = useAuth();
  // While /me answers, the face this device last saw (AuthContext's hint), so
  // the bar is whole at once; /me then confirms it or puts Login in its place.
  const user: UserHint | null = loading ? (hint && hint !== "signed-out" ? hint : null) : confirmed;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Open because it was pressed (a click, a tap, a key) rather than because a
  // mouse is resting on it: then leaving does not close it.
  const held = useRef(false);

  // A mouse opens it by hovering and closes it by leaving, on a short delay —
  // the same 150ms the navbar's mega menu uses. The delay is not decoration:
  // the panel sits below the trigger, and without it the pointer crossing that
  // boundary reads as a leave and the menu shuts before it can be reached.
  //
  // Hover is a mouse's alone (pointerType). A tap fires the compatibility
  // mouseenter before its click, so the menu opened on the enter and the click
  // toggled it shut: on an iPad the first tap did nothing and only every second
  // one opened it (live, 2026-10-12). With a mouse, the click after the hover
  // shut it the same way.
  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const openNow = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const closeSoon = useCallback(() => {
    cancelClose();
    if (held.current) return;
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }, [cancelClose]);

  // A press (a click, a tap, Enter): opens the menu and holds it, holds one a
  // mouse opened by hovering, and closes one already held.
  const press = () => {
    cancelClose();
    if (open && !held.current) {
      held.current = true;
      return;
    }
    held.current = !open;
    setOpen(!open);
  };

  useEffect(() => cancelClose, [cancelClose]);
  useEffect(() => {
    if (!open) held.current = false;
  }, [open]);

  // A press anywhere else and Escape. A menu that can only be closed by the
  // control that opened it is a menu people end up navigating away from.
  // pointerdown, not mousedown: a touch that starts a scroll fires no mouse
  // events at all, and left the menu open over the page.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The sign-in page itself: a Login there would only reload it, and lose the
  // page it is to send you back to (?redirect= became /login/).
  const onLoginPage = pathname?.replace(/\/$/, "") === "/login";
  // The grey pill only when this device has never had an answer.
  if (loading && hint === null) return onLoginPage ? null : <AuthButtonPlaceholder />;

  if (!user) {
    if (onLoginPage) return null;
    return (
      <Link
        // Carries the current page, the same way Save and Favourite do.
        // Signing in from the navbar used to land everyone on the homepage,
        // whatever they had been reading.
        href={`/login/?redirect=${encodeURIComponent(pathname || "/")}`}
        className="rounded-full bg-brand-dark px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"
      >
        Login
      </Link>
    );
  }

  const initial = (user.name || user.phone || "?").charAt(0).toUpperCase();

  return (
    <div
      ref={wrapRef}
      className="relative"
      onPointerEnter={(e) => e.pointerType === "mouse" && openNow()}
      onPointerLeave={(e) => e.pointerType === "mouse" && closeSoon()}
    >
      <button
        ref={buttonRef}
        onClick={press}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user.name || user.phone || "Your account"}
        className="flex items-center gap-1.5 xl:gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-2 xl:pr-3 transition-colors hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
      >
        <Avatar user={user} initial={initial} size={30} />
        {/* The name from 1280px; on a tablet the avatar alone, so the search keeps the bar. */}
        <span className="hidden xl:block max-w-[8rem] truncate text-sm font-semibold text-slate-700">
          {user.name || user.phone}
        </span>
        <ChevronDown
          size={15}
          className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            // On a phone, the bar's width under the bar: 288px from the avatar ran off a 320px screen.
            className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-72 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl max-sm:fixed max-sm:inset-x-3 max-sm:top-[4.5rem] max-sm:w-auto"
          >
            <Link
              href="/account/"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 transition-colors hover:bg-slate-50"
            >
              <Avatar user={user} initial={initial} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                {/* Whichever identity they actually signed up with. A blank
                    line under the name looks like something failed to load. */}
                {user.email ? (
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-slate-500">
                    <Mail size={11} className="shrink-0" />
                    {user.email}
                  </p>
                ) : user.phone ? (
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-slate-500">
                    <Phone size={11} className="shrink-0" />
                    {user.phone}
                  </p>
                ) : null}
              </div>

              {/* Pinned on the right when the account is linked to Google, so
                  the row answers "how do I get back in" without a word of copy.
                  Absent for phone-only accounts rather than greyed out — a
                  disabled-looking mark invites a click that does nothing. */}
              {user.authProvider.includes("GOOGLE") && (
                <span
                  title="Linked with Google"
                  className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200"
                >
                  <GoogleG size={13} />
                </span>
              )}
            </Link>

            {/* The same sections the account sidebar lists. Repeated here
                because reaching "my inquiries" should not require landing on
                the profile form first and then finding the nav. */}
            <div className="p-1.5">
              {MENU.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  role="menuitem"
                  href={href}
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Icon size={15} className="text-slate-400" />
                  {label}
                </Link>
              ))}
            </div>

            {/* Log out stays here as well as in the account sidebar: signing
                out should not require loading a page first. */}
            <div className="border-t border-slate-100 p-1.5">
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void logout();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-red-600 transition-colors hover:bg-red-50 cursor-pointer"
              >
                <LogOut size={15} />
                Log out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The account at the top of the menu drawer (below 1280px): who is signed in,
 * leading to the account, or the way to sign in. The drawer had neither, and
 * below 768px the bar had no account button, so a phone could not sign in at
 * all (the owner, 2026-10-12). Rendered only while the drawer is open, so long
 * after /me has answered; never on the server.
 */
export function DrawerAccount({ onGo }: { onGo: (href: string) => void }) {
  const { user: confirmed, loading, hint } = useAuth();
  const pathname = usePathname();
  // As the bar's button does: the last face seen while /me answers.
  const user: UserHint | null = loading ? (hint && hint !== "signed-out" ? hint : null) : confirmed;

  if (loading && hint === null) return <div aria-hidden="true" className="mb-2 h-16 rounded-2xl bg-slate-50" />;

  const row = "group mb-2 flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 text-left transition-colors cursor-pointer";
  const chevron = <ChevronRight size={16} className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />;

  if (!user) {
    // Already on the sign-in page (see NavAuthButton).
    if (pathname?.replace(/\/$/, "") === "/login") return null;
    return (
      <button
        type="button"
        onClick={() => onGo(`/login/?redirect=${encodeURIComponent(pathname || "/")}`)}
        className={`${row} bg-brand/5 hover:bg-brand/10`}
      >
        {/* The menu's tile, filled: the one call in the menu (MenuIcons). */}
        <span style={{ backgroundImage: MENU_INK }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white">
          <User2 size={19} strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-slate-900">Login</span>
          <span className="block text-[12px] leading-snug text-slate-500">Save products and follow your quote requests</span>
        </span>
        {chevron}
      </button>
    );
  }

  const initial = (user.name || user.phone || "?").charAt(0).toUpperCase();
  return (
    <button type="button" onClick={() => onGo("/account/")} className={`${row} bg-slate-50 hover:bg-brand/5`}>
      <Avatar user={user} initial={initial} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-slate-900">{user.name || user.phone}</span>
        <span className="block truncate text-[12px] text-slate-500">{user.email || user.phone || "Your account"}</span>
      </span>
      {chevron}
    </button>
  );
}

function Avatar({
  user,
  initial,
  size,
}: {
  user: { name: string; profileImage: string | null };
  initial: string;
  size: number;
}) {
  const [broken, setBroken] = useState(false);

  // Google's avatar URLs do expire, and a dead one would otherwise render as a
  // broken-image glyph in the navbar. The initial is the fallback.
  if (!user.profileImage || broken) {
    return (
      <span
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-full bg-brand-dark text-[13px] font-bold text-white"
      >
        {initial}
      </span>
    );
  }

  return (
    // Plain <img>, not next/image — the same call FlagSelect makes for its
    // flags. This is a 30px avatar already sized and cached by Google's CDN, so
    // the optimizer adds nothing, and routing it through /_next/image means the
    // host must be in next.config AND the server restarted before it will load
    // at all. A missing restart showed every Google user a letter instead of
    // their photo.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl(user.profileImage, size) ?? user.profileImage}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full object-cover ring-1 ring-black/5"
    />
  );
}

/**
 * Holds the button's place until React knows. Exported so the navbar's
 * dynamic() fallback is the same element, and the bar does not visibly reflow
 * when the real one arrives.
 *
 * From the first frame it is what this device last saw (the layout's first
 * script sets html[data-me], lib/firstPaintHints.ts; globals.css picks the
 * shape): "Login", or the avatar's shape with the account's initial and name.
 * The grey pill only on a device that has never had an answer. Before that it
 * was the grey pill on every page until /me answered (the owner: "loading
 * late", 2026-10-12).
 */
export function AuthButtonPlaceholder() {
  const pathname = usePathname();
  // Never on the sign-in page, as the button itself is not.
  if (pathname?.replace(/\/$/, "") === "/login") return null;
  return (
    <span aria-hidden="true" className="contents">
      <span className="auth-ph-blank h-9 w-20 rounded-full bg-slate-100" />
      <span className="auth-ph-login items-center rounded-full bg-brand-dark px-5 py-2 text-sm font-semibold text-white">Login</span>
      <span className="auth-ph-face items-center gap-1.5 rounded-full border border-slate-200 py-1 pl-1 pr-2 xl:gap-2 xl:pr-3">
        <span className="auth-ph-initial flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-brand-dark text-[13px] font-bold text-white" />
        <span className="auth-ph-name hidden max-w-[8rem] truncate text-sm font-semibold text-slate-700 xl:block" />
        <ChevronDown size={15} className="text-slate-400" />
      </span>
    </span>
  );
}
