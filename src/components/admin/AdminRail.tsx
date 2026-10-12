"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { KeyRound, LogOut, Mail, Menu, Moon, Sun, X } from "lucide-react";
import { signOutThrough } from "@/lib/session-client";
import { useAdminDark } from "@/lib/useAdminDark";
import { AccountMenu } from "@/components/admin/AccountMenu";
import { AdminRailList } from "@/components/admin/AdminMobileNav";
import {
  RAIL_GROUPS, fmtRailBadge, fmtRailNum, railDotFor,
  type RailCountMap, type RailItem,
} from "@/components/admin/rail-sections";
import type { RailCounts } from "@/lib/admin-rail-counts";
import { TripLockRailDot, TripLockRailPill } from "@/components/admin/TripLockRailStatus";

/**
 * The console's rail, for every admin page that is not the dashboard.
 *
 * The dashboard draws its own (inside AdminConsole, where its four views are
 * state rather than routes). Every other page — Suppliers, Videos, the
 * customer lists, App Inquiries, Activity, Staff — used to stand alone: a
 * column centred in the window with a back arrow to /admin at its top-left,
 * which on a wide screen left the page in the middle of a lot of grey and made
 * every move between two of them a trip through the dashboard. With the same
 * rail on all of them the admin area is one place, and the pages can use the
 * width they are given.
 *
 * Same geometry as the dashboard's: a 60px column of icons that opens to 272px
 * over the page on hover or focus, the outer div holding the 60px so nothing
 * reflows. The dashboard's views are reached through ?view=, which the console
 * reads on arrival.
 *
 * Dark follows the shared preference (useAdminDark) on the pages that offer it,
 * so the rail never sits light beside a dark page, or the other way round.
 */

const LIGHT = {
  sidebar: "bg-white/80 border-black/[0.06]", sidebarOpen: "bg-white border-black/[0.06]",
  soft: "text-[#86868b]", strong: "text-[#1d1d1f]", border: "border-black/[0.06]", thumb: "bg-[#f5f5f7]",
  navIdle: "text-[#515154] hover:bg-black/[0.03]", navActive: "bg-[#ececed] text-[#1d1d1f]",
  pill: "bg-white text-[#1d1d1f] ring-black/[0.06] hover:bg-black/[0.02]",
  mid: "text-[#48484a]", hover: "hover:bg-black/[0.015]", modal: "bg-white text-[#1d1d1f] ring-black/[0.06]",
  chip: "bg-black/[0.05] text-[#48484a]",
};
const DARK = {
  sidebar: "bg-[#151517]/90 border-white/10", sidebarOpen: "bg-[#151517] border-white/10",
  soft: "text-[#8a8a8e]", strong: "text-white", border: "border-white/[0.08]", thumb: "bg-white/[0.05]",
  navIdle: "text-[#a1a1a6] hover:bg-white/[0.05]", navActive: "bg-white/[0.1] text-white",
  pill: "bg-white/[0.06] text-[#e5e5e7] ring-white/[0.1] hover:bg-white/[0.1]",
  mid: "text-[#c7c7cc]", hover: "hover:bg-white/[0.03]", modal: "bg-[#151517] text-[#f2f2f4] ring-white/[0.1]",
  chip: "bg-white/[0.08] text-[#d1d1d6]",
};

/* Which rows carry a figure — the same seven the dashboard badges, and read
   through rail-sections so the rails cannot drift apart again. */
function railCountOf(counts: RailCounts | null): RailCountMap {
  return counts
    ? {
        inquiries: counts.inquiries,
        contacts: counts.contacts,
        shipping: counts.shipping,
        trash: counts.trash,
        suppliers: counts.suppliers,
        videos: counts.videos,
        queue: counts.queue,
      }
    : {};
}

