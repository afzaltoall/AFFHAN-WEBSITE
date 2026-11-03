"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdminMobileBar, AdminRail } from "@/components/admin/AdminRail";
import { AdminLoadingScreen } from "@/components/admin/AdminSkeleton";
import { AdminNavContext, addressOf, isDashboardPath, type AdminNav } from "@/components/admin/admin-nav";
import type { RailCounts } from "@/lib/admin-rail-counts";

/**
 * Puts the admin rail beside every console page except the dashboard, which
 * draws its own. Where the rail is not drawn, as the dashboard's is not (below
 * lg, and on a touch screen of any width: rail: in globals.css), a bar with a
 * Menu takes its place (AdminMobileBar): the same rows, in a drawer.
 *
 * It also shows a move between two pages the moment a row is pressed (admin-nav.tsx says why): the loading screen in
 * the page's place, the page kept underneath, hidden, until the router arrives, and this rail beside it with the row
 * already marked, the dashboard's included (its own rail is hidden with it). The structure never changes with the
 * page, so nothing below is ever remounted by it.
 */
export function AdminFrame({
  name,
  image,
  counts,
  children,
}: {
  name: string;
  image: string | null;
  /** The figures on the rail, counted once in the console layout, or null
   *  when they could not be read — see lib/admin-rail-counts.ts. */
  counts: RailCounts | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const search = useSearchParams()?.toString() ?? "";
  const router = useRouter();
  const here = addressOf(pathname, search);
  const [pending, setPending] = useState<string | null>(null);

  // Arrived: the next page's loading screen or the page itself is up. Also the way out when a move ends somewhere
  // other than where it was asked to (a redirect, the sign-in page).
  useEffect(() => setPending(null), [here]);
  // A move the router never makes gives the page back rather than holding the loading screen up for good.
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(null), 20_000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  // A move to the page already here (pressed while another move was on its way) is a move back to it: the router
  // drops the other, so the page shows again rather than a loading screen that nothing would ever take down.
  const start = useCallback((href: string) => {
    const to = new URL(href, window.location.href);
    const target = addressOf(to.pathname, to.search);
    setPending(target !== addressOf(window.location.pathname, window.location.search) ? target : null);
  }, []);
  const go = useCallback(
    (href: string) => {
      start(href);
      router.push(href);
    },
    [start, router],
  );

  const moving = pending && pending !== here ? pending : null;
  const nav = useMemo<AdminNav>(() => ({ moving, start, go, rail: { name, image, counts } }), [moving, start, go, name, image, counts]);

  // The pages that have a dark theme of their own for the rail to match.
  const supportsDark = !moving && /^\/admin\/(suppliers|new-suppliers|videos)(\/|$)/.test(pathname);
  // This rail: beside every page but the dashboard, which draws its own (and whose loading screen draws this one in
  // its place), and beside any page while a move is on its way.
  const ownRail = !isDashboardPath(pathname) || moving !== null;

  return (
    <AdminNavContext.Provider value={nav}>
      {/* Where the rail is not drawn (a phone, a tablet, any touch screen): a bar with the console's Menu, the
          rail's rows in a drawer. */}
      {ownRail && <AdminMobileBar name={name} counts={counts} supportsDark={supportsDark} />}
      <div className="flex">
        {ownRail && <AdminRail name={name} image={image} counts={counts} supportsDark={supportsDark} at={moving ?? here} />}
        <div className="min-w-0 flex-1">
          {moving && <AdminLoadingScreen dashboard={isDashboardPath(moving.split("?")[0])} />}
          <div className={moving ? "hidden" : undefined}>{children}</div>
        </div>
      </div>
    </AdminNavContext.Provider>
  );
}

export default AdminFrame;
