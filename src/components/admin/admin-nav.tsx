"use client";

import { createContext, useContext } from "react";
import type { RailCounts } from "@/lib/admin-rail-counts";

/**
 * A move between two console pages, shown the moment it is asked for.
 *
 * Every console page is read from the database on each visit, and the router keeps the page being left on screen
 * until the next one starts to arrive. With the next page's loading screen already fetched (a Link prefetches it) the
 * change is instant; without it (a click soon after a page opened, and every click under `next dev`, which never
 * prefetches) the old page stood there for a second or two as though nothing had been pressed, and a second click, on
 * the dashboard's own Inquiries, was then overtaken by the first (the owner, 2026-11-03: "I click participants and go
 * to inquiries ... in 2 seconds the participant page is coming in inquiries and back"). Now every row of both rails
 * and of the phone menu says where it is going (`start`, from Link's onNavigate, so a click that opens a new tab is
 * left alone), and AdminFrame puts the loading screen up in the page's place at once, the row already marked, until
 * the router arrives.
 */
export interface AdminNav {
  /** Where a move is on its way to (a path and query, as addressOf writes them) until it arrives; null when none. */
  moving: string | null;
  /** Marks a move as on its way: for a Link's onNavigate. */
  start: (href: string) => void;
  /** A move made from code: marked, then made. */
  go: (href: string) => void;
  /** Who is signed in and the rail's figures, for a rail drawn below the frame: the dashboard's loading screen's. */
  rail: { name: string; image: string | null; counts: RailCounts | null };
}

export const AdminNavContext = createContext<AdminNav>({
  moving: null,
  start: () => {},
  go: (href) => window.location.assign(href),
  rail: { name: "Admin", image: null, counts: null },
});

export const useAdminNav = () => useContext(AdminNavContext);

/** One address however it was written: "/admin/x/?a=1" and "/admin/x?a=1" are the same place. */
export function addressOf(pathname: string, search: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const query = search.replace(/^\?/, "");
  return query ? `${path}?${query}` : path;
}

export const isDashboardPath = (pathname: string) => pathname === "/admin" || pathname === "/admin/";
