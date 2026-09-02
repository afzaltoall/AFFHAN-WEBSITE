"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  Clock,
  Heart,
  LayoutDashboard,
  Loader2,
  LogOut,
  MessageSquareText,
  Share2,
  User2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { avatarUrl } from "@/lib/avatar";

/**
 * The shell every account page sits inside: one full-height sidebar, one
 * sign-in check.
 *
 * Laid out the way a marketplace account is: the sidebar is a column running
 * the height of the window against the left edge, not a card floating inside a
 * centred container. That matters beyond looks — the nav stays put while the
 * section scrolls, so moving between sections never means scrolling back up to
 * find the menu.
 *
 * A layout rather than five pages each drawing their own nav, so the sidebar
 * cannot drift between them and the redirect for a signed-out visitor is
 * written once. Each section is a real route, so "my inquiries" is a link
 * somebody can send themselves — which a tab switcher held in React state
 * would not be.
 */

type NavIcon = React.ComponentType<{ size?: number; className?: string }>;
interface NavItem {
  href: string;
  label: string;
  Icon: NavIcon;
}
interface NavGroup {
  id: string;
  label: string;
  Icon: NavIcon;
  items: NavItem[];
}

/** Two levels, because five flat rows hide the relationship between them. */
const GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    Icon: LayoutDashboard,
    items: [{ href: "/account/", label: "Account", Icon: User2 }],
  },
  {
    id: "inquiries",
    label: "Inquiries",
    Icon: MessageSquareText,
    items: [{ href: "/account/inquiries/", label: "My Inquiries", Icon: MessageSquareText }],
  },
  {
    id: "saved",
    label: "Saved & history",
    Icon: Heart,
    items: [
      { href: "/account/favourites/", label: "Favourites", Icon: Heart },
      { href: "/account/history/", label: "Browsing history", Icon: Clock },
    ],
  },
  {
    id: "more",
    label: "More",
    Icon: Share2,
    items: [{ href: "/account/social/", label: "Social pages", Icon: Share2 }],
  },
];

const ALL_ITEMS: NavItem[] = GROUPS.flatMap((g) => g.items);

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();

  // Every group open by default. Collapsing is for tidying a long list, not
  // for hiding what is there — a nav that starts closed makes people hunt.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Signed-out visitors have nothing to see here. `redirect` brings them back
  // to the section they asked for once they are in.
  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login/?redirect=${encodeURIComponent(pathname || "/account/")}`);
    }
  }, [loading, user, router, pathname]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 size={22} className="animate-spin text-slate-400" />
      </main>
    );
  }

  const initial = (user.name || user.phone || "?").charAt(0).toUpperCase();
  const isActive = (href: string) => pathname === href || pathname === href.slice(0, -1);

  return (
    // Full width, no centred max-w wrapper: the sidebar is meant to reach the
    // left edge of the window the way a marketplace console does.
    <div className="min-h-screen bg-slate-50 pt-16 lg:flex">
      {/* ---- Sidebar: full height, fixed, its own scroll ---- */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block">
        <div className="sticky top-16 flex h-[calc(100vh-4rem)] flex-col overflow-y-auto">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5">
            {user.profileImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl(user.profileImage, 44) ?? user.profileImage}
                alt=""
                width={44}
                height={44}
                referrerPolicy="no-referrer"
                className="h-11 w-11 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-base font-bold text-brand">
                {initial}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">{user.name}</p>
              <p className="truncate text-[12px] text-slate-500">
                {user.email ?? user.phone ?? "Signed in"}
              </p>
            </div>
          </div>

          <nav aria-label="Account sections" className="flex-1 px-3 py-4">
            {GROUPS.map((group) => {
              const open = !collapsed[group.id];
              // A group holding one item is a row, not a folder — expanding a
              // heading to reveal the same word underneath is a wasted click.
              const single = group.items.length === 1;

              if (single) {
                const item = group.items[0];
                return (
                  <SidebarLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    Icon={item.Icon}
                    active={isActive(item.href)}
                  />
                );
              }

              return (
                <div key={group.id} className="mt-1">
                  <button
                    onClick={() =>
                      setCollapsed((c) => ({ ...c, [group.id]: !c[group.id] }))
                    }
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 cursor-pointer"
                  >
                    <group.Icon size={17} className="shrink-0 text-slate-400" />
                    <span className="flex-1">{group.label}</span>
                    <ChevronDown
                      size={15}
                      className={`shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`}
                    />
                  </button>

                  {open && (
                    <div className="mt-0.5 space-y-0.5 pl-4">
                      {group.items.map((item) => (
                        <SidebarLink
                          key={item.href}
                          href={item.href}
                          label={item.label}
                          Icon={item.Icon}
                          active={isActive(item.href)}
                          nested
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="border-t border-slate-100 p-3">
            <button
              onClick={() => void logout()}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 cursor-pointer"
            >
              <LogOut size={17} className="shrink-0" />
              Log out
            </button>
          </div>
        </div>
      </aside>

      {/* ---- Narrow screens: the same sections as a scrolling row ---- */}
      <div className="border-b border-slate-200 bg-white lg:hidden">
        {/* min-w-0 on the scroller's parent chain is load-bearing: without it
            the row's full width becomes the page's width and the whole page
            scrolls sideways on a phone. */}
        <nav
          aria-label="Account sections"
          className="flex min-w-0 gap-2 overflow-x-auto px-4 py-3"
        >
          {ALL_ITEMS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors ${
                isActive(href)
                  ? "bg-brand text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Icon size={14} className="shrink-0" />
              <span className="whitespace-nowrap">{label}</span>
            </Link>
          ))}
          <button
            onClick={() => void logout()}
            className="flex shrink-0 items-center gap-2 rounded-full bg-red-50 px-3.5 py-2 text-[13px] font-medium text-red-600 transition-colors hover:bg-red-100 cursor-pointer"
          >
            <LogOut size={14} className="shrink-0" />
            <span className="whitespace-nowrap">Log out</span>
          </button>
        </nav>
      </div>

      {/* ---- Section ---- */}
      <main className="min-w-0 flex-1 px-4 pb-20 pt-6 sm:px-6 lg:px-10 lg:pt-8">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

function SidebarLink({
  href,
  label,
  Icon,
  active,
  nested,
}: {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  active: boolean;
  nested?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-brand/10 text-brand-dark"
          : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon
        size={nested ? 15 : 17}
        className={`shrink-0 ${active ? "text-brand" : "text-slate-400"}`}
      />
      {label}
    </Link>
  );
}
