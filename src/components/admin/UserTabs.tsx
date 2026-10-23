"use client";

import Link from "next/link";
import { Globe, MessageSquare, Smartphone, Users } from "lucide-react";

export type UserTab = "website" | "app" | "app-inquiries" | "all";

/**
 * The customers' pages, one tab bar: who signs in on the site, who signs in on the app and what they asked for
 * there, and every account (the owner, 2026-10-23: "App Inquiries inside App Users"). App inquiries sits beside
 * App users rather than in the rail, which lights App Users on it (rail-sections.ts). Every inquiry, website and
 * app, is also on the console's Inquiries list, each tagged with where it came from.
 */
export function UserTabs({ active }: { active: UserTab }) {
  return (
    <nav aria-label="Customers" className="mb-4 flex flex-wrap items-center gap-2">
      <Tab href="/admin/users/website/" active={active === "website"} Icon={Globe}>
        Website users
      </Tab>
      <Tab href="/admin/users/app/" active={active === "app"} Icon={Smartphone}>
        App users
      </Tab>
      <Tab href="/admin/mobile-inquiries/" active={active === "app-inquiries"} Icon={MessageSquare}>
        App inquiries
      </Tab>
      <Tab href="/admin/users/" active={active === "all"} Icon={Users}>
        All accounts
      </Tab>
    </nav>
  );
}

function Tab({ href, active, Icon, children }: { href: string; active: boolean; Icon: React.ComponentType<{ size?: number }>; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors ${
        active ? "bg-[#1d1d1f] text-white" : "bg-white text-[#1d1d1f] ring-1 ring-black/[0.06] hover:bg-black/[0.02]"
      }`}
    >
      <Icon size={14} />
      {children}
    </Link>
  );
}
