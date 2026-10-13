"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { Briefcase, ChevronRight, Clock, FileText, Heart, Info, LogOut, Mail, MessageSquareText, Settings, Ship, ShieldCheck, Trophy, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { MENU_TILE, MenuGlyph, MenuInkDefs, ShipEmblemGlyph } from "@/components/ui/MenuIcons";
import { TripDrawerLink, useTripLocked } from "@/components/ui/TripNavLink";
import { FacebookIcon, InstagramIcon, LinkedinIcon, TiktokIcon, TwitterXIcon, YouTubeIcon } from "@/components/ui/social-icons";
import { SOCIAL_PROFILES } from "@/lib/brand";

/**
 * The phone frame's Account tab (PhoneChrome), after Alibaba.com's "My Alibaba" (the owner, 2026-10-13):
 * who is signed in, or the way to sign in or register; then a buyer's own pages (inquiries, shipments,
 * favourites, history), the rest of AFFHAN, which the menu drawer held before a phone lost the navbar
 * (Shipping, the Free China Trip, Top Ranking, About, Careers, Help & Contact), and Settings. Open to
 * everyone, signed in or not: /account/ itself sends a visitor who is not to the sign-in page, and the
 * rest of AFFHAN must not be behind that. Its rows are the drawer's (MenuIcons), one family.
 */

function Row({ href, icon, glyph, label, note }: { href: string; icon?: LucideIcon; glyph?: ReactNode; label: string; note?: string }) {
  const cls =
    "group flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 text-[15px] font-semibold text-slate-700 transition-colors hover:bg-brand/5 hover:text-brand-dark active:bg-brand/5";
  const inner = (
    <>
      <span className={MENU_TILE}>{glyph ?? (icon ? <MenuGlyph icon={icon} /> : null)}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block">{label}</span>
        {note && <span className="mt-0.5 block text-[12px] font-medium text-slate-500">{note}</span>}
      </span>
      <ChevronRight size={16} className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
    </>
  );
  // Another site opens in a tab of its own, so this page is still here to come back to.
  if (/^https?:/.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mt-4 rounded-3xl bg-white p-1.5 ring-1 ring-slate-200/70">
      {title && <h2 className="px-3 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{title}</h2>}
      {children}
    </section>
  );
}

function Avatar({ name, image }: { name?: string | null; image?: string | null }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" width={52} height={52} referrerPolicy="no-referrer" className="h-13 w-13 shrink-0 rounded-full object-cover ring-1 ring-slate-200" />;
  }
  if (name) {
    return <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-brand/10 text-lg font-bold text-brand-dark">{name.charAt(0).toUpperCase()}</span>;
  }
  return (
    <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
      <User size={24} />
    </span>
  );
}

/** Each of AFFHAN's profiles (brand.ts, as every listing names them), by the site it is on: its mark and its name. */
const PLATFORMS: { host: string; name: string; Icon: (p: { className?: string }) => React.JSX.Element }[] = [
  { host: "facebook.com", name: "Facebook", Icon: FacebookIcon },
  { host: "instagram.com", name: "Instagram", Icon: InstagramIcon },
  { host: "youtube.com", name: "YouTube", Icon: YouTubeIcon },
  { host: "linkedin.com", name: "LinkedIn", Icon: LinkedinIcon },
  { host: "tiktok.com", name: "TikTok", Icon: TiktokIcon },
  { host: "x.com", name: "X", Icon: TwitterXIcon },
];

/**
 * Social platforms (the owner, 2026-10-13: "insert our social media links ... with the logos we already use in
 * the footer"): every profile, its mark in the footer's round button (white there on the footer's teal; here
 * on the menu's pale tile, in the brand teal), its name under it, three across. Each opens in a tab of its own.
 */
