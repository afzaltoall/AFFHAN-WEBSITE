"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOutThrough } from "@/lib/session-client";
import { useAdminDark } from "@/lib/useAdminDark";
import { AccountMenu } from "@/components/admin/AccountMenu";
import {
  RAIL_GROUPS, fmtRailBadge, fmtRailNum, railDotFor,
  type RailCountMap, type RailItem,
} from "@/components/admin/rail-sections";
import type { RailCounts } from "@/lib/admin-rail-counts";

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

  /* Which rows carry a figure — the same seven the dashboard badges, and read
     through rail-sections so the two rails cannot drift apart again. */
  const railCount: RailCountMap = counts
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
  const queueInvalid = counts?.queueInvalid ?? 0;

  const groupLabel = `overflow-hidden whitespace-nowrap px-1.5 text-[10px] font-bold uppercase tracking-[0.09em] transition-[max-height,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${t.soft} ${open ? "mb-0.5 max-h-5 opacity-100" : "mb-0 max-h-0 opacity-0"}`;

  const signOut = async () => {
    await signOutThrough("/api/auth/logout/", "admin");
    router.push("/admin/login/");
    router.refresh();
  };

  return (
    <div className="hidden w-[60px] shrink-0 lg:block">
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
                    </span>
                    <span className={`flex-1 ${label}`}>{item.label}</span>
                    {count !== undefined && <span className={pillCls}>{fmtRailNum(count)}</span>}
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

export default AdminRail;
