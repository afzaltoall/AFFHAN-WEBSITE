"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardList, Loader2, LogOut, Search, UserRound } from "lucide-react";

/**
 * The supplier portal's own bar (2026-10-21), in place of the shop's navbar, which hides on /supplier as it
 * does on the console and the staff desk: the shop's categories, quote buttons and customer sign-in mean
 * nothing to a supplier, and a second "Login" would be a different account from the one they are in.
 *
 * Three places, in the order a supplier uses them: the catalogue to apply from, what they have applied for
 * (with how many are still open), and their profile. On a phone the three become a row of tabs under the bar.
 */
const LINKS = [
  { href: "/supplier/", label: "Find products", icon: Search },
  { href: "/supplier/applications/", label: "My applications", icon: ClipboardList },
  { href: "/supplier/profile/", label: "Profile", icon: UserRound },
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
    <header className="sticky top-0 z-40 bg-[#0b2230] text-white shadow-[0_1px_0_rgba(255,255,255,0.06)]">
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-4 px-4 sm:px-6">
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
              className={`flex items-center rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors ${
                isActive(l.href) ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {l.label}
              {badge(l.href)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-3">
          <div className="hidden min-w-0 text-right leading-tight sm:block">
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

      {/* A phone: the three places as tabs under the bar. */}
      <nav aria-label="Supplier Centre" className="grid grid-cols-3 border-t border-white/[0.07] md:hidden">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isActive(l.href) ? "page" : undefined}
            className={`relative flex items-center justify-center gap-1.5 py-2.5 text-[12.5px] font-semibold ${
              isActive(l.href) ? "text-white" : "text-white/55"
            }`}
          >
            <l.icon size={15} aria-hidden="true" />
            <span className="truncate">{l.label === "My applications" ? "Applications" : l.label}</span>
            {badge(l.href)}
            {isActive(l.href) && <span aria-hidden="true" className="absolute inset-x-6 bottom-0 h-[2px] rounded-full bg-brand" />}
          </Link>
        ))}
      </nav>
    </header>
  );
}