export function AdminRail({
  name,
  image,
  counts,
  supportsDark,
}: {
  name: string;
  image: string | null;
  /**
   * The figures beside the rows. Counted in the console layout rather than
   * here, because a rail cannot fetch its own numbers and every admin route
   * should show the same ones. Null when they could not be read, and then the
   * rail prints no figures at all rather than a row of zeroes that reads as
   * "nothing waiting". See lib/admin-rail-counts.ts.
   */
  counts: RailCounts | null;
  /** Whether the page beside the rail has a dark theme of its own to match. */
  supportsDark: boolean;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [darkPref, setDark] = useAdminDark();
  const dark = supportsDark && darkPref;
  const t = dark ? DARK : LIGHT;

  const sideRow = "flex w-full items-center rounded-xl px-1.5 py-2.5 text-[13px] font-medium transition-colors";
  const iconCol = "relative flex h-[22px] w-8 shrink-0 items-center justify-center";
  const label = `overflow-hidden whitespace-nowrap text-left transition-[max-width,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${
    open ? "ml-2.5 max-w-[190px] opacity-100" : "ml-0 max-w-0 opacity-0"
  }`;
  /* Collapses in height, not width: a zero-width heading still owns a line
     box, and the 60px rail would pay for five of them. Same as the
     dashboard’s — see sideGroupLabel there. */
  /* A count in two forms, exactly as the dashboard's rail shows it: a pill
     beside the label when the panel is open, and a dot on the icon when it is
     closed. The office reads these at a glance — how many new inquiries, how
     many unread messages — so they survive the collapse instead of leaving
     with the text. */
  const dotCls = `absolute -right-1.5 -top-1 min-w-[15px] rounded-full bg-brand-dark px-1 text-center text-[9px] font-bold leading-[15px] text-white transition-opacity duration-200 motion-reduce:transition-none ${open ? "opacity-0" : "opacity-100"}`;
  const pillCls = `shrink-0 overflow-hidden whitespace-nowrap rounded-full text-[11px] font-semibold leading-5 transition-[max-width,opacity,padding] duration-300 ease-out motion-reduce:transition-none ${t.chip} ${open ? "ml-1 max-w-[72px] px-2 opacity-100" : "ml-0 max-w-0 px-0 opacity-0"}`;
  /* The same collapse in the colour of something that needs a person: the
     queue's given-up-on count, which is not a workload figure but a backlog
     nobody else is going to notice. */
  const alertCls = `shrink-0 overflow-hidden whitespace-nowrap rounded-full bg-amber-500/15 text-[10.5px] font-bold leading-5 text-amber-700 transition-[max-width,opacity,padding] duration-300 ease-out motion-reduce:transition-none ${open ? "ml-1 max-w-[96px] px-2 opacity-100" : "ml-0 max-w-0 px-0 opacity-0"}`;

  const railCount = railCountOf(counts);
  const queueInvalid = counts?.queueInvalid ?? 0;

  const groupLabel = `overflow-hidden whitespace-nowrap px-1.5 text-[10px] font-bold uppercase tracking-[0.09em] transition-[max-height,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${t.soft} ${open ? "mb-0.5 max-h-5 opacity-100" : "mb-0 max-h-0 opacity-0"}`;

  const signOut = async () => {
    await signOutThrough("/api/auth/logout/", "admin");
    router.push("/admin/login/");
    router.refresh();
  };

  return (
    <div className="hidden w-[60px] shrink-0 rail:block">
      <aside
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocusCapture={() => setOpen(true)}
        // Only when focus actually leaves the rail: moving between two of its
        // links fires a blur too, and closing on that would shut it under a
        // keyboard user mid-Tab.
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
        }}
        className={`sticky top-0 z-40 flex h-screen flex-col overflow-hidden border-r backdrop-blur-xl transition-[width,box-shadow] duration-300 ease-out motion-reduce:transition-none ${
          open ? `w-[272px] shadow-2xl ${t.sidebarOpen}` : `w-[60px] ${t.sidebar}`
        }`}
      >
        <Link href="/admin/" className="flex items-center px-3.5 py-5">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.thumb}`}>
            <Image src="/logo.png" alt="Affhan" width={22} height={22} className="object-contain" />
          </span>
          <span className={`leading-tight ${label}`}>
            <span className={`block text-sm font-semibold tracking-tight ${t.strong}`}>Affhan</span>
            <span className={`block text-[11px] ${t.soft}`}>Admin</span>
          </span>
        </Link>

        {/* The same sections, in the same order, under the same headings as
            the dashboard's rail — both read RAIL_GROUPS, because a rail that
            rearranges itself when you open Staff is worse than one that was
            never grouped. */}
        <nav
          className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 ${
            open ? `console-scroll ${dark ? "console-scroll-dark" : ""}` : "scrollbar-hide"
          }`}
        >
          {RAIL_GROUPS.map((group, i) => (
            <div
              key={group.label ?? "top"}
              className={i === 0 ? "space-y-1" : `mt-1.5 space-y-1 border-t pt-1.5 ${t.border}`}
            >
              {group.label && <p className={groupLabel}>{group.label}</p>}
              {group.items.map((item: RailItem) => {
                // The dashboard's four are views on a page this is not, so
                // none of them is ever the current one here.
                const active = !item.view && pathname.startsWith(item.href);
                const count = railCount[item.key];
                const dot = counts ? railDotFor(item.key, railCount, queueInvalid) : undefined;
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    title={item.label}
                    aria-current={active ? "page" : undefined}
                    className={`${sideRow} ${active ? t.navActive : t.navIdle}`}
                  >
                    <span className={iconCol}>
                      <item.icon size={17} className={active ? "text-brand" : t.soft} />
                      {dot !== undefined && dot > 0 && <span className={dotCls}>{fmtRailBadge(dot)}</span>}
                      {item.key === "trip-lock" && <TripLockRailDot open={open} />}
                    </span>
                    <span className={`flex-1 ${label}`}>{item.label}</span>
                    {count !== undefined && <span className={pillCls}>{fmtRailNum(count)}</span>}
                    {item.key === "trip-lock" && <TripLockRailPill open={open} dark={dark} />}
                    {/* Beside the rotating figure rather than added to it: the
                        two numbers mean different things, and only one of them
                        is somebody's job to fix today. The word rides along
                        because two bare numbers side by side say nothing about
                        which is which. */}
                    {item.key === "queue" && queueInvalid > 0 && (
                      <span className={alertCls}>{fmtRailNum(queueInvalid)} invalid</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
          <div className="pb-2" />
        </nav>

        {/* One row, and what you can do with the account behind it — the same
            menu the dashboard shows. Change email and change password are
            dialogs that live on the dashboard, so from here they are links
            it opens on arrival. */}
        <div className={`border-t p-2 ${t.border}`}>
          <AccountMenu
            t={t}
            name={name}
            image={image}
            dark={dark}
            label={label}
            onToggleDark={supportsDark ? () => setDark((d) => !d) : undefined}
            onSignOut={() => void signOut()}
          />
        </div>
      </aside>
    </div>
  );
}

/**
 * The same navigation on a phone or a tablet, for every admin page that is not
 * the dashboard (which has its own Menu): a bar over the page with the console's
 * name and a Menu button, which opens a drawer with every row of the rail
 * (AdminRailList) and the account's actions. The rail is drawn only on a wide
 * screen with a mouse (rail: in globals.css); everywhere else these pages had
 * nothing but their own way back to the dashboard, so the trip's participants,
 * its lock and the team's pages could not be reached from one another on a
 * phone (the owner, 2026-10-12). Not sticky: some of these pages
 * have their own bar at the top, and two in one place would cover each other.
 */
export function AdminMobileBar({
  name,
  counts,
  supportsDark,
}: {
  name: string;
  counts: RailCounts | null;
  supportsDark: boolean;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [darkPref, setDark] = useAdminDark();
  const dark = supportsDark && darkPref;
  const t = dark ? DARK : LIGHT;
  const railCount = railCountOf(counts);
  // What the Menu button badges, as the dashboard's does: leads nobody has triaged yet.
  const waiting = (counts?.inquiries ?? 0) + (counts?.contacts ?? 0) + (counts?.shipping ?? 0);

  // Escape closes it, a new page closes it, and the page behind does not scroll under it (iOS).
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const signOut = async () => {
    await signOutThrough("/api/auth/logout/", "admin");
    router.push("/admin/login/");
    router.refresh();
  };
  const action = `flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold ring-1 transition-colors ${t.pill}`;
  const logo = (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.thumb}`}>
      <Image src="/logo.png" alt="" width={22} height={22} className="object-contain" />
    </span>
  );

  return (
    <div className="rail:hidden">
      <div className={`flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 ${t.sidebarOpen}`}>
        <Link href="/admin/" className="flex items-center gap-2.5">
          {logo}
          <span className="leading-tight">
            <span className={`block text-sm font-semibold tracking-tight ${t.strong}`}>Affhan</span>
            <span className={`block text-[11px] ${t.soft}`}>Admin</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="admin-page-nav"
          className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold shadow-sm ring-1 transition-colors ${t.pill}`}
        >
          <Menu size={16} />
          Menu
          {waiting > 0 && <span className="ml-0.5 rounded-full bg-brand-dark px-1.5 py-0.5 text-[10px] font-bold text-white">{fmtRailNum(waiting)}</span>}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[115]" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className={`absolute inset-0 h-full w-full cursor-default ${dark ? "bg-black/70" : "bg-slate-900/50"}`}
          />
          <div id="admin-page-nav" className={`admin-drawer absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col border-r shadow-2xl ${t.sidebarOpen} ${t.strong}`}>
            <div className={`flex items-center gap-2.5 border-b px-4 py-4 ${t.border}`}>
              {logo}
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold tracking-tight">{name}</p>
                <p className={`text-[11px] ${t.soft}`}>Administrator</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${t.thumb} ${t.soft}`}
              >
                <X size={17} />
              </button>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              <AdminRailList
                t={t}
                counts={railCount}
                queueInvalid={counts?.queueInvalid ?? 0}
                dark={dark}
                // The dashboard's views are pages of their own there, never the current one here.
                isActive={(item) => !item.view && pathname.startsWith(item.href)}
                onNavigate={() => setOpen(false)}
              />
            </nav>
            {/* The account's actions, as the dashboard's drawer has them; the two dialogs live on the
                dashboard, which opens them on arrival (?account=). */}
            <div className={`space-y-2 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${t.border}`}>
              <Link href="/admin/?account=email" onClick={() => setOpen(false)} className={action}>
                <Mail size={15} /> Change email
              </Link>
              <Link href="/admin/?account=password" onClick={() => setOpen(false)} className={action}>
                <KeyRound size={15} /> Change password
              </Link>
              <div className="flex gap-2">
                {supportsDark && (
                  <button type="button" onClick={() => setDark((d) => !d)} className={`flex-1 ${action}`}>
                    {dark ? <Sun size={15} /> : <Moon size={15} />}
                    {dark ? "Light" : "Dark"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-red-600"
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminRail;
