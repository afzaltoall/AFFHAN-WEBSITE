"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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

interface AuthValue {
  user: WebUser | null;
  /** True until the first /me has answered, so the navbar can hold its shape. */
  loading: boolean;
  refreshSession: () => Promise<WebUser | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

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
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
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

  const refreshSession = useCallback(async (): Promise<WebUser | null> => {
    try {
      const res = await fetch("/api/web/auth/me", {
        credentials: "include",
        // The answer depends on a cookie, so a cached one would show the
        // previous visitor.
        cache: "no-store",
      });
      if (!res.ok) {
        setUser(null);
        return null;
      }
      const json = await res.json();
      const next = (json?.user as WebUser | null) ?? null;
      setUser(next);
      return next;
    } catch {
      // Offline or a failed request is not proof of being signed out; leave
      // whatever is already known rather than appearing to log the visitor out.
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setHydrated(true);
    void refreshSession();
  }, [refreshSession]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/web/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      // Cleared either way: if the request failed the cookie may still be
      // there, but continuing to show a signed-in navbar would be a lie, and
      // the next /me settles it.
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user: hydrated ? user : null,
      loading: !hydrated || loading,
      refreshSession,
      logout,
    }),
    [user, loading, hydrated, refreshSession, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
