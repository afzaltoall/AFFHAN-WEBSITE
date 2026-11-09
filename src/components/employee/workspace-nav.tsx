"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceSkeleton } from "@/components/employee/WorkspaceSkeleton";

/**
 * A move between two staff pages, shown the moment it is pressed, as the console's are (admin-nav.tsx).
 *
 * Every staff page is read from the database on each visit, and the router keeps the page being left on screen until
 * the next one starts to arrive. Without that page's loading outline already fetched (a Link prefetches it, but only
 * on the live site, and not in the first moments after a page opens) a press did nothing visible for as long as the
 * server took: on the owner's localhost, which also builds each page the first time and reaches the database in the
 * United States, about ten seconds (2026-11-09: "the clickable are not working ... while clicking profile getting 10
 * seconds"). Now the tabs and the rail say where they are going (`start`, from Link's onNavigate, so a press that
 * opens a new tab is left alone): the pressed one is marked at once, and the page's place shows its outline until the
 * router arrives.
 */
export interface WorkspaceNav {
  /** The path a move is on its way to, until it arrives; null when none. */
  moving: string | null;
  /** Marks a move as on its way: for a Link's onNavigate. */
  start: (href: string) => void;
}

const WorkspaceNavContext = createContext<WorkspaceNav>({ moving: null, start: () => {} });

export const useWorkspaceNav = () => useContext(WorkspaceNavContext);

/** A path however it was written: "/employee/profile/" and "/employee/profile" are the same place. */
export const pathOf = (pathname: string) => (pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname);

export function WorkspaceNavProvider({ children }: { children: React.ReactNode }) {
  const here = pathOf(usePathname() ?? "");
  const [pending, setPending] = useState<string | null>(null);

  // Arrived (or ended somewhere else: a redirect, the sign-in page).
  useEffect(() => setPending(null), [here]);
  // A move the router never makes gives the page back rather than holding the outline up for good.
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(null), 20_000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  // A press on the page already here, while another move was on its way, is a move back to it.
  const start = useCallback((href: string) => {
    const to = pathOf(new URL(href, window.location.href).pathname);
    setPending(to !== pathOf(window.location.pathname) ? to : null);
  }, []);

  const moving = pending && pending !== here ? pending : null;
  const nav = useMemo<WorkspaceNav>(() => ({ moving, start }), [moving, start]);
  return <WorkspaceNavContext.Provider value={nav}>{children}</WorkspaceNavContext.Provider>;
}

/** The page's place: the page, or while a move is on its way, the next page's outline (the page kept, hidden). */
export function WorkspaceMain({ children }: { children: React.ReactNode }) {
  const { moving } = useWorkspaceNav();
  return (
    <main className="min-w-0 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      {moving && <WorkspaceSkeleton path={moving} />}
      <div className={moving ? "hidden" : undefined}>{children}</div>
    </main>
  );
}
