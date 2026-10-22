"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardList, Loader2, LogOut, Search, UserRound } from "lucide-react";
import { PHONE_TABS_HEIGHT } from "@/lib/phoneChrome";

/**
 * The supplier portal's own bar (2026-10-21), in place of the shop's navbar, which hides on /supplier as it
 * does on the console and the staff desk: the shop's categories, quote buttons and customer sign-in mean
 * nothing to a supplier, and a second "Login" would be a different account from the one they are in.
 *
 * Three places, in the order a supplier uses them: the catalogue to apply from, what they have applied for
 * (with how many are still open), and their profile. On a phone the three are an app's tabs along the bottom,
 * as the shop's phone frame has its own (PhoneChrome), and the bar scrolls away with the page, so the
 * catalogue's search can hold the top (the owner, 2026-10-22: "alibaba style perfection").
 */
const LINKS = [
  { href: "/supplier/", label: "Find products", short: "Find products", icon: Search },
  { href: "/supplier/applications/", label: "My applications", short: "Applications", icon: ClipboardList },
  { href: "/supplier/profile/", label: "Profile", short: "Profile", icon: UserRound },
] as const;

export function SupplierTopBar({ companyName, name, openCount }: {
  /** Null until the first application asks for it. */
  companyName: string | null;
  name: string;
  openCount: number | null;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const bare = pathname.replace(/\/+$/, "") || "/";
  const isActive = (href: string) => bare === href.replace(/\/+$/, "");

  const signOut = async () => {
    setLeaving(true);
    await fetch("/api/supplier/auth/logout/", { method: "POST" }).catch(() => {});
    router.replace("/supplier/login/");
    router.refresh();
  };

  const badge = (href: string) =>
    href === "/supplier/applications/" && openCount ? (
      <span className="ml-1.5 rounded-full bg-brand px-1.5 py-px text-[11px] font-bold tabular-nums leading-4 text-white">{openCount}</span>
    ) : null;

  return (
    <>
      <header className="z-40 bg-[#0b2230] text-white shadow-[0_1px_0_rgba(255,255,255,0.06)] md:sticky md:top-0">
        <div className="flex h-14 items-center gap-4 px-4 sm:px-6 lg:px-8">
          {/* The door's emblem, the owner's delivery picture, rather than a second AFFHAN logo in the corner
              (the owner, 2026-10-21, on the sign-in: "remove that affhan" from the top left). */}
          <Link href="/supplier/" className="flex shrink-0 items-center gap-2.5 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70">
            <Image src="/images/supplier-mark.webp" alt="" width={34} height={34} className="h-[34px] w-[34px]" />
            <span className="text-[15px] font-extrabold tracking-tight">Supplier Centre</span>
          </Link>

          <nav aria-label="Supplier Centre" className="ml-4 hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href) ? "page" : undefined}
                className={`flex items-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors ${
                  isActive(l.href) ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                {l.label}
                {badge(l.href)}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-3">
            {/* Not beside the three links on a tablet, where they would wrap ("Find / products"). */}
            <div className="hidden min-w-0 text-right leading-tight sm:block md:hidden lg:block">
              <p className="truncate text-[13px] font-semibold">{companyName ?? name}</p>
              {companyName && <p className="truncate text-[11.5px] text-white/50">{name}</p>}
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={leaving}
              className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-white/[0.08] px-3.5 text-[13px] font-semibold text-white/85 ring-1 ring-white/10 transition-colors hover:bg-white/[0.14] hover:text-white disabled:opacity-60"
            >
              {leaving ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
              <span className="max-sm:sr-only">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* A phone: the three places along the bottom, as the shop's phone tabs (PhoneChrome's PhoneTabs); the room
          under the page for them is the layout's. The tab of the page one is on takes it back to its top. */}
      <nav aria-label="Supplier Centre" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="grid grid-cols-3" style={{ height: PHONE_TABS_HEIGHT }}>
          {LINKS.map((l) => {
            const active = isActive(l.href);
            const open = l.href === "/supplier/applications/" && openCount ? openCount : 0;
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={open ? `${l.short}, ${open} open` : undefined}
                  onClick={(e) => {
                    if (!active || window.scrollY < 8) return;
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${active ? "text-brand-dark" : "text-slate-500 active:text-slate-800"}`}
                >
                  <span className="relative">
                    <l.icon size={20} strokeWidth={active ? 2 : 1.5} aria-hidden="true" />
                    {open > 0 && (
                      <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-bold tabular-nums leading-4 text-white ring-2 ring-white">
                        {open > 99 ? "99+" : open}
                      </span>
                    )}
                  </span>
                  <span className={`whitespace-nowrap ${active ? "font-semibold" : ""}`}>{l.short}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
