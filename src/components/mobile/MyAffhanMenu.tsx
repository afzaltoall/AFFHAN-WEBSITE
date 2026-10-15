"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, ChevronLeft, ChevronRight, CircleHelp, Clock, Heart, Info, MessageSquareText, Settings, Ship } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { avatarUrl } from "@/lib/avatar";
import { hasInSiteHistory } from "@/lib/inSiteHistory";
import { FacebookIcon, InstagramIcon, LinkedinIcon, TiktokIcon, TwitterXIcon, YouTubeIcon } from "@/components/ui/social-icons";
import { SOCIAL_PROFILES } from "@/lib/brand";
import { roboto } from "@/components/mobile/roboto";

/**
 * The phone frame's account tab, My AFFHAN, and its Settings, drawn as Alibaba.com's My Alibaba and Setting
 * screens are (the owner, 2026-10-15, with screenshots of both: "perfect same as alibaba"). Measured from those
 * screenshots (the owner's moto g45, 411px wide), in CSS px. Alibaba sizes its page in 750ths of the screen's
 * width, hence the fractions: a row is 110 of them, 60.34px there. Type sizes by ink width, their screenshot
 * against Roboto in our test browser at the phone's 1.75x (scratchpad job4/size-fit.mjs):
 *   - a 54px title bar in place of the frame's logo and search (lib/phoneChrome.ts, "titled"): a back arrow and
 *     the page's name, Roboto bold 15.91px #333, over a #e0e0e0 line;
 *   - who is signed in: a 52px round picture and the name, Roboto bold 17.55px #333, in a 76.8px row;
 *   - rows 60.34px tall with no lines between them: a 24px line icon in #333 from 19px, the label Roboto 15.36px
 *     #666 from 57px, sitting 2px above the row's middle, a slim chevron in #666 17px from the edge; groups
 *     parted by an 11.5px #f2f3f7 band;
 *   - Settings: rows of words only, from 18px, then Sign out in a 166.8x40.5 pill with a hairline #eeeeee
 *     edge, 21px below.
 * AFFHAN Shipping, the Free China Trip and Top Ranking are not here (the owner, 2026-10-15): the homepage's
 * "Ways to source" row and the trip banner carry them.
 *
 * Open to everyone, signed in or not: /account/ sends a visitor who is not to the sign-in page, and the rest of
 * AFFHAN must not be behind that.
 */

const PAGE = `${roboto.className} min-h-screen bg-white pt-[54px] md:bg-slate-50 md:pt-24`;
const COLUMN = "mx-auto max-w-lg bg-white md:overflow-hidden md:rounded-2xl md:ring-1 md:ring-slate-200/70";

/** The page's title bar. Back goes back a page when one of ours is behind it (lib/inSiteHistory.ts), else to `parent`. */
function TitleBar({ title, parent }: { title: string; parent: string }) {
  const router = useRouter();
  return (
    <header className="fixed inset-x-0 top-0 z-[100] flex h-[54px] items-center border-b border-[#e0e0e0] bg-white md:static md:z-auto">
      <button
        type="button"
        aria-label="Back"
        onClick={() => (hasInSiteHistory() ? router.back() : router.push(parent))}
        className="flex h-full w-[30px] shrink-0 items-center text-[#333333] active:opacity-60"
      >
        {/* Alibaba's arrow by ink: 9.2 x 16px, a 1.8px stroke. Their title sits 1.7px above the bar's middle. */}
        <ChevronLeft size={29} strokeWidth={1.5} aria-hidden />
      </button>
      <h1 className="relative -top-[1.9px] ml-px min-w-0 truncate text-[15.91px] font-bold text-[#333333]">{title}</h1>
    </header>
  );
}

/** One row: a line icon (or none, as Settings has), the label, a chevron. Another site opens in a tab of its own. */
function Row({ href, icon: Icon, label }: { href: string; icon?: LucideIcon; label: string }) {
  const cls = "flex h-[60.34px] w-full items-center bg-white pr-[17px] active:bg-[#f7f7f7]";
  const inner = (
    <>
      {Icon ? (
        <span className="ml-[19px] mr-[13px] flex size-6 shrink-0 items-center justify-center">
          <Icon size={24} strokeWidth={1.6} className="text-[#333333]" aria-hidden />
        </span>
      ) : (
        <span aria-hidden className="w-[18px] shrink-0" />
      )}
      <span className="relative -top-[2px] min-w-0 flex-1 truncate text-[15.36px] font-normal text-[#666666]">{label}</span>
      <ChevronRight size={26} strokeWidth={1.5} className="shrink-0 text-[#666666]" aria-hidden />
    </>
  );
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

function Band() {
  return <div aria-hidden className="h-[11.5px] bg-[#f2f3f7]" />;
}

/**
 * The account's picture, or, when there is none, Alibaba's: a pale head and shoulders on a grey disc, traced from
 * the owner's screenshot (a broad head with a square jaw, then the shoulders across the disc's foot).
 */
function Avatar({ image }: { image?: string | null }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl(image, 52) ?? image} alt="" width={52} height={52} referrerPolicy="no-referrer" className="size-[52px] shrink-0 rounded-full object-cover" />;
  }
  return (
    <span aria-hidden className="relative size-[52px] shrink-0 overflow-hidden rounded-full bg-[#edeaed]">
      <svg viewBox="0 0 52 52" className="absolute inset-0 size-full" fill="#faf8fa">
        <path d="M11.5 19.5a14.5 14 0 0 1 29 0V24c0 4.5-3 7.5-7.5 7.5H19c-4.5 0-7.5-3-7.5-7.5Z" />
        <rect x="18" y="31" width="16" height="9" />
        <rect x="2" y="39.5" width="48" height="20" rx="11" />
      </svg>
    </span>
  );
}

