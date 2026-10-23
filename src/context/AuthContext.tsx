"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ME_HINT_KEY } from "@/lib/firstPaintHints";
import { isSupplierPath } from "@/lib/supplier-paths";

export interface WebUser {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  authProvider: string;
  profileImage: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  /** ISO string, or null on the older sessions that predate the field. */
  createdAt: string | null;
  /** Whether the account has a password at all. Never the password itself. */
  hasPassword: boolean;
}

/** What the navbar draws of an account: all a hint keeps. */
export type UserHint = Pick<WebUser, "name" | "email" | "phone" | "profileImage" | "authProvider">;

interface AuthValue {
  user: WebUser | null;
  /** True until the first /me has answered, so the navbar can hold its shape. */
  loading: boolean;
  /**
   * While /me is answering: what this device last saw, the account's face or
   * "signed-out" (null when it has seen nothing). For the navbar to draw at
   * once instead of a grey pill (the owner: "loading late", 2026-10-12);
   * never for a decision, which waits for `loading` and `user` as before.
   */
  hint: UserHint | "signed-out" | null;
  refreshSession: () => Promise<WebUser | null>;
  /**
   * Take the account a sign-in route has just answered with (its `user`, publicUser, the shape /me answers
   * with), instead of asking /me straight after for the same thing: one round trip less before the visitor
   * goes on (Google sign-in, 2026-10-15).
   */
  adoptUser: (user: WebUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * The hint (ME_HINT_KEY) holds a name, an avatar address and the contact /me
 * showed, which this browser's own JavaScript could ask /me for anyway; never
 * the session, which stays in its httpOnly cookie. The layout's first script
 * reads it too, for the navbar's first frame (lib/firstPaintHints.ts).
 */
const HINT_KEY = ME_HINT_KEY;

function readHint(): UserHint | "signed-out" | null {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    if (!raw) return null;
    if (raw === "signed-out") return "signed-out";
    const h = JSON.parse(raw) as Partial<UserHint>;
    return typeof h?.name === "string"
      ? { name: h.name, email: h.email ?? null, phone: h.phone ?? null, profileImage: h.profileImage ?? null, authProvider: h.authProvider ?? "" }
      : null;
  } catch {
    return null;
  }
}

function keepHint(user: WebUser | null) {
  try {
    if (!user) localStorage.setItem(HINT_KEY, "signed-out");
    else {
      const { name, email, phone, profileImage, authProvider } = user;
      localStorage.setItem(HINT_KEY, JSON.stringify({ name, email, phone, profileImage, authProvider }));
    }
  } catch {
    /* storage refused: the next visit waits for /me, as before */
  }
}

/**
 * Who is signed in, for the whole site.
 *
 * The session token itself is never here: it is an httpOnly cookie, which this
 * code cannot read by design. All that is held is the profile /me answered
 * with, so nothing an XSS could reach is worth stealing.
 *
 * That also means "still signed in" is not a guess. On mount the cookie goes
 * with the request whether or not the last visit is remembered in JavaScript,
 * which is what makes a returning visitor on the same device simply signed in.
 *
 * Not on the supplier portal (the owner, 2026-10-23: customers and suppliers
 * are separate accounts with separate sessions, no crossing either way). Its
 * pages do not ask for the customer's session, and nothing here tells them who
 * the customer is: they read as signed out. Leaving the portal for the shop
 * asks then.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const supplierSide = isSupplierPath(pathname);
  const asked = useRef(false);
  const [user, setUser] = useState<WebUser | null>(null);
  const [loading, setLoading] = useState(true);
  // The server never looks at the cookie, so it cannot know who is signed in —
  // it always renders the signed-out shape. If /me resolves before a consumer
  // hydrates (it can, the Navbar sits behind a Suspense boundary), that
  // consumer's first client render would disagree with the server's HTML and
  // React would throw a hydration mismatch. This gate holds every consumer on
  // the server's shape for exactly one render, after which state may differ
  // freely.
  const [hydrated, setHydrated] = useState(false);
  const [hint, setHint] = useState<UserHint | "signed-out" | null>(null);

  const refreshSession = useCallback(async (): Promise<WebUser | null> => {
    try {
      // With its slash: the site's trailingSlash answers /me with a 308 to /me/,
      // so the bare address cost every page a second round trip (~100ms on
      // affhan.com, measured 2026-10-12) before the navbar could draw.
      const res = await fetch("/api/web/auth/me/", {
        credentials: "include",
        // The answer depends on a cookie, so a cached one would show the
        // previous visitor.
        cache: "no-store",
      });
      if (!res.ok) {
        setUser(null);
        keepHint(null);
        return null;
      }
      const json = await res.json();
      const next = (json?.user as WebUser | null) ?? null;
      setUser(next);
      keepHint(next);
      return next;
    } catch {
      // Offline or a failed request is not proof of being signed out; leave
      // whatever is already known rather than appearing to log the visitor out.
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => setHydrated(true), []);

  // Asked once, on the first page that is the shop's: at once on arrival there, or on leaving the portal for it.
  useEffect(() => {
    if (supplierSide || asked.current) return;
    asked.current = true;
    setHint(readHint());
    void refreshSession();
  }, [supplierSide, refreshSession]);

  const adoptUser = useCallback((next: WebUser) => {
    setUser(next);
    keepHint(next);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/web/auth/logout/", { method: "POST", credentials: "include" });
    } finally {
      // Cleared either way: if the request failed the cookie may still be
      // there, but continuing to show a signed-in navbar would be a lie, and
      // the next /me settles it.
      setUser(null);
      keepHint(null);
    }
  }, []);

  const value = useMemo(
    () =>
      supplierSide
        ? // The portal's pages hold no customer: signed out, and settled.
          { user: null, loading: false, hint: null, refreshSession, adoptUser, logout }
        : {
            user: hydrated ? user : null,
            loading: !hydrated || loading,
            hint: hydrated && loading ? hint : null,
            refreshSession,
            adoptUser,
            logout,
          },
    [supplierSide, user, loading, hydrated, hint, refreshSession, adoptUser, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
