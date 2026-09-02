"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";

/**
 * Which products this customer has saved, for the whole site.
 *
 * The set is fetched once per session, not once per card. A product grid can
 * hold sixty hearts and each one needs to know whether it is filled; asking
 * the server sixty times to colour in sixty icons is the kind of thing that
 * makes a page feel broken on a slow connection.
 *
 * Toggling updates the set immediately and then reconciles with what the
 * server actually stored. A heart that waits for a round trip before moving
 * feels unresponsive, and a heart that moves and then silently disagrees with
 * the database is worse — so it does both: move now, correct if wrong.
 */

interface FavouritesValue {
  ids: Set<number>;
  ready: boolean;
  isSaved: (productId: number) => boolean;
  toggle: (productId: number) => Promise<boolean>;
  /** Set when the last toggle was refused — a signed-out visitor, or the cap. */
  error: string | null;
  clearError: () => void;
}

const FavouritesContext = createContext<FavouritesValue | null>(null);

export function FavouritesProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [ids, setIds] = useState<Set<number>>(new Set());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for the session. Asking before /me answers would return an empty
    // list for a signed-in customer and draw every heart hollow.
    if (loading) return;
    if (!user) {
      setIds(new Set());
      setReady(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/web/account/favourites?ids=1", {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!cancelled) setIds(new Set<number>(Array.isArray(json?.ids) ? json.ids : []));
      } catch {
        // Leave the set alone; a failed read is not proof nothing is saved.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  const toggle = useCallback(
    async (productId: number): Promise<boolean> => {
      if (!user) {
        setError("Sign in to save products.");
        return false;
      }

      const wasSaved = ids.has(productId);
      // Move first.
      setIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(productId);
        else next.add(productId);
        return next;
      });

      try {
        const res = await fetch("/api/web/account/favourites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ productId }),
        });
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          // Put it back exactly as it was, and say why.
          setIds((prev) => {
            const next = new Set(prev);
            if (wasSaved) next.add(productId);
            else next.delete(productId);
            return next;
          });
          setError(json?.error ?? "Could not save that product.");
          return wasSaved;
        }

        // Trust the server's answer over the guess.
        setIds((prev) => {
          const next = new Set(prev);
          if (json?.saved) next.add(productId);
          else next.delete(productId);
          return next;
        });
        return Boolean(json?.saved);
      } catch {
        setIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(productId);
          else next.delete(productId);
          return next;
        });
        setError("Could not reach the server.");
        return wasSaved;
      }
    },
    [ids, user]
  );

  const value = useMemo<FavouritesValue>(
    () => ({
      ids,
      ready,
      isSaved: (productId: number) => ids.has(productId),
      toggle,
      error,
      clearError: () => setError(null),
    }),
    [ids, ready, toggle, error]
  );

  return <FavouritesContext.Provider value={value}>{children}</FavouritesContext.Provider>;
}

/**
 * Safe to call from a component that may render outside the provider — the
 * fallback simply reports nothing saved, so a stray product card cannot crash
 * a page over a heart icon.
 */
export function useFavourites(): FavouritesValue {
  const ctx = useContext(FavouritesContext);
  if (ctx) return ctx;
  return {
    ids: EMPTY,
    ready: false,
    isSaved: () => false,
    toggle: async () => false,
    error: null,
    clearError: () => {},
  };
}

const EMPTY: Set<number> = new Set();