function SocialPlatforms() {
  const links = PLATFORMS.flatMap((p) => {
    const href: string | undefined = SOCIAL_PROFILES.find((u) => new URL(u).hostname.replace(/^www\./, "") === p.host);
    return href ? [{ ...p, href }] : [];
  });
  return (
    <section aria-label="Social platforms" className="mt-4 rounded-3xl bg-white p-1.5 ring-1 ring-slate-200/70">
      <h2 className="px-3 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Social platforms</h2>
      <ul className="grid grid-cols-3 gap-1 px-1.5 pb-2 pt-1">
        {links.map(({ href, name, Icon }) => (
          <li key={name}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 text-center transition-colors hover:bg-brand/5 active:bg-brand/5"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#eef6f9] text-[#176579] ring-1 ring-inset ring-[#d7ebf2] transition-all duration-300 group-hover:bg-[#27a8c4] group-hover:text-white group-hover:ring-transparent group-active:bg-[#27a8c4] group-active:text-white">
                <Icon />
              </span>
              <span className="text-[12.5px] font-semibold text-slate-700">{name}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MyAffhanMenu() {
  const { user, loading, hint } = useAuth();
  const lock = useTripLocked();
  // Until /me answers, what this device last saw (the navbar's own way: lib/firstPaintHints), so a
  // signed-in buyer is not shown "Sign in" for a moment.
  const face = user ?? (loading && hint && hint !== "signed-out" ? hint : null);
  const signedOut = !user && (!loading || hint === "signed-out");

  return (
    <main className="min-h-screen bg-slate-50 pt-(--nav-h) md:pt-24">
      <MenuInkDefs />
      <div className="mx-auto max-w-lg px-4 pb-10 pt-4">
        <h1 className="px-1 text-[20px] font-bold tracking-tight text-slate-900">My AFFHAN</h1>

        <section aria-label="Who is signed in" className="mt-3 flex items-center gap-3.5 rounded-3xl bg-white p-4 ring-1 ring-slate-200/70">
          <Avatar name={face?.name} image={face?.profileImage} />
          {face ? (
            <Link href="/account/" className="group flex min-w-0 flex-1 items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-bold text-slate-900">{face.name}</span>
                <span className="block truncate text-[13px] text-slate-500">{face.email ?? face.phone ?? "Signed in"}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-brand-dark">
                Profile <ChevronRight size={14} />
              </span>
            </Link>
          ) : signedOut ? (
            <div className="min-w-0 flex-1">
              <Link
                href="/login/?redirect=%2Fme%2F"
                className="inline-flex h-10 items-center justify-center rounded-full bg-brand-dark px-5 text-[14px] font-bold text-white transition-colors hover:bg-brand-deep active:bg-brand-deep"
              >
                Sign in or Register
              </Link>
              <p className="mt-1.5 text-[12.5px] text-slate-500">To track your quotes and keep the products you save.</p>
            </div>
          ) : (
            <span aria-hidden className="h-10 flex-1 animate-pulse rounded-full bg-slate-100" />
          )}
        </section>

        <Group title="My sourcing">
          <Row href="/account/inquiries/" icon={MessageSquareText} label="My Inquiries" />
          <Row href="/account/shipments/" icon={Ship} label="My Shipments" />
          <Row href="/account/favourites/" icon={Heart} label="Favourites" />
          <Row href="/account/history/" icon={Clock} label="Browsing history" />
        </Group>

        <Group title="AFFHAN">
          <Row href="/shipping/" glyph={<ShipEmblemGlyph />} label="AFFHAN Shipping" />
          <TripDrawerLink lock={lock} onClose={() => {}} />
          <Row href="/rankings/" icon={Trophy} label="Top Ranking" />
          <Row href="/about/" icon={Info} label="About Us" />
          <Row href="/careers/" icon={Briefcase} label="Careers" />
          <Row href="/contact/" icon={Mail} label="Help & Contact" note="Request a quote, or ask us anything" />
        </Group>

        <SocialPlatforms />

        <Group>
          <Row href="/me/settings/" icon={Settings} label="Settings" />
        </Group>

        <p className="mt-6 text-center text-[11px] text-slate-400">AFFHAN International Pvt Ltd</p>
      </div>
    </main>
  );
}

/** Settings, as Alibaba's: the policies, and signing out. */
export function MyAffhanSettings() {
  const { user, logout } = useAuth();
  const router = useRouter();
  return (
    <main className="min-h-screen bg-slate-50 pt-(--nav-h) md:pt-24">
      <MenuInkDefs />
      <div className="mx-auto max-w-lg px-4 pb-10 pt-4">
        <Link href="/me/" className="inline-flex items-center gap-1 px-1 text-[13px] font-semibold text-brand-dark">
          <ChevronRight size={14} className="rotate-180" /> My AFFHAN
        </Link>
        <h1 className="mt-1 px-1 text-[20px] font-bold tracking-tight text-slate-900">Settings</h1>
        <Group>
          <Row href="/privacy-policy/" icon={ShieldCheck} label="Privacy Policy" />
          <Row href="/terms-conditions/" icon={FileText} label="Terms & Conditions" />
        </Group>
        {user && (
          <section className="mt-4 rounded-3xl bg-white p-1.5 ring-1 ring-slate-200/70">
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace("/me/");
              }}
              className="flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 text-left text-[15px] font-semibold text-red-600 transition-colors hover:bg-red-50 active:bg-red-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 ring-1 ring-inset ring-red-100">
                <LogOut size={18} aria-hidden />
              </span>
              Log out
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
