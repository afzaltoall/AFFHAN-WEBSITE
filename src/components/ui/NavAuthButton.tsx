"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  Clock,
  Heart,
  LogOut,
  Mail,
  MessageSquareText,
  Phone,
  Share2,
  User2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { GoogleG } from "@/components/ui/GoogleG";
import { avatarUrl } from "@/lib/avatar";

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
  { href: "/account/favourites/", label: "Favourites", Icon: Heart },
  { href: "/account/history/", label: "Browsing history", Icon: Clock },
  { href: "/account/social/", label: "Social pages", Icon: Share2 },
] as const;

export function NavAuthButton() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Opens on hover, closes on a short delay — the same 150ms the navbar's mega
  // menu uses. The delay is not decoration: the panel sits below the trigger,
  // and without it the pointer crossing that boundary reads as a leave and the
  // menu shuts before it can be reached.
  //
  // Click still toggles. A touch screen has no hover, so tapping has to be a
  // way in, and keyboard users need one control they can activate.
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
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  // Click-away and Escape. A menu that can only be closed by the control that
  // opened it is a menu people end up navigating away from.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (loading) return <AuthButtonPlaceholder />;

  if (!user) {
    return (
      <Link
        href="/login/"
        className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
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
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 transition-colors hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
      >
        <Avatar user={user} initial={initial} size={30} />
        <span className="max-w-[8rem] truncate text-sm font-semibold text-slate-700">
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
            className="absolute right-0 top-[calc(100%+0.6rem)] z-50 w-72 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl"
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
        className="flex shrink-0 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-white"
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
 * Holds the button's space while the answer is unknown. Exported so the
 * navbar's dynamic() fallback is the same element, and the bar does not
 * visibly reflow when the real one arrives.
 */
export function AuthButtonPlaceholder() {
  return <span className="h-9 w-20 rounded-full bg-slate-100" aria-hidden="true" />;
}
