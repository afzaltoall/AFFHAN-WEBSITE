"use client";

import { ArrowUpRight } from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  TiktokIcon,
  TwitterXIcon,
  YouTubeIcon,
} from "@/components/ui/social-icons";
import { Card, Fade, SectionHeader } from "@/components/account/AccountShell";

/**
 * Affhan's own channels, in the account area.
 *
 * The six URLs are the same ones the footer links and the Organization schema
 * declares — the real, verified profiles, not placeholders. Each row says what
 * that channel is actually for, because "we are on six platforms" is not a
 * reason for anyone to follow any of them.
 *
 * The handles live in src/lib/brand.ts; if one ever changes, change it there
 * and here together.
 */

const CHANNELS = [
  {
    name: "LinkedIn",
    handle: "affhanglobal",
    href: "https://www.linkedin.com/company/affhanglobal/",
    blurb: "Company updates, trade news, and freight capacity notices.",
    Icon: LinkedinIcon,
    tint: "bg-[#0A66C2]",
  },
  {
    name: "Instagram",
    handle: "@affhanglobal",
    href: "https://www.instagram.com/affhanglobal",
    blurb: "Factory visits, QC checks, and what we are shipping this week.",
    Icon: InstagramIcon,
    tint: "bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF]",
  },
  {
    name: "YouTube",
    handle: "@affhan_global",
    href: "https://www.youtube.com/@affhan_global",
    blurb: "Warehouse walkthroughs and how a sourcing order actually runs.",
    Icon: YouTubeIcon,
    tint: "bg-[#FF0000]",
  },
  {
    name: "Facebook",
    handle: "affhaninternational",
    href: "https://www.facebook.com/affhaninternational",
    blurb: "Announcements and the easiest place to message the office.",
    Icon: FacebookIcon,
    tint: "bg-[#1877F2]",
  },
  {
    name: "TikTok",
    handle: "@affhan_global",
    href: "https://www.tiktok.com/@affhan_global",
    blurb: "Short clips from Guangzhou — sourcing, packing, loading.",
    Icon: TiktokIcon,
    tint: "bg-slate-900",
  },
  {
    name: "X",
    handle: "@affhan_shipping",
    href: "https://x.com/affhan_shipping",
    blurb: "Freight rates, port delays, and shipping-line changes.",
    Icon: TwitterXIcon,
    tint: "bg-slate-900",
  },
] as const;

export default function SocialPage() {
  return (
    <Fade>
      <SectionHeader
        title="Social pages"
        subtitle="Where Affhan posts, and what each channel is for."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {CHANNELS.map(({ name, handle, href, blurb, Icon, tint }) => (
          <a
            key={name}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-3.5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.04] transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${tint}`}
            >
              <Icon className="h-[18px] w-[18px]" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-slate-900">{name}</span>
                <ArrowUpRight
                  size={14}
                  className="text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand"
                />
              </span>
              <span className="mt-0.5 block truncate text-[12px] font-medium text-brand">
                {handle}
              </span>
              <span className="mt-1.5 block text-[12px] leading-relaxed text-slate-500">
                {blurb}
              </span>
            </span>
          </a>
        ))}
      </div>

      <Card className="mt-4">
        <div className="p-5">
          <p className="text-sm font-semibold text-slate-800">Need an answer, not a feed?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            Social channels are not monitored for quotes. Raise an inquiry on the product, or use
            the contact page — both reach the sourcing team directly.
          </p>
        </div>
      </Card>
    </Fade>
  );
}
