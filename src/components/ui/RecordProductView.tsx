"use client";

import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

/**
 * Tell the server this product was opened, so it can appear in the customer's
 * own browsing history.
 *
 * Renders nothing. It sits on the product page rather than on the card,
 * because a card scrolling past is not "I looked at this" — opening the page
 * is. The request is fire-and-forget: history is a convenience, and a failed
 * write must never be something the page reacts to.
 *
 * Waits for the session to resolve. Firing before /me answers would post for
 * signed-out visitors on every page load, and the route would (correctly) do
 * nothing with it.
 */
export function RecordProductView({ productId }: { productId: number }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || !user) return;
    void fetch("/api/web/account/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ productId }),
      // Survives the navigation away if they click straight through.
      keepalive: true,
    }).catch(() => {});
    // Deliberately keyed on the id and the user, not on every render: revisiting
    // the same product in the same session should move it up once, not once a
    // second.
  }, [productId, user, loading]);

  return null;
}