/** Who is signed in (their account), or the way in; until /me answers, what this device last saw (lib/firstPaintHints). */
function Who() {
  const { user, loading, hint } = useAuth();
  const face = user ?? (loading && hint && hint !== "signed-out" ? hint : null);
  const signedOut = !user && (!loading || hint === "signed-out");
  // The picture and name are centred on the row's top 75px, where Alibaba's are; the rest is space above the rows.
  const row = "flex h-[76.8px] items-center gap-[15px] bg-white pb-[1.8px] pl-[13px] pr-[17px]";
  const words = "min-w-0 flex-1 truncate text-[17.55px] font-bold text-[#333333]";
  if (face) {
    return (
      <Link href="/account/" aria-label={`${face.name}: your account`} className={`${row} active:bg-[#f7f7f7]`}>
        <Avatar image={face.profileImage} />
        <span className={words}>{face.name}</span>
      </Link>
    );
  }
  if (signedOut) {
    return (
      <Link href="/login/?redirect=%2Fme%2F" className={`${row} active:bg-[#f7f7f7]`}>
        <Avatar />
        <span className={words}>Sign in or Register</span>
      </Link>
    );
  }
  return (
    <div className={row}>
      <Avatar />
      <span aria-hidden className="h-4 w-36 animate-pulse rounded bg-[#f2f3f7]" />
    </div>
  );
}

/** Each of AFFHAN's profiles (brand.ts, as every listing names them), by the site it is on. */
const PLATFORMS: { host: string; name: string; Icon: (p: { className?: string }) => ReactNode }[] = [
  { host: "facebook.com", name: "Facebook", Icon: FacebookIcon },
  { host: "instagram.com", name: "Instagram", Icon: InstagramIcon },
  { host: "youtube.com", name: "YouTube", Icon: YouTubeIcon },
  { host: "linkedin.com", name: "LinkedIn", Icon: LinkedinIcon },
  { host: "tiktok.com", name: "TikTok", Icon: TiktokIcon },
  { host: "x.com", name: "X", Icon: TwitterXIcon },
];

/** AFFHAN's social profiles (the owner, 2026-10-13), in one row; each opens in a tab of its own. */
function Follow() {
  const links = PLATFORMS.flatMap((p) => {
    const href = SOCIAL_PROFILES.find((u) => new URL(u).hostname.replace(/^www\./, "") === p.host);
    return href ? [{ ...p, href }] : [];
  });
  return (
    <section aria-label="Follow AFFHAN" className="bg-white px-[18px] pb-4 pt-[14px]">
      <h2 className="text-[13px] font-normal text-[#999999]">Follow AFFHAN</h2>
      <ul className="mt-3 flex justify-between">
        {links.map(({ href, name, Icon }) => (
          <li key={name}>
            <a href={href} target="_blank" rel="noopener noreferrer" className="flex w-[52px] flex-col items-center gap-1.5 active:opacity-60">
              <span className="flex size-10 items-center justify-center rounded-full bg-[#f5f5f7] text-[#333333]">
                <Icon className="size-5" />
              </span>
              <span className="text-[11px] font-normal text-[#666666]">{name}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MyAffhanMenu() {
  return (
    <main className={PAGE}>
      <div className={COLUMN}>
        <TitleBar title="My AFFHAN" parent="/" />
        <Who />
        <Row href="/account/inquiries/" icon={MessageSquareText} label="My Inquiries" />
        <Row href="/account/shipments/" icon={Ship} label="My Shipments" />
        <Row href="/account/favourites/" icon={Heart} label="Favourites" />
        <Row href="/account/history/" icon={Clock} label="Browsing history" />
        <Row href="/about/" icon={Info} label="About Us" />
        <Row href="/careers/" icon={Briefcase} label="Careers" />
        <Row href="/contact/" icon={CircleHelp} label="Help & Contact" />
        <Band />
        <Row href="/me/settings/" icon={Settings} label="Settings" />
        <Band />
        <Follow />
        <p className="bg-white pb-6 pt-2 text-center text-[12px] font-normal text-[#999999]">AFFHAN International Pvt Ltd</p>
      </div>
    </main>
  );
}

/** Settings, as Alibaba's Setting screen: the policies, then Sign out for whoever is signed in. */
export function MyAffhanSettings() {
  const { user, logout } = useAuth();
  const router = useRouter();
  return (
    <main className={PAGE}>
      {/* Alibaba's first row starts half a pixel lower here than under My Alibaba's title bar. */}
      <div className={`${COLUMN} pb-8 pt-[0.5px]`}>
        <TitleBar title="Settings" parent="/me/" />
        <Row href="/privacy-policy/" label="Privacy Policy" />
        <Row href="/terms-conditions/" label="Terms & Conditions" />
        {user && (
          <div className="flex justify-center pt-[21.15px]">
            <button
              type="button"
              onClick={async () => {
                await logout();
                router.replace("/me/");
              }}
              className="h-[40.5px] w-[166.8px] rounded-full border-[0.5px] border-[#eeeeee] bg-white text-[15.36px] font-normal text-[#666666] active:bg-[#f7f7f7]"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
