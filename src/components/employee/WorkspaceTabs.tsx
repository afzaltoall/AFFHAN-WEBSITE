"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { wt } from "@/components/employee/workspace-ui";
import { pathOf, useWorkspaceNav } from "@/components/employee/workspace-nav";
import type { WorkspacePages } from "@/components/employee/WorkspaceSidebar";

/**
 * The rail's destinations, for the screens the rail is not on (below lg): tabs across the top bar, sharing its width,
 * a finger's height each, with the page you are on marked (2026-11-08, the owner on the phone view: "romba kevalam";
 * they were four grey words with nothing to say where you were). They scroll sideways only if they cannot fit: an
 * admin's four on the narrowest phone. A pressed tab is marked at once, before its page has arrived (workspace-nav;
 * 2026-11-09, "the clickable are not working").
 */
export function WorkspaceTabs({ pages }: { pages: WorkspacePages }) {
  const nav = useWorkspaceNav();
  const pathname = usePathname() ?? "";
  const at = nav.moving ?? pathOf(pathname);
  const tabs = [
    ...(pages === "sales" || pages === "both" ? [{ href: "/employee/dashboard/", label: "My leads" }] : []),
    ...(pages === "assigner" || pages === "both" ? [{ href: "/employee/cargo/", label: "Cargo tracking" }] : []),
    { href: "/employee/referrals/", label: "My referrals" },
    { href: "/employee/profile/", label: "Profile" },
  ];
  return (
    <nav aria-label="Staff pages" className="flex overflow-x-auto [scrollbar-width:none] sm:px-3">
      {tabs.map((t) => {
        const here = at.startsWith(pathOf(t.href));
        return (
          <Link
            key={t.href}
            href={t.href}
            onNavigate={() => nav.start(t.href)}
            aria-current={here ? "page" : undefined}
            className={`relative flex h-11 flex-1 items-center justify-center whitespace-nowrap px-3 text-[14px] font-semibold transition-colors active:bg-black/[0.04] sm:flex-none ${
              here ? "text-brand-dark after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-dark" : wt.navIdle
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default WorkspaceTabs;
