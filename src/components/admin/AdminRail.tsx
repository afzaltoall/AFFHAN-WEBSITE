"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity, Globe, Inbox, LayoutList, LogOut, MessageSquare, Moon, PlayCircle, Smartphone, Sun, Timer, Trash2,
  TrendingUp, UserCog, Users, type LucideIcon,
} from "lucide-react";
import { signOutThrough } from "@/lib/session-client";
import { useAdminDark } from "@/lib/useAdminDark";

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

type Item = { href: string; label: string; icon: LucideIcon; match?: (path: string) => boolean };

const ITEMS: Item[] = [
  { href: "/admin/", label: "All", icon: LayoutList, match: () => false },
  { href: "/admin/?view=inquiries", label: "Inquiries", icon: Inbox, match: () => false },
  { href: "/admin/?view=contacts", label: "Contact Us", icon: MessageSquare, match: () => false },
  { href: "/admin/?view=trash", label: "Recently Deleted", icon: Trash2, match: () => false },
  { href: "/admin/suppliers/", label: "Suppliers", icon: Users },
  { href: "/admin/videos/", label: "Videos", icon: PlayCircle },
  { href: "/admin/users/website/", label: "Website Users", icon: Globe },
  { href: "/admin/users/app/", label: "App Users", icon: Smartphone },
  { href: "/admin/mobile-inquiries/", label: "App Inquiries", icon: MessageSquare },
  { href: "/admin/queue/", label: "Queue", icon: Timer },
  { href: "/admin/activity/", label: "Activity", icon: Activity },
  { href: "/admin/employees/", label: "Staff", icon: UserCog },
  { href: "/admin/team-performance/", label: "Team performance", icon: TrendingUp },
];

const LIGHT = {
  sidebar: "bg-white/80 border-black/[0.06]", sidebarOpen: "bg-white border-black/[0.06]",
  soft: "text-[#86868b]", strong: "text-[#1d1d1f]", border: "border-black/[0.06]", thumb: "bg-[#f5f5f7]",
  navIdle: "text-[#515154] hover:bg-black/[0.03]", navActive: "bg-[#ececed] text-[#1d1d1f]",
  pill: "bg-white text-[#1d1d1f] ring-black/[0.06] hover:bg-black/[0.02]",
};
const DARK = {
  sidebar: "bg-[#151517]/90 border-white/10", sidebarOpen: "bg-[#151517] border-white/10",
  soft: "text-[#8a8a8e]", strong: "text-white", border: "border-white/[0.08]", thumb: "bg-white/[0.05]",
  navIdle: "text-[#a1a1a6] hover:bg-white/[0.05]", navActive: "bg-white/[0.1] text-white",
  pill: "bg-white/[0.06] text-[#e5e5e7] ring-white/[0.1] hover:bg-white/[0.1]",
};

export function AdminRail({
  name,
  image,
  supportsDark,
}: {
  name: string;
  image: string | null;
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

        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2">
          {ITEMS.map((item) => {
            const active = item.match ? item.match(pathname) : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-current={active ? "page" : undefined}
                className={`${sideRow} ${active ? t.navActive : t.navIdle}`}
              >
                <span className={iconCol}>
                  <item.icon size={17} className={active ? "text-brand" : t.soft} />
                </span>
                <span className={`flex-1 ${label}`}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={`border-t p-2 ${t.border}`}>
          <div className="flex items-center px-1.5 py-2">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-black/10" />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/10">
                <Image src="/logo.png" alt="" width={26} height={26} className="object-contain" />
              </span>
            )}
            <span className={`min-w-0 flex-1 leading-tight ${label}`}>
              <span className={`block truncate text-[13px] font-semibold ${t.strong}`}>{name}</span>
              <span className={`block text-[11px] ${t.soft}`}>Administrator</span>
            </span>
          </div>
          {supportsDark && (
            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              title={dark ? "Light mode" : "Dark mode"}
              className={`mt-1 ${sideRow} justify-start font-semibold ring-1 ${t.pill}`}
            >
              <span className={iconCol}>{dark ? <Sun size={15} /> : <Moon size={15} />}</span>
              <span className={label}>{dark ? "Light" : "Dark"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            title="Sign out"
            className={`mt-2 ${sideRow} justify-start bg-red-500 font-semibold text-white hover:bg-red-600`}
          >
            <span className={iconCol}><LogOut size={15} /></span>
            <span className={label}>Sign out</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

export default AdminRail;
